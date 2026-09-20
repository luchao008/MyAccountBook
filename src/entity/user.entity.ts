import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ length: 64, unique: true })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  /**
   * 账号状态（中台设计决策 D18：注册改申请制）。
   *
   *   pending  新注册，等待管理员审批（登录被拒：40102）
   *   active   正常
   *   disabled 被停用（登录被拒：40103；已签发 token 由 JwtGuard 查库即时失效）
   *
   * 默认 pending：默认收口。存量用户由迁移 1789865000000 一次性放行。
   */
  @Column({ type: 'enum', enum: ['pending', 'active', 'disabled'], default: 'pending' })
  status: 'pending' | 'active' | 'disabled';

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
