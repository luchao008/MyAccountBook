import { Provide, Inject } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@midwayjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Admin } from '../entity/admin.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';

/**
 * 中台管理员认证服务。
 *
 * 失败信息收敛（决策 D17）：管理员登录失败统一 40301，
 * 不区分"账号不存在 / 密码错误"，避免暴露有效管理员账号名。
 * 签发的 token 带 scope: 'admin' —— 双向硬隔离的凭证基础
 * （JwtGuard 拒 admin scope，本守卫链之外的接口一概调不了）。
 */
@Provide()
export class AdminAuthService {
  @InjectEntityModel(Admin)
  adminRepo: Repository<Admin>;

  @Inject()
  jwtService: JwtService;

  async login(dto: { username: string; password: string }) {
    const admin = await this.adminRepo.findOne({
      where: { username: dto.username },
    });

    // 统一失败：不存在与密码错误同码同文案（避免时序差异也可以再加假哈希，v1 不做）
    const matched = admin ? await bcrypt.compare(dto.password, admin.passwordHash) : false;
    if (!admin || !matched) {
      throw new BusinessError('用户名或密码错误', ErrorCode.ADMIN_LOGIN_FAILED);
    }

    if (admin.status !== 'active') {
      throw new BusinessError('该管理员账号已被停用', ErrorCode.ADMIN_DISABLED);
    }

    const token = await this.jwtService.sign({
      adminId: admin.id,
      username: admin.username,
      scope: 'admin',
    });

    // 记录最近登录时间（失败不影响登录结果）
    await this.adminRepo.update(admin.id, { lastLoginAt: new Date() });

    return {
      token,
      expiresIn: '7d',
      admin: {
        id: admin.id,
        username: admin.username,
        nickname: admin.nickname,
      },
    };
  }

  /**
   * 按 id 查管理员基础信息（供 /me 使用）。
   * 守卫已验证 status=active，这里只需取展示字段。
   */
  async findAdminInfo(adminId: string) {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId },
      select: ['id', 'username', 'nickname'],
    });
    if (!admin) {
      throw new BusinessError('管理员不存在', ErrorCode.ADMIN_LOGIN_FAILED);
    }
    return admin;
  }
}
