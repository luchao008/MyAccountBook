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

  /**
   * 请求上下文。
   *
   * 注意：必须用**属性注入**（@Inject() ctx），不能写成方法参数 @Inject() ctx。
   * Midway v4 没有 @Ctx 装饰器，方法参数位置的 @Inject() 会被当作"按名字注入依赖"，
   * 触发 MidwayDefinitionNotFoundError（Definition for "[object Object"）。
   */
  @Inject()
  ctx: Context;

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
  async me() {
    const admin = await this.adminAuthService.findAdminInfo(this.ctx.admin.adminId);
    // 字段对齐 Vben 的 UserInfo：avatar/desc 中台 v1 不用，占位空串
    return {
      userId: String(admin.id),
      username: admin.username,
      realName: admin.nickname || admin.username,
      avatar: '',
      desc: '',
      roles: ['super'],
      homePath: '/analytics',
    };
  }
}
