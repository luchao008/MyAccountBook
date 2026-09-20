import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * 中台管理员账号。
 *
 * 与 App 用户（User）完全隔离（决策 D17）：
 *   - 无外键关联，两套独立账号体系
 *   - 登录走 /api/admin/auth/login，token 带 scope: 'admin'
 *   - 管理员凭证不能调 App 用户接口（JwtGuard 侧拒绝 admin scope）
 *
 * 创建方式：npm run admin:create -- <username>（幂等脚本），
 * v1 不提供管理接口。
 */
@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ length: 64, unique: true })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ length: 64, nullable: true })
  nickname: string;

  @Column({ type: 'enum', enum: ['active', 'disabled'], default: 'active' })
  status: 'active' | 'disabled';

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
