import { Provide, Inject } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
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
  SummaryQueryDTO,
  SummaryUnit,
} from './dto/transaction.dto';

/**
 * 分组粒度 → MySQL DATE_FORMAT 表达式。
 *
 * 放在模块级常量而不是方法里：它是 SQL 片段、不含运行时变量，
 * 写进方法内每次调用都会重建，且容易被人误以为"可以按用户传参拼接"（那是注入风险）。
 */
const GROUP_FORMAT: Record<SummaryUnit, string> = {
  year: "DATE_FORMAT(t.record_date, '%Y')",
  quarter: "CONCAT(DATE_FORMAT(t.record_date, '%Y'), '-Q', QUARTER(t.record_date))",
  month: "DATE_FORMAT(t.record_date, '%Y-%m')",
  week: "CONCAT(DATE_FORMAT(t.record_date, '%x'), '-W', LPAD(WEEK(t.record_date, 3), 2, '0'))",
  day: "DATE_FORMAT(t.record_date, '%Y-%m-%d')",
};

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
   *   1. 必须属于**同一个账本**（分类自 2026-09-16 起为账本级隔离，见设计文档）
   *   2. 分类的收支类型必须与账单类型一致（对齐随手记交互）
   * 返回校验通过的分类，供调用方复用。
   */
  private async assertCategoryValid(
    accountId: string,
    categoryId: string | null | undefined,
    type: 'income' | 'expense',
  ): Promise<Category | null> {
    if (!categoryId) {
      return null;
    }
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId, accountId },
    });
    if (!category) {
      throw new BusinessError('分类不存在或不属于该账本', ErrorCode.CATEGORY_NOT_FOUND);
    }
    if (category.type !== type) {
      throw new BusinessError('分类的收支类型与账单类型不一致', ErrorCode.PARAM_INVALID);
    }
    return category;
  }

  async create(userId: string, dto: CreateTransactionDTO) {
    const account = await this.resolveAccount(userId, dto.accountId);
    await this.assertCategoryValid(account.id, dto.categoryId, dto.type);

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

  /** 分页查询 + 多维筛选（支持：时间/类型/分类多选/账本/关键词/金额区间/排序） */
  async page(userId: string, query: QueryTransactionDTO): Promise<PageResult<Transaction>> {
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'c')
      .leftJoinAndSelect('t.account', 'a');

    applyFilters(qb, userId, query);
    applyOrder(qb, query.order);

    qb.skip((query.page - 1) * query.size).take(query.size);

    const [list, total] = await qb.getManyAndCount();

    return {
      list,
      total,
      page: query.page,
      size: query.size,
    };
  }

  /**
   * 按粒度分组汇总（流水页主列表）。
   *
   * 一条 SQL 覆盖五种粒度 —— 差别只是 `DATE_FORMAT` 的格式串：
   *   year    → %Y           2026
   *   quarter → CONCAT(%Y,-Q,QUARTER)  2026-Q3
   *   month   → %Y-%m        2026-09
   *   week    → %x-%v        ISO 周（周一为起点，与首页"本周"口径一致）
   *   day     → %Y-%m-%d     2026-09-14
   *
   * ⚠️ 用 `DATE_FORMAT` 而不是 `YEAR()/MONTH()`：后者要拼多列，
   *    且周/季无法用单列表达，五种粒度就没法收敛成同一段代码。
   *
   * 返回按**时间倒序**（最近的组在前，与列表一致）。
   */
  async summary(userId: string, query: SummaryQueryDTO) {
    // 分组维度二选一：按时间 / 按分类（见 DTO 注释，两者互斥）
    if (query.groupBy === 'category') {
      return this.summaryByCategory(userId, query);
    }

    const unit = query.unit as SummaryUnit;
    const groupExpr = GROUP_FORMAT[unit];

    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoin('t.category', 'c')
      .select(`${groupExpr}`, 'groupKey')
      .addSelect("COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)", 'income')
      .addSelect(
        "COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)",
        'expense',
      )
      .addSelect('COUNT(*)', 'count')
      .groupBy(groupExpr)
      // ⚠️ 别名不能叫 `key`：它是 MariaDB 的保留字，`AS key` 直接语法错误（实测 500）。
      // 用 groupKey，返回给前端时再映射回 `key`。
      .orderBy('groupKey', 'DESC');

    applyFilters(qb, userId, query);

    const rows = await qb.getRawMany();

    return rows.map((r: any) => {
      const income = Number(r.income).toFixed(2);
      const expense = Number(r.expense).toFixed(2);
      return {
        key: r.groupKey,
        unit,
        income,
        expense,
        balance: (Number(income) - Number(expense)).toFixed(2),
        count: Number(r.count),
      };
    });
  }

  /**
   * 按分类分组汇总（底栏「分类」维度）。
   *
   * 口径：
   *   - `level=1`：交易挂二级 → 归到父；直接挂一级 → 归到自身；未分类单独一组
   *   - `level=2`：交易挂哪个叶子就算哪个；未分类单独一组
   * 与统计页 `categoryInRange` 完全一致 —— 同一批交易换个分组方式，
   * 因此**两级各自的占比之和都是 100%**。
   *
   * ⚠️ **2026-09-15 约定反转**：本方法原先**不应用时间与分类筛选**（当时的理由是
   *    "按分类分组看的是整个账本结构，同时限制时间就没法看全"）。用户已改为：
   *    **底栏「分类」只是"换个展示形态"，筛选面板里的条件（含时间、分类）都该照常生效。**
   *    因此这里补上了 `start` / `end` / `categoryIds` 三个条件。
   *
   *    ⚠️ 这三个条件必须与 `applyFilters()` **同口径**，否则会出现
   *    "列表筛了、汇总没筛"这类不一致（这正是当初把筛选抽成 `applyFilters` 要避免的问题）。
   *    因为这里是裸 SQL（不是 QueryBuilder），没法复用那个函数，只能逐条对齐 ——
   *    **改 `applyFilters` 的筛选语义时，务必回来同步这里。**
   */
  private async summaryByCategory(userId: string, query: SummaryQueryDTO) {
    const level = Number(query.level) === 2 ? 2 : 1;
    /*
     * ⚠️ 本方法是**裸 SQL**，复用不了 applyFilters，所以要自己写一遍软删除过滤
     *    （与 applyFilters 里的 `t.deletedAt IS NULL` 等价）。
     *    **改 applyFilters 的筛选语义时，务必回来同步这里。**
     */
    const conditions = ['t.user_id = ?', 't.deleted_at IS NULL'];
    const params: any[] = [userId];

    if (query.start) {
      conditions.push('t.record_date >= ?');
      params.push(query.start);
    }
    if (query.end) {
      conditions.push('t.record_date <= ?');
      params.push(query.end);
    }
    if (query.type) {
      conditions.push('t.type = ?');
      params.push(query.type);
    }

    /*
     * 分类多选：与 applyFilters 完全同口径 —— 传一级分类时，其下二级也要命中
     * （用户选「食品酒水」时想看的是这个大类，而不是恰好直接挂在一级上的那几笔）。
     */
    if (query.categoryIds) {
      const catIds = query.categoryIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (catIds.length) {
        const ph = catIds.map(() => '?').join(',');
        conditions.push(
          `(t.category_id IN (${ph}) OR t.category_id IN (
             SELECT c2.id FROM categories c2 WHERE c2.parent_id IN (${ph})
           ))`,
        );
        params.push(...catIds, ...catIds);
      }
    }
    if (query.accountId) {
      conditions.push('t.account_id = ?');
      params.push(query.accountId);
    }
    if (query.minAmount) {
      conditions.push('t.amount >= ?');
      params.push(query.minAmount);
    }
    if (query.maxAmount) {
      conditions.push('t.amount <= ?');
      params.push(query.maxAmount);
    }
    if (query.keyword) {
      // 关键词匹配备注或分类名（与列表口径一致）
      conditions.push('(t.note LIKE ? OR c.name LIKE ? OR p.name LIKE ?)');
      const kw = `%${query.keyword}%`;
      params.push(kw, kw, kw);
    }

    /*
     * 一级口径用 COALESCE(父, 自身) 一步归并；二级口径直接用叶子。
     * 两者都带出父级信息，便于前端展示"XX（所属一级）"。
     */
    const groupCols =
      level === 1
        ? `COALESCE(p.id, c.id) AS groupId,
           COALESCE(p.name, c.name) AS groupName,
           COALESCE(p.icon, c.icon) AS groupIcon,
           NULL AS parentName`
        : `c.id AS groupId,
           c.name AS groupName,
           c.icon AS groupIcon,
           p.name AS parentName`;

    const rows = await this.dataSource.query(
      `SELECT
         ${groupCols},
         SUM(t.amount) AS sum,
         COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense,
         COUNT(*) AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY groupId, groupName, groupIcon, parentName
       ORDER BY sum DESC`,
      params,
    );

    return rows.map((r: any) => {
      const income = Number(r.income).toFixed(2);
      const expense = Number(r.expense).toFixed(2);
      return {
        // key 复用同一字段名，前端分组列表不用区分两种维度
        key: r.groupId ?? '__none__',
        unit: 'category',
        name: r.groupName ?? '未分类',
        icon: r.groupIcon ?? '',
        parentName: r.parentName ?? null,
        income,
        expense,
        balance: (Number(income) - Number(expense)).toFixed(2),
        count: Number(r.count),
      };
    });
  }

  async findById(userId: string, id: string): Promise<Transaction> {
    const entity = await this.repo.findOne({
      /*
       * ⚠️ `deletedAt: IsNull()` = 软删除过滤。
       *    这样"查已删除的流水"一律 404（编辑 / 再删 / 详情），符合直觉。
       *    **restore() 不能用本方法** —— 它要查的正是已删除的那条（见那里的注释）。
       */
      where: { id, userId, deletedAt: IsNull() },
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

    // 账本可能被同时修改，先算出"最终的账本"，再据此校验分类同账本
    let finalAccount: Account | null = null;
    if (dto.accountId !== undefined) {
      finalAccount = await this.resolveAccount(userId, dto.accountId || undefined);
    }
    const finalAccountId = finalAccount ? finalAccount.id : entity.accountId;
    await this.assertCategoryValid(finalAccountId, finalCategoryId, finalType);

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
    if (dto.accountId !== undefined && finalAccount) {
      // 传空字符串/null 表示改挂到默认账本。
      // 必须同时替换 entity.account 关系对象——findById 已经把旧的 account
      // 加载到实体上了，只改 accountId 会被 TypeORM 用旧关系回填（与清空分类同源）。
      patch.accountId = finalAccount.id;
      entity.account = finalAccount;
    }
    if (dto.recordTime !== undefined) {
      // 传空字符串/null 表示清除已记录的时刻
      patch.recordTime = dto.recordTime ? `${dto.recordTime}:00` : null;
    }

    Object.assign(entity, patch);
    await this.repo.save(entity);
    return this.findById(userId, id);
  }

  /**
   * 删除账单 —— **软删除**（写 deleted_at，不真删行）。
   *
   * 需求：「删除后在流水回收站存在 7 天」。真删行就无从恢复，所以只打时间戳。
   * 所有常规查询都加了 `deletedAt IS NULL` 过滤（见 applyFilters 与各裸 SQL 的注释），
   * 所以删掉的流水不会漏进列表 / 汇总 / 统计 / 报表 / 首页。
   *
   * ⚠️ 已删除的再删会返回 404：findById 自带软删除过滤（见下），找不到即 40402。
   */
  async delete(userId: string, id: string) {
    const entity = await this.findById(userId, id);
    entity.deletedAt = new Date();
    await this.repo.save(entity);
    return { success: true };
  }

  /** 回收站保留期（天）。与前端提示文案「7 天内可恢复」必须一致 */
  private static readonly RECYCLE_DAYS = 7;

  /**
   * 流水回收站列表。
   *
   * ⚠️ **超期清理是「查询时惰性真删」**（用户确认）：先物理删掉
   *    `deleted_at < NOW() - 7d` 的记录，再返回剩余的 ——
   *    这样「7 天内可恢复」的文案与行为严格一致，库也不会慢慢堆积。
   *
   * ⚠️ 惰性清理**只在本接口里做**，不在别处顺手做：写操作集中一处，
   *    出问题好定位，也不会让"读列表"这种高频动作带上写库的副作用。
   */
  async listDeleted(userId: string) {
    // ① 惰性清理超期记录
    await this.repo
      .createQueryBuilder()
      .delete()
      .from(Transaction)
      .where('user_id = :userId', { userId })
      .andWhere('deleted_at IS NOT NULL')
      .andWhere('deleted_at < DATE_SUB(NOW(6), INTERVAL :days DAY)', {
        days: TransactionService.RECYCLE_DAYS,
      })
      .execute();

    // ② 返回仍在保留期内的
    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'c')
      .leftJoinAndSelect('t.account', 'a')
      .where('t.userId = :userId', { userId })
      .andWhere('t.deletedAt IS NOT NULL')
      .orderBy('t.deletedAt', 'DESC');

    return qb.getMany();
  }

  /**
   * 从回收站恢复。
   *
   * ⚠️ 这里**不能用 findById**（它带 `deletedAt IS NULL` 过滤，会把已删的也滤掉），
   *    要单独查"已删除的"那条。
   */
  async restore(userId: string, id: string) {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity || !entity.deletedAt) {
      throw new BusinessError('账单不存在', ErrorCode.TRANSACTION_NOT_FOUND);
    }
    entity.deletedAt = null;
    await this.repo.save(entity);
    return this.findById(userId, id);
  }
}
/**
 * 列表与汇总共用的筛选条件。
 *
 * 抽成独立方法的原因：流水页的「列表」和「分组汇总」用的是**同一套筛选**
 * （时间/类型/分类/账本/关键词/金额区间），只有"怎么输出"不同。
 * 各写一遍必然出现"筛选了列表却没筛选汇总"这类不一致，且改一处漏一处。
 *
 * 分类多选的语义：`categoryIds` 里若含**一级分类**，其下二级也要命中 ——
 * 这与统计口径（二级归到一级）一致：用户选「食品酒水」时想看的是这个大类，
 * 而不是恰好直接挂在一级上的那几笔。
 */
function applyFilters<T extends { andWhere: (sql: string, params?: object) => T }>(
  qb: T,
  userId: string,
  q: {
    start?: string;
    end?: string;
    type?: 'income' | 'expense';
    categoryId?: string;
    categoryIds?: string;
    accountId?: string;
    keyword?: string;
    minAmount?: string;
    maxAmount?: string;
  },
): T {
  qb.andWhere('t.userId = :userId', { userId });

  /*
   * ⚠️ **软删除过滤放在这里 = 一处生效、全部覆盖**。
   *
   * 列表（page）与按粒度汇总（summary）都走这个方法，所以回收站里的流水
   * 不会漏进任何一处。**改动这里时注意：裸 SQL 的 `summaryByCategory`
   * 复用不了本函数，它自己手写了一份等价条件（见那里的注释）。**
   */
  qb.andWhere('t.deletedAt IS NULL');

  if (q.start) qb.andWhere('t.recordDate >= :start', { start: q.start });
  if (q.end) qb.andWhere('t.recordDate <= :end', { end: q.end });
  if (q.type) qb.andWhere('t.type = :type', { type: q.type });

  // 分类：多选优先（categoryIds 逗号分隔），并展开一级 → 其下二级
  const rawIds = q.categoryIds
    ? q.categoryIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : q.categoryId
      ? [q.categoryId]
      : [];

  if (rawIds.length) {
    // 先把"传入的一级分类"展开成"自身 + 其全部二级"，再用 IN 过滤。
    // 用子查询而非再查一次库：与主查询同事务快照，避免两次读取之间数据变动。
    qb.andWhere(
      `(t.categoryId IN (:...catIds) OR t.categoryId IN (
         SELECT c2.id FROM categories c2 WHERE c2.parent_id IN (:...catIds)
       ))`,
      { catIds: rawIds },
    );
  }

  if (q.accountId) qb.andWhere('t.accountId = :accountId', { accountId: q.accountId });

  /*
   * 关键词：匹配 **备注 / 分类名 / 金额**。
   *
   * 金额那一项：把 amount 转成字符串后 LIKE 匹配，这样搜 "3125" 能命中 3125.00。
   * 用 CAST(... AS CHAR) 而不是直接 LIKE —— MariaDB 的 decimal 直接 LIKE 会做隐式转换，
   * 行为在各版本间不一致（实测显式 CAST 才稳）。
   *
   * ⚠️ 不能写成 `t.amount LIKE :kw`：那会把 amount 当字符串比较，
   *    "3125" 匹配不到 "3125.00"（decimal 的字符串形式带两位小数）。
   */
  if (q.keyword) {
    const kw = `%${q.keyword}%`;
    qb.andWhere('(t.note LIKE :kw OR c.name LIKE :kw OR CAST(t.amount AS CHAR) LIKE :kw)', { kw });
  }

  if (q.minAmount) qb.andWhere('t.amount >= :minAmount', { minAmount: q.minAmount });
  if (q.maxAmount) qb.andWhere('t.amount <= :maxAmount', { maxAmount: q.maxAmount });

  return qb;
}

/** 排序方式 → QueryBuilder 的 orderBy 片段 */
function applyOrder(qb: ReturnType<Repository<Transaction>['createQueryBuilder']>, order?: string) {
  if (order === 'amountDesc') {
    qb.orderBy('t.amount', 'DESC').addOrderBy('t.id', 'DESC');
    return;
  }
  if (order === 'amountAsc') {
    qb.orderBy('t.amount', 'ASC').addOrderBy('t.id', 'DESC');
    return;
  }
  // 默认：时间倒序（贴合随手记"最近记录在前"）。
  // 同日期内按 record_time 倒序——MySQL DESC 排序中 NULL 靠后，
  // 即"没填时刻的排在同日填了时刻的后面"；再按 id 兜底
  qb.orderBy('t.recordDate', 'DESC').addOrderBy('t.recordTime', 'DESC').addOrderBy('t.id', 'DESC');
}
