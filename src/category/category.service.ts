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

    return this.repo.find({
      where,
      order: { sort: 'ASC', id: 'ASC' },
    });
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
