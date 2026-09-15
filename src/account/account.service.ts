import { Provide } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { Account } from '../entity/account.entity';
import { IsNull } from 'typeorm';
import { Transaction } from '../entity/transaction.entity';
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
 * 用字符串拼接做指纹而非逐字段比较，是为了方便放进 Set 做 O(1) 查重。
 */
function fingerprint(t: Transaction): string {
  return [t.amount, t.recordDate, t.type, t.categoryId ?? '', t.note ?? ''].join('|');
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

  /** 创建账本；用户的第一个账本自动成为默认账本 */
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
    return this.repo.save(account);
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
    const [targetTxns, sourceTxns] = await Promise.all([
      this.txnRepo.find({ where: { userId, accountId: targetId, deletedAt: IsNull() } }),
      this.txnRepo.find({ where: { userId, accountId: sourceId, deletedAt: IsNull() } }),
    ]);

    const existing = new Set(targetTxns.map(fingerprint));
    let willSkip = 0;
    for (const t of sourceTxns) {
      if (existing.has(fingerprint(t))) willSkip++;
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

      // ⚠️ 同 previewMerge：只取未删除的（回收站里的不参与合并）
      const targetTxns = await txnRepo.find({
        where: { userId, accountId: targetId, deletedAt: IsNull() },
      });
      const sourceTxns = await txnRepo.find({
        where: { userId, accountId: sourceId, deletedAt: IsNull() },
      });

      // 目标账本现有交易的指纹集合
      const existing = new Set(targetTxns.map(fingerprint));

      let moved = 0;
      let skipped = 0;
      const toMove: Transaction[] = [];
      const toRemove: Transaction[] = [];

      for (const t of sourceTxns) {
        if (existing.has(fingerprint(t))) {
          // 目标已有完全相同的记录：源这条直接删除
          toRemove.push(t);
          skipped++;
        } else {
          t.accountId = targetId;
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
}
