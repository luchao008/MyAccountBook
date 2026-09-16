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
 *   - **分类自 2026-09-16 起为账本级隔离**：每个账本拥有独立的一套分类
 *     （见 docs/账本级分类设计文档.md）。
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
