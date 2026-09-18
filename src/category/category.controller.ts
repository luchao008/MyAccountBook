import { Controller, Get, Post, Put, Del, Body, Param, Query, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@midwayjs/swagger';
import { CategoryService } from './category.service';
import {
  CreateCategoryDTO,
  UpdateCategoryDTO,
  QueryCategoryDTO,
  BatchDeleteCategoryDTO,
  BatchHideCategoryDTO,
  ReorderCategoryDTO,
} from './dto/category.dto';
import {
  CategoryListResponseVO,
  CategoryDetailResponseVO,
  DeleteResponseVO,
  BatchDeleteResponseVO,
  BatchHideResponseVO,
  ReorderCategoryResponseVO,
  ErrorResponseVO,
} from '../common/swagger/response.vo';

@ApiTags(['分类'])
@ApiBearerAuth()
@Controller('/api/categories')
export class CategoryController {
  @Inject()
  categoryService: CategoryService;

  @Inject()
  ctx: Context;

  private get userId(): string {
    return this.ctx.user.userId;
  }

  @ApiOperation({
    summary: '分类列表',
    description: '只返回当前登录用户的分类，按 sort 升序、id 升序排列。',
  })
  @ApiResponse({ status: 200, type: CategoryListResponseVO, description: '查询成功' })
  @ApiResponse({ status: 401, type: ErrorResponseVO, description: '未认证或令牌失效' })
  @Get('/')
  async list(@Query() query: QueryCategoryDTO) {
    return this.categoryService.list(this.userId, query);
  }

  @ApiOperation({ summary: '分类详情' })
  @ApiResponse({ status: 200, type: CategoryDetailResponseVO, description: '查询成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '分类不存在时 code=40401',
  })
  @Get('/:id')
  async detail(@Param('id') id: string, @Query('accountId') accountId: string) {
    return this.categoryService.findById(this.userId, accountId, id);
  }

  @ApiOperation({
    summary: '新建分类',
    description: '分类名在同一用户名下唯一，重复会返回 40902。',
  })
  @ApiResponse({ status: 200, type: CategoryDetailResponseVO, description: '创建成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @Post('/')
  async create(@Body() dto: CreateCategoryDTO) {
    return this.categoryService.create(this.userId, dto);
  }

  @ApiOperation({
    summary: '更新分类',
    description: '只传需要修改的字段；改名时同样受唯一约束限制。',
  })
  @ApiResponse({ status: 200, type: CategoryDetailResponseVO, description: '更新成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @Put('/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDTO,
    @Query('accountId') accountId: string,
  ) {
    return this.categoryService.update(this.userId, accountId, id, dto);
  }

  @ApiOperation({
    summary: '删除分类',
    description: '历史账单不会被删除，其 category_id 会被置为 NULL，在统计中归入"未分类"。',
  })
  @ApiResponse({ status: 200, type: DeleteResponseVO, description: '删除成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '分类不存在时 code=40401',
  })
  @Del('/:id')
  async remove(@Param('id') id: string, @Query('accountId') accountId: string) {
    return this.categoryService.delete(this.userId, accountId, id);
  }

  @ApiOperation({
    summary: '批量删除分类',
    description:
      '一级与二级可混合传入。传一级会连同其下二级一并删除（外键 CASCADE），' +
      '返回的 `deleted` 是**实际消失的总数**（含被级联删掉的），`deletedChildren` 单列级联数。' +
      '若列表里有不存在或不属于当前用户的 id，**整单失败**而不是静默少删。' +
      '历史账单不会被删除，其 category_id 置为 NULL。',
  })
  @ApiResponse({ status: 200, type: BatchDeleteResponseVO, description: '删除成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '有 id 不存在时 code=40401',
  })
  @Post('/batch-delete')
  async batchDelete(@Body() dto: BatchDeleteCategoryDTO) {
    return this.categoryService.batchDelete(this.userId, dto.accountId, dto.ids);
  }

  @ApiOperation({
    summary: '批量隐藏 / 恢复显示分类',
    description:
      '`hidden: true` 隐藏、`false` 恢复显示。隐藏的定义见分类实体注释：' +
      '隐藏后**只是不出现在「记一笔」的选择器里**，分类管理页仍可见，' +
      '历史交易 / 明细 / 统计完全不受影响。' +
      '一级分类隐藏时其下二级也一并选不到 —— 这条由查询侧规则实现，' +
      '不会给子分类写入 is_hidden。',
  })
  @ApiResponse({ status: 200, type: BatchHideResponseVO, description: '操作成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '有 id 不存在时 code=40401',
  })
  @Post('/batch-hide')
  async batchHide(@Body() dto: BatchHideCategoryDTO) {
    return this.categoryService.batchHide(this.userId, dto.accountId, dto.ids, dto.hidden);
  }

  @ApiOperation({
    summary: '分类拖动排序',
    description:
      '把某一层级下的分类按传入顺序重排，`sort` 归一化为 `0..n-1`。' +
      '**作用域是 `(accountId, type, parentId)`** —— 支出与收入的一级分类各自独立编号，' +
      '一级与二级也是两层独立的顺序（`parentId` 传空 / 不传 = 排一级分类）。' +
      '`ids` 必须是该层级下的**全集**，只传一部分会被拒绝（40013）；' +
      '有重复 id 拒绝（40011）；混入其他层级的分类拒绝（40012）。' +
      '写入在单个事务内完成。',
  })
  @ApiResponse({ status: 200, type: ReorderCategoryResponseVO, description: '排序成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description:
      '重复 id code=40011 / 跨层级 code=40012 / 列表不完整 code=40013 / 分类不存在 code=40401',
  })
  @Post('/reorder')
  async reorder(@Body() dto: ReorderCategoryDTO) {
    return this.categoryService.reorder(this.userId, dto);
  }
}
