import { Controller, Get, Post, Put, Del, Body, Param, Query, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@midwayjs/swagger';
import { CategoryService } from './category.service';
import { CreateCategoryDTO, UpdateCategoryDTO, QueryCategoryDTO } from './dto/category.dto';
import {
  CategoryListResponseVO,
  CategoryDetailResponseVO,
  DeleteResponseVO,
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
  async detail(@Param('id') id: string) {
    return this.categoryService.findById(this.userId, id);
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
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDTO) {
    return this.categoryService.update(this.userId, id, dto);
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
  async remove(@Param('id') id: string) {
    return this.categoryService.delete(this.userId, id);
  }
}
