import { Controller, Get, Post, Del, Param, Query, Inject } from '@midwayjs/core';
import { ApiTags, ApiOperation } from '@midwayjs/swagger';
import { AdminUserService } from './admin-user.service';
import { AdminUserListDTO } from './dto/admin-user-list.dto';

/**
 * 中台用户管理接口（设计文档第 6 节）。
 *
 * 全部位于 /api/admin/users 下，由 AdminGuard 统一保护（无需逐个注解），
 * 白名单只有 /api/admin/auth/login。
 *
 * 状态动作一律 POST（非幂等状态迁移），删除用 DELETE。
 */
@ApiTags(['中台-用户管理'])
@Controller('/api/admin/users')
export class AdminUserController {
  @Inject()
  adminUserService: AdminUserService;

  @ApiOperation({
    summary: '用户列表',
    description: '分页 + 用户名模糊搜索 + 状态筛选，聚合账本数/流水数。',
  })
  @Get('/')
  async list(@Query() dto: AdminUserListDTO) {
    return this.adminUserService.list({
      page: dto.page,
      pageSize: dto.pageSize,
      keyword: dto.keyword,
      status: dto.status,
    });
  }

  @ApiOperation({ summary: '用户详情', description: '含账本数/流水数，删除确认弹窗数据来源。' })
  @Get('/:id')
  async detail(@Param('id') id: string) {
    return this.adminUserService.detail(id);
  }

  @ApiOperation({
    summary: '通过注册申请',
    description: 'pending -> active。仅对 pending 用户有效（40014）。',
  })
  @Post('/:id/approve')
  async approve(@Param('id') id: string) {
    return this.adminUserService.approve(id);
  }

  @ApiOperation({
    summary: '驳回注册申请',
    description: '物理删除该用户（含空账本与预设分类）。仅对 pending 用户有效（40014）。',
  })
  @Post('/:id/reject')
  async reject(@Param('id') id: string) {
    return this.adminUserService.reject(id);
  }

  @ApiOperation({
    summary: '停用用户',
    description: 'active -> disabled。数据保留；已签发 token 即时失效。',
  })
  @Post('/:id/disable')
  async disable(@Param('id') id: string) {
    return this.adminUserService.disable(id);
  }

  @ApiOperation({ summary: '启用用户', description: 'disabled -> active。' })
  @Post('/:id/enable')
  async enable(@Param('id') id: string) {
    return this.adminUserService.enable(id);
  }

  @ApiOperation({
    summary: '删除用户',
    description: '物理级联删除：账本、分类、流水全部删除，不可恢复。',
  })
  @Del('/:id')
  async delete(@Param('id') id: string) {
    return this.adminUserService.delete(id);
  }
}
