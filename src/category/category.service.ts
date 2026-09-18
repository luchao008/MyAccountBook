import { Provide } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Category } from '../entity/category.entity';
import { Account } from '../entity/account.entity';
import { Transaction } from '../entity/transaction.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import {
  CreateCategoryDTO,
  UpdateCategoryDTO,
  QueryCategoryDTO,
  ReorderCategoryDTO,
} from './dto/category.dto';

/** 最多两级：二级分类下不允许再挂子分类 */
const MAX_DEPTH = 2;

/**
 * 分类服务。
 *
 * ⚠️ **分类自 2026-09-16 起为账本级隔离**：每个账本拥有独立的一套分类。
 * 所有方法都必须带 `accountId`，并校验账本归属。见 docs/账本级分类设计文档.md。
 *
 * 关键约束（设计文档）：
 *   - D10：分类下已有交易则**禁止移除**（防止历史流水丢分类）
 *   - D16：**默认账本（母本）的分类不允许删除**（它是新建账本时的复制来源）
 *   - D15：唯一键是 (account_id, name) —— 账本内唯一，不同账本可有同名
 */
@Provide()
export class CategoryService {
  @InjectDataSource()
  dataSource: DataSource;

  private get repo(): Repository<Category> {
    return this.dataSource.getRepository(Category);
  }

  private get accountRepo(): Repository<Account> {
    return this.dataSource.getRepository(Account);
  }

  private get txnRepo(): Repository<Transaction> {
    return this.dataSource.getRepository(Transaction);
  }

  /** 校验账本属于当前用户，返回账本实体 */
  private async assertAccount(userId: string, accountId: string): Promise<Account> {
    if (!accountId) {
      throw new BusinessError('缺少 accountId', ErrorCode.PARAM_INVALID);
    }
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) {
      throw new BusinessError('账本不存在', ErrorCode.ACCOUNT_NOT_FOUND);
    }
    return account;
  }

  /**
   * 分类列表（限定账本）。
   *
   * parentId 的三种取值：
   *   - 'root'  → 只返回一级分类
   *   - 具体 ID → 返回该父下的二级分类
   *   - 不传    → 返回全部（含 parentId 字段，前端可自行组装成树）
   */
  async list(userId: string, query: QueryCategoryDTO) {
    const accountId = query.accountId;
    await this.assertAccount(userId, accountId);

    const where: Record<string, any> = { userId, accountId };
    if (query.type) {
      where.type = query.type;
    }

    if (query.parentId === 'root') {
      where.parentId = IsNull();
    } else if (query.parentId) {
      where.parentId = query.parentId;
    }

    const rows = await this.repo.find({
      where,
      order: { sort: 'ASC', id: 'ASC' },
    });

    if (query.visibility !== 'visible') return rows;

    // 可见性规则（同旧实现，只是把 userId 换成 accountId）：
    //   ① 自身未隐藏
    //   ② 若为二级分类，其父也未隐藏
    const hiddenRootIds = (
      await this.repo.find({
        where: { accountId, parentId: IsNull(), isHidden: true },
        select: ['id'],
      })
    ).map((c) => c.id);
    const hidden = new Set(hiddenRootIds);

    return rows.filter((c) => !c.isHidden && !(c.parentId && hidden.has(c.parentId)));
  }

  /** 批量取账本内的分类；有任何一个 id 不存在/不属于该账本就整单报错。 */
  private async findOwned(accountId: string, ids: string[]): Promise<Category[]> {
    const unique = [...new Set(ids)];
    const found = await this.findByIds(accountId, unique);
    if (found.length !== unique.length) {
      throw new BusinessError('部分分类不存在或不属于当前账本', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return found;
  }

  /**
   * 检查给定分类（含其子分类）下是否有交易；有则抛错。
   * 用于删除/移除前的保护（设计 D10）。
   */
  private async assertNoTransactions(
    userId: string,
    accountId: string,
    ids: string[],
  ): Promise<void> {
    // 把"一级分类"展开成"自身 + 其全部二级"
    const children = await this.repo.find({
      where: { accountId, parentId: In(ids) },
      select: ['id'],
    });
    const allIds = [...ids, ...children.map((c) => c.id)];
    // ⚠️ 只算**未删除**的交易（deletedAt: IsNull()）：
    //    软删除的流水已在回收站里，不该挡住分类删除。
    const count = await this.txnRepo.count({
      where: { userId, categoryId: In(allIds), deletedAt: IsNull() },
    });
    if (count > 0) {
      throw new BusinessError(
        `选中的分类下有 ${count} 笔交易，不能移除；请先处理这些交易`,
        ErrorCode.CATEGORY_HAS_TRANSACTIONS,
      );
    }
  }

  /**
   * 批量删除（限定账本）。
   *
   * 两道保护（设计 D10 / D16）：
   *   - 默认账本（母本）的分类**不允许删除**
   *   - 任一选中分类（含其子）下有交易 → **整单拒绝**
   *
   * 计数细节同旧实现：父子同时选中时不重复计数。
   */
  async batchDelete(userId: string, accountId: string, ids: string[]) {
    const account = await this.assertAccount(userId, accountId);
    if (account.isDefault) {
      throw new BusinessError('默认账本的分类不允许删除', ErrorCode.CATEGORY_DEFAULT_PROTECTED);
    }

    const found = await this.findOwned(accountId, ids);
    await this.assertNoTransactions(
      userId,
      accountId,
      found.map((c) => c.id),
    );

    const selected = new Set(found.map((c) => c.id));
    const roots = found.filter((c) => !c.parentId);
    const loneChildren = found.filter((c) => c.parentId && !selected.has(c.parentId));

    let cascaded = 0;
    if (roots.length) {
      cascaded = await this.repo.count({
        where: { accountId, parentId: In(roots.map((c) => c.id)) },
      });
    }

    await this.repo.delete({
      accountId,
      id: In([...roots.map((c) => c.id), ...loneChildren.map((c) => c.id)]),
    });

    return {
      success: true,
      deleted: roots.length + loneChildren.length + cascaded,
      deletedChildren: cascaded,
    };
  }

  /** 批量隐藏 / 恢复显示（限定账本）。语义不变。 */
  async batchHide(userId: string, accountId: string, ids: string[], hidden: boolean) {
    await this.assertAccount(userId, accountId);
    const found = await this.findOwned(accountId, ids);

    const selected = new Set(found.map((c) => c.id));
    const targets = found.filter((c) => !c.parentId || !selected.has(c.parentId));

    if (targets.length) {
      await this.repo.update({ accountId, id: In(targets.map((c) => c.id)) }, { isHidden: hidden });
    }

    return { success: true, updated: targets.length, hidden };
  }

  /**
   * 拖动排序：把某一层级下的分类按传入顺序重排，`sort` 归一化为 `0..n-1`。
   *
   * ────────────────────────────────────────────────────────────────────────
   * **作用域 = `(accountId, type, parentId)`**（原因见 `ReorderCategoryDTO` 注释）。
   *
   * 四道校验，任何一道不过就**整单拒绝**，不做部分写入：
   *
   *   ① 列表内有重复 id        → 40011
   *   ② id 不属于当前账本      → 40401（`findOwned` 已有语义）
   *   ③ id 落在作用域之外      → 40012（跨级 / 跨收支类型）
   *   ④ id 集合 ≠ 该层级全集   → 40013
   *
   * 为什么 ④ 必须拒绝而不是「按传入的重排、剩下的保持原样」：
   * 归一化会重写 `0..n-1`，未列出的分类原本的 sort 必然与新值撞车或错位，
   * 结果是一个**没人能预测的顺序**。宁可报错让客户端把全集补齐。
   *
   * 写入放在**一个事务**里：排序是多行的一致性约束，中途失败留下半套顺序
   * 比整体失败更难恢复（用户看不出哪几行是新的）。
   * ────────────────────────────────────────────────────────────────────────
   */
  async reorder(userId: string, dto: ReorderCategoryDTO) {
    const accountId = dto.accountId;
    await this.assertAccount(userId, accountId);

    const parentId = dto.parentId || null;

    // 排二级时必须校验父：存在、属于该账本、且自身是一级
    if (parentId) {
      const parent = await this.resolveParent(accountId, parentId);
      // 父的 type 与请求的 type 不一致 → 是在排「支出」却指定了收入父
      if (parent && parent.type !== dto.type) {
        throw new BusinessError(
          '指定的父分类与收支类型不一致',
          ErrorCode.CATEGORY_REORDER_LEVEL_MISMATCH,
        );
      }
    }

    // ① 重复
    const unique = new Set(dto.ids);
    if (unique.size !== dto.ids.length) {
      throw new BusinessError('排序列表里有重复的分类 ID', ErrorCode.CATEGORY_REORDER_DUPLICATE);
    }

    // ② 归属（任一 id 不属于该账本 → 40401）
    const found = await this.findOwned(accountId, dto.ids);

    // ③ 层级：先把该作用域的全集捞出来
    const scope = await this.repo.find({
      where: { accountId, type: dto.type, parentId: parentId ?? IsNull() },
      select: ['id', 'name'],
    });
    const scopeIds = new Set(scope.map((c) => c.id));

    const outsider = found.find((c) => !scopeIds.has(c.id));
    if (outsider) {
      throw new BusinessError(
        `分类「${outsider.name}」不属于本次排序的层级（不能跨层级拖动）`,
        ErrorCode.CATEGORY_REORDER_LEVEL_MISMATCH,
      );
    }

    // ④ 全集
    if (scopeIds.size !== dto.ids.length) {
      throw new BusinessError(
        `排序列表不完整：该层级共 ${scopeIds.size} 个分类，收到 ${dto.ids.length} 个`,
        ErrorCode.CATEGORY_REORDER_INCOMPLETE,
      );
    }

    // 写入：事务内按数组下标归一化为 0..n-1
    await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(Category);
      for (let i = 0; i < dto.ids.length; i += 1) {
        await repo.update({ id: dto.ids[i], accountId }, { sort: i });
      }
    });

    return { success: true, updated: dto.ids.length };
  }

  async findById(userId: string, accountId: string, id: string) {
    await this.assertAccount(userId, accountId);
    const category = await this.repo.findOne({ where: { id, accountId } });
    if (!category) {
      throw new BusinessError('分类不存在', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return category;
  }

  /** 校验父分类可用：必须存在、属于该账本、且自身是一级分类。 */
  private async resolveParent(
    accountId: string,
    parentId?: string | null,
  ): Promise<Category | null> {
    if (!parentId) return null;

    const parent = await this.repo.findOne({ where: { id: parentId, accountId } });
    if (!parent) {
      throw new BusinessError('分类不存在', ErrorCode.CATEGORY_NOT_FOUND);
    }
    if (parent.parentId) {
      throw new BusinessError(
        `分类最多支持 ${MAX_DEPTH} 级，不能挂在二级分类下`,
        ErrorCode.PARAM_INVALID,
      );
    }
    return parent;
  }

  async create(userId: string, dto: CreateCategoryDTO) {
    const accountId = dto.accountId;
    await this.assertAccount(userId, accountId);

    // 唯一键校验（account_id + name），提前给出友好提示
    const exists = await this.repo.findOne({
      where: { accountId, name: dto.name },
    });
    if (exists) {
      throw new BusinessError('分类名已存在', ErrorCode.CATEGORY_NAME_EXISTS);
    }

    const parent = await this.resolveParent(accountId, dto.parentId);

    if (parent && parent.type !== dto.type) {
      throw new BusinessError('二级分类的收支类型必须与父分类一致', ErrorCode.PARAM_INVALID);
    }

    const entity = this.repo.create({
      userId,
      accountId,
      name: dto.name,
      type: dto.type,
      icon: dto.icon ?? '',
      sort: dto.sort ?? 0,
      parentId: parent ? parent.id : null,
    });
    return this.repo.save(entity);
  }

  async update(userId: string, accountId: string, id: string, dto: UpdateCategoryDTO) {
    const category = await this.findById(userId, accountId, id);

    // 若改名字，检查是否与**同账本**下其他分类重名
    if (dto.name && dto.name !== category.name) {
      const exists = await this.repo.findOne({
        where: { accountId, name: dto.name },
      });
      if (exists) {
        throw new BusinessError('分类名已存在', ErrorCode.CATEGORY_NAME_EXISTS);
      }
    }

    if (dto.parentId !== undefined) {
      const nextParentId = dto.parentId || null;

      if (nextParentId) {
        const parent = await this.resolveParent(accountId, nextParentId);

        const childCount = await this.repo.count({
          where: { accountId, parentId: category.id },
        });
        if (childCount > 0) {
          throw new BusinessError(
            `该分类下还有 ${childCount} 个子分类，不能再挂到其他分类下`,
            ErrorCode.PARAM_INVALID,
          );
        }

        if (parent && parent.type !== (dto.type ?? category.type)) {
          throw new BusinessError('二级分类的收支类型必须与父分类一致', ErrorCode.PARAM_INVALID);
        }
      }

      category.parentId = nextParentId;
    }

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.sort !== undefined) category.sort = dto.sort;
    if (dto.type !== undefined) category.type = dto.type;

    return this.repo.save(category);
  }

  /**
   * 删除单个分类（限定账本）。
   *
   * 两道保护同 batchDelete：默认账本禁删（D16）、有交易禁删（D10）。
   */
  async delete(userId: string, accountId: string, id: string) {
    const account = await this.assertAccount(userId, accountId);
    if (account.isDefault) {
      throw new BusinessError('默认账本的分类不允许删除', ErrorCode.CATEGORY_DEFAULT_PROTECTED);
    }

    await this.findById(userId, accountId, id);
    await this.assertNoTransactions(userId, accountId, [id]);

    const childCount = await this.repo.count({
      where: { accountId, parentId: id },
    });

    await this.repo.delete({ id, accountId });

    return { success: true, deletedChildren: childCount };
  }

  /** 批量取分类（限定账本，供其他服务校验归属） */
  async findByIds(accountId: string, ids: string[]): Promise<Category[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { accountId, id: In(ids) } });
  }
}
