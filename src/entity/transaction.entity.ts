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
