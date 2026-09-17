import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Check,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Account } from './account.entity';

@Entity('transactions')
@Check('transactions_amount_check', 'amount > 0')
@Index('idx_user_date', ['userId', 'recordDate'])
@Index('idx_user_cat', ['userId', 'categoryId'])
@Index('idx_user_type', ['userId', 'type', 'recordDate'])
@Index('idx_user_account_date', ['userId', 'accountId', 'recordDate'])
@Index('idx_user_deleted', ['userId', 'deletedAt'])
export class Transaction {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ type: 'enum', enum: ['income', 'expense'] })
  type: 'income' | 'expense';

  // 金额以字符串承载，避免精度丢失（对齐文档第 8 节）
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'category_id', type: 'bigint', unsigned: true, nullable: true })
  categoryId: string | null;

  @Column({ name: 'record_date', type: 'date' })
  recordDate: string;

  /**
   * 记账时刻（HH:mm:ss），可空。
   *
   * NULL = 用户未开启"时刻"开关。日期维度的统计与筛选只看 record_date，
   * record_time 仅用于展示与同日内的排序（NULL 在 DESC 排序中靠后，
   * 即"没填时间的排在同日填了时间的后面"）。
   */
  @Column({ name: 'record_time', type: 'time', nullable: true })
  recordTime: string | null;

  @Column({ length: 255, default: '' })
  note: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  /**
   * 软删除时间戳。**NULL = 未删除**（绝大多数记录）。
   *
   * 删除流水时写这里（而不是真删行），于是：
   *   · 「流水回收站」= 查 `deleted_at IS NOT NULL AND deleted_at > NOW() - 7d`
   *   · 所有常规查询（列表 / 汇总 / 统计 / 报表 / 首页）都要加 `deleted_at IS NULL`
   *
   * ⚠️ **超期清理是「查询时惰性真删」**（luchao 确认）：查回收站时先把
   *    `deleted_at < NOW() - 7d` 的记录物理删掉，再返回剩余的 —— 这样
   *    「7 天内可恢复」的文案与行为严格一致，库也不会慢慢堆积。
   *
   * ⚠️ **删账本的级联删除不走软删除**（luchao 确认）：`account_id` 是
   *    `ON DELETE CASCADE`，删账本时其下交易真删、不进回收站。
   *    理由：回收站只服务「用户逐笔删的流水」；账本都没了，恢复的流水挂哪？
   */
  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * 所属账本。
   *
   * 多账本改造新增（原单账本结构没有该字段）。
   * 外键策略 ON DELETE CASCADE：删除账本时其下交易一并删除，
   * 与"删除账本 = 删除其中的数据"的语义一致（用户已确认）。
   */
  @Column({ name: 'account_id', type: 'bigint', unsigned: true })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
