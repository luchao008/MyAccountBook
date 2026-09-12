import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 账本
 *
 * 设计要点：
 *   - 账本从属于用户，用户名下账本名唯一（uk_user_account_name）
 *   - isDefault 标记"默认账本"：注册时自动建一个，切换账本时作为兜底
 *   - 多账本只影响交易的归属，**分类仍是用户级共享**（与随手记一致，
 *     分类属于记账习惯而非某个账本）
 */
@Entity('accounts')
@Index('uk_user_account_name', ['userId', 'name'], { unique: true })
@Index('idx_user_default', ['userId', 'isDefault'])
export class Account {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ length: 64 })
  name: string;

  @Column({ length: 64, default: '' })
  icon: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  /** 是否为默认账本；每个用户有且只有一个（应用层保证，见 AccountService） */
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
