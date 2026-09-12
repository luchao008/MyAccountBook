import { Provide, Inject } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from '../entity/transaction.entity';
import { Category } from '../entity/category.entity';
import { Account } from '../entity/account.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { PageResult } from '../interface';
import { AccountService } from '../account/account.service';
import {
  CreateTransactionDTO,
  UpdateTransactionDTO,
  QueryTransactionDTO,
} from './dto/transaction.dto';

@Provide()
export class TransactionService {
  @InjectDataSource()
  dataSource: DataSource;

  @Inject()
  accountService: AccountService;

  private get repo(): Repository<Transaction> {
    return this.dataSource.getRepository(Transaction);
  }

  private get categoryRepo(): Repository<Category> {
    return this.dataSource.getRepository(Category);
  }

  /**
   * 解析交易应归属的账本实体。
   *
   * 多账本改造的向后兼容关键点：不传 accountId 时回落到默认账本，
   * 这样改造前的前端（不传该字段）无需任何改动就能继续记账。
   *
   * 返回实体而非 ID：update 时需要用实体覆盖 entity.account 关系对象，
   * 否则 TypeORM 会拿旧的关系把外键回填回去（见下方 update 中的注释）。
   */
  private async resolveAccount(userId: string, accountId?: string): Promise<Account> {
    if (accountId) {
      // 校验账本归属，避免把交易记到别人的账本上
      return this.accountService.findById(userId, accountId);
    }

    const fallback = await this.accountService.getDefaultAccount(userId);
    if (!fallback) {
      throw new BusinessError('请先创建一个账本', ErrorCode.ACCOUNT_NOT_FOUND);
    }
    return fallback;
  }

  /**
   * 校验分类：
   *   1. 必须属于当前用户（数据隔离）
   *   2. 分类的收支类型必须与账单类型一致（对齐随手记交互）
   * 返回校验通过的分类，供调用方复用。
   */
  private async assertCategoryValid(
    userId: string,
    categoryId: string | null | undefined,
    type: 'income' | 'expense',
  ): Promise<Category | null> {
    if (!categoryId) {
      return null;
    }
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId, userId },
    });
    if (!category) {
      throw new BusinessError('分类不存在', ErrorCode.CATEGORY_NOT_FOUND);
    }
    if (category.type !== type) {
      throw new BusinessError('分类的收支类型与账单类型不一致', ErrorCode.PARAM_INVALID);
    }
    return category;
  }

  async create(userId: string, dto: CreateTransactionDTO) {
    await this.assertCategoryValid(userId, dto.categoryId, dto.type);
    const account = await this.resolveAccount(userId, dto.accountId);

    const entity = this.repo.create({
      userId,
      accountId: account.id,
      type: dto.type,
      amount: dto.amount,
      categoryId: dto.categoryId || null,
      recordDate: dto.recordDate,
      // 前端只传 HH:mm，TIME 列需要秒，这里统一补齐
      recordTime: dto.recordTime ? `${dto.recordTime}:00` : null,
      note: dto.note ?? '',
    });
    const saved = await this.repo.save(entity);
    return this.findById(userId, saved.id);
  }

  /**
   * 分页查询 + 多维筛选
   * 支持：时间范围、收支类型、分类、分页
   */
  async page(userId: string, query: QueryTransactionDTO): Promise<PageResult<Transaction>> {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'c')
      .leftJoinAndSelect('t.account', 'a')
      .where('t.userId = :userId', { userId });

    if (query.start) {
      qb.andWhere('t.recordDate >= :start', { start: query.start });
    }
    if (query.end) {
      qb.andWhere('t.recordDate <= :end', { end: query.end });
    }
    if (query.type) {
      qb.andWhere('t.type = :type', { type: query.type });
    }
    if (query.categoryId) {
      qb.andWhere('t.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    // 多账本：传了 accountId 才按账本过滤；不传返回全部账本（向后兼容）
    if (query.accountId) {
      qb.andWhere('t.accountId = :accountId', {
        accountId: query.accountId,
      });
    }

    // 时间倒序（贴合随手记"最近记录在前"）：
    // 同日期内按 record_time 倒序——MySQL DESC 排序中 NULL 靠后，
    // 即"没填时刻的排在同日填了时刻的后面"；再按 id 兜底
    qb.orderBy('t.recordDate', 'DESC')
      .addOrderBy('t.recordTime', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip((query.page - 1) * query.size)
      .take(query.size);

    const [list, total] = await qb.getManyAndCount();

    return {
      list,
      total,
      page: query.page,
      size: query.size,
    };
  }

  async findById(userId: string, id: string): Promise<Transaction> {
    const entity = await this.repo.findOne({
      where: { id, userId },
      relations: ['category', 'account'],
    });
    if (!entity) {
      throw new BusinessError('账单不存在', ErrorCode.TRANSACTION_NOT_FOUND);
    }
    return entity;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDTO) {
    const entity = await this.findById(userId, id);

    // 类型和分类可能被单独修改，需用"修改后的最终值"做一致性校验
    const finalType = dto.type ?? entity.type;
    const finalCategoryId = dto.categoryId !== undefined ? dto.categoryId : entity.categoryId;
    await this.assertCategoryValid(userId, finalCategoryId, finalType);

    const patch: Partial<Transaction> = {};
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.amount !== undefined) patch.amount = dto.amount;
    if (dto.recordDate !== undefined) patch.recordDate = dto.recordDate;
    if (dto.note !== undefined) patch.note = dto.note;
    if (dto.categoryId !== undefined) {
      const nextCategoryId = dto.categoryId || null;
      patch.categoryId = nextCategoryId;
      // 清空分类时必须同时断开关系对象，否则 TypeORM 会依据仍挂在实体上的
      // entity.category 把 category_id 回填成旧值，导致"清空"无效。
      if (!nextCategoryId) {
        entity.category = null;
      }
    }
    if (dto.accountId !== undefined) {
      // 传空字符串/null 表示改挂到默认账本。
      // 必须同时替换 entity.account 关系对象——findById 已经把旧的 account
      // 加载到实体上了，只改 accountId 会被 TypeORM 用旧关系回填（与清空分类同源）。
      const nextAccount = await this.resolveAccount(userId, dto.accountId || undefined);
      patch.accountId = nextAccount.id;
      entity.account = nextAccount;
    }
    if (dto.recordTime !== undefined) {
      // 传空字符串/null 表示清除已记录的时刻
      patch.recordTime = dto.recordTime ? `${dto.recordTime}:00` : null;
    }

    Object.assign(entity, patch);
    await this.repo.save(entity);
    return this.findById(userId, id);
  }

  async delete(userId: string, id: string) {
    await this.findById(userId, id);
    await this.repo.delete({ id, userId });
    return { success: true };
  }
}
