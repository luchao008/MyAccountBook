import { Provide } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Category } from '../entity/category.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { CreateCategoryDTO, UpdateCategoryDTO, QueryCategoryDTO } from './dto/category.dto';

/** 最多两级：二级分类下不允许再挂子分类 */
const MAX_DEPTH = 2;

@Provide()
export class CategoryService {
  @InjectDataSource()
  dataSource: DataSource;

  private get repo(): Repository<Category> {
    return this.dataSource.getRepository(Category);
  }

  /**
   * 分类列表：所有查询强制带 userId，实现数据隔离。
   * 按 sort 升序、id 升序排列（贴合随手记分类排序）。
   *
   * parentId 的三种取值：
   *   - 'root'  → 只返回一级分类
   *   - 具体 ID → 返回该父下的二级分类
   *   - 不传    → 返回全部（含 parentId 字段，前端可自行组装成树）
   */
  async list(userId: string, query: QueryCategoryDTO) {
    const where: Record<string, any> = { userId };
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

    // 可见性规则（实体注释里"放在查询侧做"的那条）：
    //   ① 自身未隐藏
    //   ② 若为二级分类，其父也未隐藏
    // 刻意**不给二级冗余写 is_hidden**：否则取消隐藏父级时还要回滚所有子分类，
    // 极易漏掉而留下"父可见、子却还隐藏着"的脏数据。
    const hiddenRootIds = (
      await this.repo.find({
        where: { userId, parentId: IsNull(), isHidden: true },
        select: ['id'],
      })
    ).map((c) => c.id);
    const hidden = new Set(hiddenRootIds);

    return rows.filter((c) => !c.isHidden && !(c.parentId && hidden.has(c.parentId)));
  }

  /** 批量取用户拥有的分类；有任何一个 id 不存在/不属于自己就整单报错。 */
  private async findOwned(userId: string, ids: string[]): Promise<Category[]> {
    const unique = [...new Set(ids)];
    const found = await this.findByIds(userId, unique);
    if (found.length !== unique.length) {
      // 不静默少删：少删会让前端提示的数量与用户预期不符，同时把越权尝试掩盖掉
      throw new BusinessError('部分分类不存在或不属于当前用户', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return found;
  }

  /**
   * 批量删除。
   *
   * 关键细节：**父子同时被选中时不能重复计数**。
   * 删除一级分类会被外键 CASCADE 掉它的二级分类，所以"父已被选中"的二级要从
   * 直接删除清单里剔除 —— 否则返回的数字会虚高，用户会以为多删了东西。
   */
  async batchDelete(userId: string, ids: string[]) {
    const found = await this.findOwned(userId, ids);

    const selected = new Set(found.map((c) => c.id));
    // 直接删的 = 被选中的一级 + "父没被选中"的被选中二级
    const roots = found.filter((c) => !c.parentId);
    const loneChildren = found.filter((c) => c.parentId && !selected.has(c.parentId));

    // 会被 CASCADE 一并删掉的二级分类数（供前端做提示）
    let cascaded = 0;
    if (roots.length) {
      cascaded = await this.repo.count({
        where: { userId, parentId: In(roots.map((c) => c.id)) },
      });
    }

    await this.repo.delete({
      userId,
      id: In([...roots.map((c) => c.id), ...loneChildren.map((c) => c.id)]),
    });

    return {
      success: true,
      // 实际消失的分类总数（含被级联删除的）
      deleted: roots.length + loneChildren.length + cascaded,
      // 其中因删除一级而连带删掉的二级数量
      deletedChildren: cascaded,
    };
  }

  /**
   * 批量隐藏 / 恢复显示。
   *
   * **不对"父已被选中"的子分类写 is_hidden**：一级隐藏后，其子分类由查询侧的
   * "父隐藏 ⇒ 子不可选"规则自动失效，无需冗余写。
   * 反过来，单独隐藏某个二级是允许的（它的 is_hidden 会被真实写入）。
   */
  async batchHide(userId: string, ids: string[], hidden: boolean) {
    const found = await this.findOwned(userId, ids);

    const selected = new Set(found.map((c) => c.id));
    const targets = found.filter((c) => !c.parentId || !selected.has(c.parentId));

    if (targets.length) {
      await this.repo.update({ userId, id: In(targets.map((c) => c.id)) }, { isHidden: hidden });
    }

    return { success: true, updated: targets.length, hidden };
  }

  async findById(userId: string, id: string) {
    const category = await this.repo.findOne({ where: { id, userId } });
    if (!category) {
      throw new BusinessError('分类不存在', ErrorCode.CATEGORY_NOT_FOUND);
    }
    return category;
  }

  /**
   * 校验父分类可用：必须存在、属于当前用户、且自身是一级分类。
   * 返回父分类实体；parentId 为空时返回 null。
   */
  private async resolveParent(userId: string, parentId?: string | null): Promise<Category | null> {
    if (!parentId) return null;

    const parent = await this.findById(userId, parentId);
    if (parent.parentId) {
      throw new BusinessError(
        `分类最多支持 ${MAX_DEPTH} 级，不能挂在二级分类下`,
        ErrorCode.PARAM_INVALID,
      );
    }
    return parent;
  }

  async create(userId: string, dto: CreateCategoryDTO) {
    // 唯一键校验（user_id + name），提前给出友好提示
    const exists = await this.repo.findOne({
      where: { userId, name: dto.name },
    });
    if (exists) {
      throw new BusinessError('分类名已存在', ErrorCode.CATEGORY_NAME_EXISTS);
    }

    const parent = await this.resolveParent(userId, dto.parentId);

    // 二级分类的收支类型必须与父一致，否则统计口径会打架
    if (parent && parent.type !== dto.type) {
      throw new BusinessError('二级分类的收支类型必须与父分类一致', ErrorCode.PARAM_INVALID);
    }

    const entity = this.repo.create({
      userId,
      name: dto.name,
      type: dto.type,
      icon: dto.icon ?? '',
      sort: dto.sort ?? 0,
      parentId: parent ? parent.id : null,
    });
    return this.repo.save(entity);
  }

  async update(userId: string, id: string, dto: UpdateCategoryDTO) {
    const category = await this.findById(userId, id);

    // 若改名字，检查是否与同用户下其他分类重名
    if (dto.name && dto.name !== category.name) {
      const exists = await this.repo.findOne({
        where: { userId, name: dto.name },
      });
      if (exists) {
        throw new BusinessError('分类名已存在', ErrorCode.CATEGORY_NAME_EXISTS);
      }
    }

    // 变更父子关系时做层级校验
    if (dto.parentId !== undefined) {
      const nextParentId = dto.parentId || null;

      if (nextParentId) {
        const parent = await this.resolveParent(userId, nextParentId);

        // 自身已有子分类 → 不能再挂到别人下面，否则会出现三级
        const childCount = await this.repo.count({
          where: { userId, parentId: category.id },
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
   * 删除分类。
   *
   * - 删除二级分类：直接删，其下交易变"未分类"（外键 ON DELETE SET NULL）
   * - 删除一级分类：其下二级分类一并删除（外键 CASCADE），所有相关交易同样变"未分类"
   * - 所有查询强制带 userId，防止越权删除他人分类
   */
  async delete(userId: string, id: string) {
    await this.findById(userId, id);

    const childCount = await this.repo.count({
      where: { userId, parentId: id },
    });

    await this.repo.delete({ id, userId });

    return {
      success: true,
      // 一并删掉的子分类数量，便于前端提示
      deletedChildren: childCount,
    };
  }

  /** 批量取分类（供统计聚合等处校验归属） */
  async findByIds(userId: string, ids: string[]): Promise<Category[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { userId, id: In(ids) } });
  }
}
