import { Controller, Post, Get, Body, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ApiTags, ApiOperation, ApiResponse } from '@midwayjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDTO } from './dto/admin-login.dto';

@ApiTags(['中台-认证'])
@Controller('/api/admin/auth')
export class AdminAuthController {
  @Inject()
  adminAuthService: AdminAuthService;

  @ApiOperation({
    summary: '管理员登录',
    description: '校验账号密码，返回带 admin scope 的 JWT（有效期 7 天）。',
  })
  @ApiResponse({ status: 200, description: '登录成功。失败时 code=40301（不区分账号是否存在）' })
  @Post('/login')
  async login(@Body() dto: AdminLoginDTO) {
    return this.adminAuthService.login(dto);
  }

  /**
   * 当前管理员信息（受 AdminGuard 保护）。
   * 供前端 vben 框架登录后的 getUserInfoApi 使用。
   */
  @ApiOperation({ summary: '当前管理员信息' })
  @Get('/me')
  async me(@Inject() ctx: Context) {
    const admin = await this.adminAuthService.findAdminInfo(ctx.admin.adminId);
    return {
      userId: String(admin.id),
      username: admin.username,
      realName: admin.nickname || admin.username,
      roles: ['super'],
      homePath: '/analytics',
    };
  }
}
