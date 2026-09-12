import { Controller, Get, Post, Put, Del, Body, Param, Query, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@midwayjs/swagger';
import { AccountService } from './account.service';
import {
  CreateAccountDTO,
  UpdateAccountDTO,
  DeleteAccountQueryDTO,
  MergeAccountDTO,
} from './dto/account.dto';
import { ErrorResponseVO } from '../common/swagger/response.vo';
import {
  AccountListResponseVO,
  AccountDetailResponseVO,
  DeleteAccountResponseVO,
  DeletePreviewResponseVO,
  MergePreviewResponseVO,
  MergeResponseVO,
} from './dto/account.vo';

@ApiTags(['账本'])
@ApiBearerAuth()
@Controller('/api/accounts')
export class AccountController {
  @Inject()
  accountService: AccountService;

  @Inject()
  ctx: Context;

  private get userId(): string {
    return this.ctx.user.userId;
  }

  @ApiOperation({
    summary: '账本列表',
    description: '按 sort 升序、id 升序返回当前用户的全部账本；isDefault 标记默认账本。',
  })
  @ApiResponse({ status: 200, type: AccountListResponseVO, description: '查询成功' })
  @ApiResponse({ status: 401, type: ErrorResponseVO, description: '未认证' })
  @Get('/')
  async list() {
    return this.accountService.list(this.userId);
  }

  @ApiOperation({ summary: '账本详情' })
  @ApiResponse({ status: 200, type: AccountDetailResponseVO, description: '查询成功' })
  @ApiResponse({ status: 200, type: ErrorResponseVO, description: '账本不存在时 code=40403' })
  @Get('/:id')
  async detail(@Param('id') id: string) {
    return this.accountService.findById(this.userId, id);
  }

  @ApiOperation({
    summary: '新建账本',
    description: '账本名在同一用户名下唯一（重复返回 40903）。用户的第一个账本会自动成为默认账本。',
  })
  @ApiResponse({ status: 200, type: AccountDetailResponseVO, description: '创建成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @Post('/')
  async create(@Body() dto: CreateAccountDTO) {
    return this.accountService.create(this.userId, dto);
  }

  @ApiOperation({
    summary: '更新账本',
    description:
      '支持改名、改图标、改排序；传 isDefault=true 可切换默认账本（原默认会自动摘除标记）。',
  })
  @ApiResponse({ status: 200, type: AccountDetailResponseVO, description: '更新成功' })
  @Put('/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDTO) {
    return this.accountService.update(this.userId, id, dto);
  }

  @ApiOperation({
    summary: '删除前预检',
    description: '返回该账本下的交易笔数，供前端在确认弹窗中展示影响范围。不会修改任何数据。',
  })
  @ApiResponse({ status: 200, type: DeletePreviewResponseVO, description: '查询成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '只剩一个账本时 code=40002（不允许删除最后一个）',
  })
  @Get('/:id/delete-preview')
  async deletePreview(@Param('id') id: string) {
    return this.accountService.previewDelete(this.userId, id);
  }

  @ApiOperation({
    summary: '删除账本',
    description:
      '**会连同账本下的全部交易一起删除**。防误删校验：① query 里的 confirmName 必须与账本名完全一致（不一致返回 40001）；② 不允许删除最后一个账本（返回 40002）。若删除的是默认账本，默认标记会自动转给剩余账本中的第一个。',
  })
  @ApiResponse({ status: 200, type: DeleteAccountResponseVO, description: '删除成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '确认名不一致 code=40001 / 最后一个账本 code=40002',
  })
  @Del('/:id')
  async remove(@Param('id') id: string, @Query() query: DeleteAccountQueryDTO) {
    return this.accountService.remove(this.userId, id, query.confirmName);
  }

  @ApiOperation({
    summary: '合并前预检',
    description:
      '不修改数据，只统计：源账本共有多少笔、其中多少笔会迁入目标账本、多少笔因与目标完全重复会被丢弃。前端用这份报告做二次确认。',
  })
  @ApiResponse({ status: 200, type: MergePreviewResponseVO, description: '查询成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: 'targetId 与 sourceId 相同时 code=40003',
  })
  @Post('/merge-preview')
  async mergePreview(@Body() dto: MergeAccountDTO) {
    return this.accountService.previewMerge(this.userId, dto.targetId, dto.sourceId);
  }

  @ApiOperation({
    summary: '合并账本',
    description:
      '把 sourceId 账本的交易并入 targetId，然后删除 sourceId。去重口径：金额+日期+收支类型+分类+备注全部相同才算重复，重复时保留目标账本那条。任一字段不同即视为两笔不同交易，全部保留。全过程在事务中，失败整体回滚。',
  })
  @ApiResponse({ status: 200, type: MergeResponseVO, description: '合并成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '账本不存在 code=40403 / 合并到自己 code=40003',
  })
  @Post('/merge')
  async merge(@Body() dto: MergeAccountDTO) {
    return this.accountService.merge(this.userId, dto.targetId, dto.sourceId);
  }
}
