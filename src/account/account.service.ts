import { Provide } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { Account } from '../entity/account.entity';
import { IsNull } from 'typeorm';
import { Transaction } from '../entity/transaction.entity';
import { Category } from '../entity/category.entity';
import { rebuildAccountCategories } from '../category/category-rebuild';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { CreateAccountDTO, UpdateAccountDTO } from './dto/account.dto';

/** 系统自动创建的默认账本名 */
export const DEFAULT_ACCOUNT_NAME = '默认账本';

/**
 * 重复交易指纹。
 *
 * 严格全字段匹配（用户已确认的口径）：
 *   金额 + 记账日期 + 收支类型 + 分类 + 备注 全部相同，才判定为同一笔。
 * 只要分类或备注不同，就视为两笔不同的交易，合并时都保留。
 *
 * ⚠️ **分类用「名字」而非 id**（2026-09-16 账本级分类改造）：
 *   分类按账本隔离后，同名分类在不同账本是不同的行（不同 id）。
 *   若指纹用 id，源/目标"实质相同"的交易会因 id 不同而永远判不出重复 —— 去重失效。
 *   用分类名才能让跨账本的重复正确识别（D1 的"分类"指分类本身，不是某一行）。
 *
 * 用字符串拼接做指纹而非逐字段比较，是为了方便放进 Set 做 O(1) 查重。
 */
function fingerprint(t: Transaction, catName: Map<string, string>): string {
  const cat = t.categoryId ? (catName.get(t.categoryId) ?? '') : '';
  return [t.amount, t.recordDate, t.type, cat, t.note ?? ''].join('|');
}

export interface MergePreview {
  /** 源账本交易总数 */
  sourceTotal: number;
  /** 会迁入目标账本的笔数 */
  willMove: number;
  /** 因与目标重复而会被丢弃的笔数 */
  willSkip: number;
}

export interface MergeResult extends MergePreview {
  targetId: string;
  sourceId: string;
  sourceName: string;
}

@Provide()
export class AccountService {
  @InjectDataSource()
  dataSource: DataSource;

  private get repo(): Repository<Account> {
    return this.dataSource.getRepository(Account);
  }

  private get txnRepo(): Repository<Transaction> {
    return this.dataSource.getRepository(Transaction);
  }

  private get categoryRepo(): Repository<Category> {
    return this.dataSource.getRepository(Category);
  }

  /** 列表：按 sort 升序、id 升序 */
  async list(userId: string): Promise<Account[]> {
    return this.repo.find({ where: { userId }, order: { sort: 'ASC', id: 'ASC' } });
  }

  async findById(userId: string, id: string): Promise<Account> {
    const account = await this.repo.findOne({ where: { id, userId } });
    if (!account) {
      throw new BusinessError('账本不存在', ErrorCode.ACCOUNT_NOT_FOUND);
    }
    return account;
  }

  /**
   * 取默认账本。
   * 兜底策略：若因数据异常没有 isDefault 的账本，取排序第一个并补上标记，
   * 保证"每个用户必定有默认账本"这一不变量。
   */
  async getDefaultAccount(userId: string): Promise<Account> {
    let account = await this.repo.findOne({
      where: { userId, isDefault: true },
    });

    if (!account) {
      account = await this.repo.findOne({
        where: { userId },
        order: { sort: 'ASC', id: 'ASC' },
      });
      if (account) {
        account.isDefault = true;
        account = await this.repo.save(account);
      }
    }

    return account;
  }

  /**
   * 创建账本。
   *
   * 用户的第一个账本自动成为默认账本（母本）。
   *
   * ⚠️ 分类自 2026-09-16 起为账本级隔离：新建的**非默认账本**需要从
   * 母本（默认账本）复制选中的分类过来（见 docs/账本级分类设计文档.md D3/D6）。
   *   - dto.categoryIds 不传 → 复制母本全部（默认全选）
   *   - dto.categoryIds 传数组 → 只复制这些（一级会连带其下二级）
   */
  async create(userId: string, dto: CreateAccountDTO): Promise<Account> {
    const exists = await this.repo.findOne({
      where: { userId, name: dto.name },
    });
    if (exists) {
      throw new BusinessError('账本名已存在', ErrorCode.ACCOUNT_NAME_EXISTS);
    }

    const count = await this.repo.count({ where: { userId } });
    const account = this.repo.create({
      userId,
      name: dto.name,
      icon: dto.icon ?? '',
      sort: dto.sort ?? 0,
      isDefault: count === 0,
    });
    const saved = await this.repo.save(account);

    // 第一个账本（默认账本）本身是母本，不需要从别处复制；
    // 后续账本从母本复制选中的分类。
    if (count > 0) {
      await this.copyCategoriesFromDefault(userId, saved.id, dto.categoryIds);
    }

    return saved;
  }

  /**
   * 从默认账本（母本）复制分类到目标账本。
   *
   * @param categoryIds 要复制的分类 id（母本内的 id）。不传 = 全部。
   *                    传一级会连带其下二级（设计 D9）；只传二级会带上其父（D17）。
   */
  private async copyCategoriesFromDefault(
    userId: string,
    targetAccountId: string,
    categoryIds?: string[],
  ): Promise<void> {
    const defaultAccount = await this.getDefaultAccount(userId);
    if (!defaultAccount) return;

    const all = await this.categoryRepo.find({
      where: { accountId: defaultAccount.id },
      order: { sort: 'ASC', id: 'ASC' },
    });
    if (!all.length) return;

    // 计算要复制的集合：不传 = 全部；传了则展开（一级连带二级、二级带父）
    let selected: Set<string>;
    if (!categoryIds || !categoryIds.length) {
      selected = new Set(all.map((c) => c.id));
    } else {
      selected = new Set(categoryIds);
      const byId = new Map(all.map((c) => [c.id, c]));
      for (const id of categoryIds) {
        const cat = byId.get(id);
        if (!cat) continue;
        if (!cat.parentId) {
          // 一级 → 连带其下全部二级
          for (const child of all) {
            if (child.parentId === cat.id) selected.add(child.id);
          }
        } else {
          // 二级 → 带上其父（D17，避免孤儿）
          selected.add(cat.parentId);
        }
      }
    }

    const toCopy = all.filter((c) => selected.has(c.id));
    if (!toCopy.length) return;

    // 先复制一级，拿到新 id 后再复制二级（parent_id 要指向新行）
    const roots = toCopy.filter((c) => !c.parentId);
    const children = toCopy.filter((c) => c.parentId);

    const rootIdMap = new Map<string, string>();
    for (const r of roots) {
      const saved = await this.categoryRepo.save(
        this.categoryRepo.create({
          userId,
          accountId: targetAccountId,
          name: r.name,
          type: r.type,
          icon: r.icon,
          sort: r.sort,
          parentId: null,
          isHidden: r.isHidden,
        }),
      );
      rootIdMap.set(r.id, saved.id);
    }

    for (const c of children) {
      // 父没被复制（理论上不会，因为上面会带上父）→ 跳过，避免孤儿
      const newParentId = rootIdMap.get(c.parentId!);
      if (!newParentId) continue;
      await this.categoryRepo.save(
        this.categoryRepo.create({
          userId,
          accountId: targetAccountId,
          name: c.name,
          type: c.type,
          icon: c.icon,
          sort: c.sort,
          parentId: newParentId,
          isHidden: c.isHidden,
        }),
      );
    }
  }

  async update(userId: string, id: string, dto: UpdateAccountDTO): Promise<Account> {
    const account = await this.findById(userId, id);

    if (dto.name && dto.name !== account.name) {
      const exists = await this.repo.findOne({
        where: { userId, name: dto.name },
      });
      if (exists) {
        throw new BusinessError('账本名已存在', ErrorCode.ACCOUNT_NAME_EXISTS);
      }
    }

    // 设为默认账本时，需要先把其他账本的默认标记清掉
    if (dto.isDefault === true && !account.isDefault) {
      await this.repo.update({ userId, isDefault: true }, { isDefault: false });
      account.isDefault = true;
    }

    if (dto.name !== undefined) account.name = dto.name;
    if (dto.icon !== undefined) account.icon = dto.icon;
    if (dto.sort !== undefined) account.sort = dto.sort;

    return this.repo.save(account);
  }

  /** 删除前预检：告诉前端会连带删除多少笔交易，供确认弹窗展示 */
  async previewDelete(userId: string, id: string): Promise<{ transactionCount: number }> {
    const account = await this.findById(userId, id);
    const count = await this.repo.count({ where: { userId } });
    if (count <= 1) {
      throw new BusinessError('至少需要保留一个账本', ErrorCode.ACCOUNT_LAST_ONE);
    }
    /*
     * ⚠️ 只算**未删除**的交易（deletedAt: IsNull()）：
     *    软删除的流水已经在回收站里了，把它们算进"将连带删除 N 笔"会让用户困惑。
     */
    const transactionCount = await this.txnRepo.count({
      where: { userId, accountId: account.id, deletedAt: IsNull() },
    });
    return { transactionCount };
  }

  /**
   * 删除账本：连带删除其下全部交易（外键 ON DELETE CASCADE）。
   *
   * 防误删两道校验：
   *   1. 必须传入与账本名完全一致的 confirmName
   *   2. 不能删除最后一个账本
   * 若删的是默认账本，会把默认标记转给剩余账本中的第一个。
   */
  async remove(
    userId: string,
    id: string,
    confirmName: string,
  ): Promise<{ success: boolean; deletedTransactions: number }> {
    const account = await this.findById(userId, id);

    if (confirmName !== account.name) {
      throw new BusinessError(
        `确认名称与账本名不一致，请准确输入「${account.name}」`,
        ErrorCode.ACCOUNT_CONFIRM_MISMATCH,
      );
    }

    const count = await this.repo.count({ where: { userId } });
    if (count <= 1) {
      throw new BusinessError('至少需要保留一个账本', ErrorCode.ACCOUNT_LAST_ONE);
    }

    // ⚠️ 同 previewDelete：只算未删除的（软删除的已在回收站）
    const deletedTransactions = await this.txnRepo.count({
      where: { userId, accountId: account.id, deletedAt: IsNull() },
    });
    const wasDefault = account.isDefault;

    await this.repo.remove(account);

    if (wasDefault) {
      const next = await this.repo.findOne({
        where: { userId },
        order: { sort: 'ASC', id: 'ASC' },
      });
      if (next) {
        next.isDefault = true;
        await this.repo.save(next);
        // 设计 D14：新默认账本 = 新母本，从 preset 重建为全套分类
        // （它原本可能只是子集，重建后保证新建账本能拿到完整母本）
        await rebuildAccountCategories(this.dataSource, userId, next.id);
      }
    }

    return { success: true, deletedTransactions };
  }

  /**
   * 合并预检：不动数据，只算「会迁多少笔、会去重多少笔」。
   * 前端在弹窗里展示这份报告，用户确认后才调 merge。
   */
  async previewMerge(userId: string, targetId: string, sourceId: string): Promise<MergePreview> {
    if (targetId === sourceId) {
      throw new BusinessError('不能把账本合并到它自己', ErrorCode.ACCOUNT_MERGE_SELF);
    }
    await this.findById(userId, targetId);
    await this.findById(userId, sourceId);

    /*
     * ⚠️ 只取**未删除**的交易：回收站里的那些不该参与合并去重 ——
     *    它们已经"不属于用户的可见数据"，参与指纹比对会凭空吃掉正常流水。
     */
    const [targetTxns, sourceTxns, cats] = await Promise.all([
      this.txnRepo.find({ where: { userId, accountId: targetId, deletedAt: IsNull() } }),
      this.txnRepo.find({ where: { userId, accountId: sourceId, deletedAt: IsNull() } }),
      this.categoryRepo.find({
        where: [{ accountId: targetId }, { accountId: sourceId }],
        select: ['id', 'name'],
      }),
    ]);

    // 分类 id → 名字（指纹用名字，见 fingerprint 注释）
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    const existing = new Set(targetTxns.map((t) => fingerprint(t, catName)));
    let willSkip = 0;
    for (const t of sourceTxns) {
      if (existing.has(fingerprint(t, catName))) willSkip++;
    }

    return {
      sourceTotal: sourceTxns.length,
      willMove: sourceTxns.length - willSkip,
      willSkip,
    };
  }

  /**
   * 合并账本：把源账本的交易并入目标账本，然后删除源账本。
   *
   * 规则（用户已确认）：
   *   - 去重口径：金额+日期+类型+分类+备注 全相同才算重复
   *   - 重复的交易：丢弃源账本那条，保留目标账本那条
   *   - 金额/日期"冲突"不存在取舍问题——只要任一字段不同就不算重复，两笔都保留
   *   - 源账本内部自带的重复不处理（合并只解决两个账本之间的重复，
   *     不擅自整理单个账本内部）
   *   - 合并完成后删除源账本
   *
   * 整个过程放在一个事务里，任何一步失败都整体回滚。
   */
  async merge(userId: string, targetId: string, sourceId: string): Promise<MergeResult> {
    if (targetId === sourceId) {
      throw new BusinessError('不能把账本合并到它自己', ErrorCode.ACCOUNT_MERGE_SELF);
    }

    const target = await this.findById(userId, targetId);
    const source = await this.findById(userId, sourceId);

    return this.dataSource.transaction(async (manager) => {
      const txnRepo = manager.getRepository(Transaction);
      const accountRepo = manager.getRepository(Account);
      const catRepo = manager.getRepository(Category);

      // ⚠️ 同 previewMerge：只取未删除的（回收站里的不参与合并）
      const targetTxns = await txnRepo.find({
        where: { userId, accountId: targetId, deletedAt: IsNull() },
      });
      const sourceTxns = await txnRepo.find({
        where: { userId, accountId: sourceId, deletedAt: IsNull() },
      });

      /*
       * 分类自 2026-09-16 起为账本级隔离（设计 D7）：
       * 源账本的交易指向源账本的分类行，迁到目标账本后必须改指目标账本的对应分类。
       * 规则：按 name 在目标账本找同名分类；找不到就把源分类复制一份到目标账本。
       * 为此先建"源分类 id → 目标分类 id"的映射。
       */
      const [sourceCats, targetCats] = await Promise.all([
        catRepo.find({ where: { accountId: sourceId } }),
        catRepo.find({ where: { accountId: targetId } }),
      ]);

      const targetByName = new Map(targetCats.map((c) => [c.name, c]));
      const catIdMap = new Map<string, string>(); // 源分类 id → 目标分类 id
      // 指纹用分类名（见 fingerprint 注释）：覆盖源+目标两账本的分类
      const catName = new Map([...sourceCats, ...targetCats].map((c) => [c.id, c.name]));

      // 先处理一级（parent 为空），再处理二级，保证复制时父已存在
      const sourceRoots = sourceCats.filter((c) => !c.parentId);
      const sourceChildren = sourceCats.filter((c) => c.parentId);

      for (const src of sourceRoots) {
        const hit = targetByName.get(src.name);
        if (hit) {
          catIdMap.set(src.id, hit.id);
        } else {
          const created = await catRepo.save(
            catRepo.create({
              userId,
              accountId: targetId,
              name: src.name,
              type: src.type,
              icon: src.icon,
              sort: src.sort,
              parentId: null,
              isHidden: src.isHidden,
            }),
          );
          catIdMap.set(src.id, created.id);
        }
      }

      for (const src of sourceChildren) {
        // 父若没映射（理论上不会），跳过以免产生孤儿
        const newParentId = catIdMap.get(src.parentId!);
        if (!newParentId) continue;
        const hit = targetCats.find((c) => c.name === src.name && c.parentId === newParentId);
        if (hit) {
          catIdMap.set(src.id, hit.id);
        } else {
          const created = await catRepo.save(
            catRepo.create({
              userId,
              accountId: targetId,
              name: src.name,
              type: src.type,
              icon: src.icon,
              sort: src.sort,
              parentId: newParentId,
              isHidden: src.isHidden,
            }),
          );
          catIdMap.set(src.id, created.id);
        }
      }

      // 目标账本现有交易的指纹集合
      const existing = new Set(targetTxns.map((t) => fingerprint(t, catName)));

      let moved = 0;
      let skipped = 0;
      const toMove: Transaction[] = [];
      const toRemove: Transaction[] = [];

      for (const t of sourceTxns) {
        if (existing.has(fingerprint(t, catName))) {
          // 目标已有完全相同的记录：源这条直接删除
          toRemove.push(t);
          skipped++;
        } else {
          t.accountId = targetId;
          // 分类改指目标账本的对应分类（同账本不变量）
          if (t.categoryId) {
            const mapped = catIdMap.get(t.categoryId);
            t.categoryId = mapped ?? null;
          }
          toMove.push(t);
          moved++;
        }
      }

      if (toRemove.length) {
        await txnRepo.remove(toRemove);
      }
      if (toMove.length) {
        await txnRepo.save(toMove);
      }

      // 源账本已完成使命，删除（其下剩余交易由外键 CASCADE 兜底，理论上已清空）
      await accountRepo.remove(source);

      return {
        targetId: target.id,
        sourceId: source.id,
        sourceName: source.name,
        sourceTotal: sourceTxns.length,
        willMove: moved,
        willSkip: skipped,
      };
    });
  }

  /** 批量取账本（供其他地方校验归属用） */
  async findByIds(userId: string, ids: string[]): Promise<Account[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { userId, id: In(ids) } });
  }

  /**
   * 分类候选：返回默认账本（母本）的全部分类。
   *
   * 供两处使用（设计 D6/D13）：
   *   · 新建账本页 —— 勾选要复制到新账本的分类（默认全选）
   *   · 账本分类设置页 —— 从母本批量导入
   */
  async categoryCandidates(userId: string): Promise<Category[]> {
    const defaultAccount = await this.getDefaultAccount(userId);
    if (!defaultAccount) return [];
    return this.categoryRepo.find({
      where: { accountId: defaultAccount.id },
      order: { sort: 'ASC', id: 'ASC' },
    });
  }

  /**
   * 从母本（默认账本）批量复制分类到指定账本（设计 D13）。
   *
   * 幂等性：同名分类已存在时会被唯一键挡住（copyCategoriesFromDefault 复制前
   * 不做去重，因此重复导入同名分类会报错）。前端应只提交"目标账本还没有的"。
   */
  async importCategoriesFromDefault(
    userId: string,
    targetAccountId: string,
    categoryIds: string[],
  ): Promise<{ imported: number }> {
    const target = await this.findById(userId, targetAccountId);
    const before = await this.categoryRepo.count({ where: { accountId: target.id } });
    await this.copyCategoriesFromDefault(userId, target.id, categoryIds);
    const after = await this.categoryRepo.count({ where: { accountId: target.id } });
    return { imported: after - before };
  }
}
