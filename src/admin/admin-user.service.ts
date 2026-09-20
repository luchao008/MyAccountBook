import { Provide } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { User } from '../entity/user.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';

/** 列表筛选状态（'' = 全部） */
export type UserStatusFilter = '' | 'pending' | 'active' | 'disabled';

export interface AdminUserItem {
  id: string;
  username: string;
  status: 'pending' | 'active' | 'disabled';
  createdAt: Date;
  accountCount: number;
  transactionCount: number;
}

/**
 * 中台用户管理服务（设计文档第 6 节）。
 *
 * 状态机：
 *   pending --approve--> active <--> disable/enable <--> disabled
 *   pending --reject----> 物理删除
 *   任意 ----delete-----> 物理级联删除
 *
 * 硬规则：所有动作前先按 id 查用户、校验目标状态（40014/40404），
 * service 层兜底校验 —— 不依赖前端只对合法状态显示按钮。
 */
@Provide()
export class AdminUserService {
  @InjectDataSource()
  dataSource: DataSource;

  private get userRepo(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  /**
   * 分页列表 + 账本数/流水数聚合。
   *
   *   - 数据行：主查询带两个 COUNT 子查询 + 分页（getRawAndEntities）
   *   - 总数：单独一次轻量 count（与主查询同 where，不带子查询，
   *     否则 COUNT 里每行还要执行两个子查询，纯浪费）
   */
  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    status?: UserStatusFilter;
  }): Promise<{ items: AdminUserItem[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const keyword = (params.keyword || '').trim();

    // where 条件复用：给主查询和 count 查询各自构建（qb 不能复用同一个实例）
    const applyWhere = (qb: SelectQueryBuilder<User>) => {
      if (keyword) {
        qb.andWhere('u.username LIKE :kw', { kw: `%${keyword}%` });
      }
      if (params.status) {
        qb.andWhere('u.status = :status', { status: params.status });
      }
      return qb;
    };

    // 总数
    const total = await applyWhere(this.userRepo.createQueryBuilder('u')).getCount();

    // 数据行 + 聚合计数
    const { entities, raw } = await applyWhere(
      this.userRepo
        .createQueryBuilder('u')
        .addSelect(
          (sub) => sub.select('COUNT(*)').from('accounts', 'a').where('a.user_id = u.id'),
          'accountCount',
        )
        .addSelect(
          (sub) =>
            sub
              .select('COUNT(*)')
              .from('transactions', 't')
              .innerJoin('accounts', 'ta', 't.account_id = ta.id')
              .where('ta.user_id = u.id'),
          'transactionCount',
        ),
    )
      .orderBy('u.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getRawAndEntities();

    const rawList = raw as Array<Record<string, unknown>>;
    const items: AdminUserItem[] = entities.map((u, i) => ({
      id: u.id,
      username: u.username,
      status: u.status,
      createdAt: u.createdAt,
      accountCount: Number(rawList[i]?.accountCount ?? 0),
      transactionCount: Number(rawList[i]?.transactionCount ?? 0),
    }));

    return { items, total, page, pageSize };
  }

  /** 详情（单用户，含计数。删除弹窗展示"将连带删除 N 账本 M 流水"用） */
  async detail(id: string): Promise<AdminUserItem> {
    const user = await this.findOrThrow(id);
    const [accountCount, transactionCount] = await Promise.all([
      this.countAccounts(id),
      this.countTransactions(id),
    ]);
    return {
      id: user.id,
      username: user.username,
      status: user.status,
      createdAt: user.createdAt,
      accountCount,
      transactionCount,
    };
  }

  /** pending -> active */
  async approve(id: string): Promise<AdminUserItem> {
    const user = await this.findPendingOrThrow(id);
    await this.userRepo.update(user.id, { status: 'active' });
    return this.detail(user.id);
  }

  /** pending -> 物理删除（驳回 = 拒绝服务，不进 disabled） */
  async reject(id: string): Promise<{ success: true }> {
    const user = await this.findPendingOrThrow(id);
    await this.cascadeDelete(user.id);
    return { success: true };
  }

  /** active -> disabled（流水与数据保留，仅禁止登录 + token 即时失效） */
  async disable(id: string): Promise<AdminUserItem> {
    const user = await this.findOrThrow(id);
    if (user.status !== 'active') {
      throw new BusinessError('仅正常状态的用户可以被停用', ErrorCode.USER_NOT_PENDING);
    }
    await this.userRepo.update(user.id, { status: 'disabled' });
    return this.detail(user.id);
  }

  /** disabled -> active */
  async enable(id: string): Promise<AdminUserItem> {
    const user = await this.findOrThrow(id);
    if (user.status !== 'disabled') {
      throw new BusinessError('仅已停用的用户可以被启用', ErrorCode.USER_NOT_PENDING);
    }
    await this.userRepo.update(user.id, { status: 'active' });
    return this.detail(user.id);
  }

  /** 物理级联删除（设计文档第 10 节：不保留痕迹，同用户名可重新注册） */
  async delete(id: string): Promise<{ success: true }> {
    await this.findOrThrow(id);
    await this.cascadeDelete(id);
    return { success: true };
  }

  // ────────────────────────── 私有 ──────────────────────────

  private async findOrThrow(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new BusinessError('用户不存在', ErrorCode.USER_NOT_FOUND);
    }
    return user;
  }

  private async findPendingOrThrow(id: string): Promise<User> {
    const user = await this.findOrThrow(id);
    if (user.status !== 'pending') {
      throw new BusinessError('该操作仅对待审核用户有效', ErrorCode.USER_NOT_PENDING);
    }
    return user;
  }

  private async countAccounts(userId: string): Promise<number> {
    const [row] = await this.dataSource.query(
      'SELECT COUNT(*) AS c FROM accounts WHERE user_id = ?',
      [userId],
    );
    return Number(row?.c ?? 0);
  }

  private async countTransactions(userId: string): Promise<number> {
    const [row] = await this.dataSource.query(
      `SELECT COUNT(*) AS c FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         WHERE a.user_id = ?`,
      [userId],
    );
    return Number(row?.c ?? 0);
  }

  /**
   * 物理级联删除。事务内按依赖顺序显式删：
   * transactions -> categories -> accounts -> users。
   *
   * 不依赖数据库外键的 ON DELETE CASCADE 而选择显式删，
   * 原因：外键行为建表时已定死，这里行为变化（如改为软删）不用改 schema；
   * 且删除顺序显式可见，审计/排错更直观。事务保证不留孤儿数据。
   */
  private async cascadeDelete(userId: string): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      await mgr.query(
        'DELETE t FROM transactions t INNER JOIN accounts a ON t.account_id = a.id WHERE a.user_id = ?',
        [userId],
      );
      await mgr.query(
        'DELETE c FROM categories c INNER JOIN accounts a ON c.account_id = a.id WHERE a.user_id = ?',
        [userId],
      );
      await mgr.query('DELETE FROM accounts WHERE user_id = ?', [userId]);
      await mgr.query('DELETE FROM users WHERE id = ?', [userId]);
    });
  }
}
