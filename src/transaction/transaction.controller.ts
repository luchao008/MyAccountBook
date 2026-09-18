import { Controller, Get, Post, Put, Del, Body, Param, Query, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@midwayjs/swagger';
import { TransactionService } from './transaction.service';
import { TransactionImportService } from './transaction-import.service';
import {
  CreateTransactionDTO,
  UpdateTransactionDTO,
  QueryTransactionDTO,
  SummaryQueryDTO,
} from './dto/transaction.dto';
import { ImportPreviewDTO, ImportCommitDTO } from './dto/transaction-import.dto';
import {
  TransactionPageResponseVO,
  TransactionDetailResponseVO,
  DeleteResponseVO,
  ErrorResponseVO,
  TransactionSummaryResponseVO,
} from '../common/swagger/response.vo';

@ApiTags(['账单'])
@ApiBearerAuth()
@Controller('/api/transactions')
export class TransactionController {
  @Inject()
  transactionService: TransactionService;

  @Inject()
  transactionImportService: TransactionImportService;

  @Inject()
  ctx: Context;

  private get userId(): string {
    return this.ctx.user.userId;
  }

  @ApiOperation({
    summary: '账单列表（分页）',
    description: '支持日期区间、收支类型、分类筛选；按记账日期倒序、同日期按 ID 倒序返回。',
  })
  @ApiResponse({ status: 200, type: TransactionPageResponseVO, description: '查询成功' })
  @ApiResponse({ status: 401, type: ErrorResponseVO, description: '未认证或令牌失效' })
  @Get('/')
  async list(@Query() query: QueryTransactionDTO) {
    return this.transactionService.page(this.userId, query);
  }

  @ApiOperation({
    summary: '流水分组汇总',
    description:
      '按 unit 指定的粒度分组返回结余/收入/支出/笔数，筛选条件与列表接口一致。' +
      'unit: year | quarter | month | week | day（默认 month）。' +
      'week 用 ISO 周（周一为起点，与首页"本周"口径一致）。',
  })
  @ApiResponse({ status: 200, type: TransactionSummaryResponseVO, description: '查询成功' })
  @Get('/summary')
  async summary(@Query() query: SummaryQueryDTO) {
    return this.transactionService.summary(this.userId, query);
  }

  @ApiOperation({
    summary: '流水回收站',
    description:
      '返回 7 天内删除的流水（软删除）。' +
      '⚠️ 本接口会**惰性真删**超期记录（deleted_at < NOW() - 7d），' +
      '因此「7 天内可恢复」的文案与行为严格一致。',
  })
  @ApiResponse({ status: 200, description: '查询成功' })
  @Get('/deleted')
  async listDeleted() {
    return this.transactionService.listDeleted(this.userId);
  }

  @ApiOperation({
    summary: '从回收站恢复',
    description: '清空该流水的 deleted_at，重新出现在列表与统计里。',
  })
  @ApiResponse({ status: 200, type: TransactionDetailResponseVO, description: '恢复成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '账单不存在或未被删除时 code=40402',
  })
  @Post('/:id/restore')
  async restore(@Param('id') id: string) {
    return this.transactionService.restore(this.userId, id);
  }

  @ApiOperation({
    summary: '流水导入 · 预览',
    description:
      '解析随手记导出的 .xlsx（JSON + base64 承载），按当前账本的分类树匹配，' +
      '并与库内已有流水比对疑似重复。**本接口不写库**，只返回汇总 + **需要关注的逐行报告**' +
      '（正常行不回传：真实账单里它们占 99%，带上只会淹掉异常并撑大响应体）。' +
      '分类未命中一律降级（挂一级 / 记为未分类），**不自动创建分类**。',
  })
  @ApiResponse({ status: 200, description: '解析成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description:
      '文件不可解析 code=40007；超过体积上限 code=40008；缺必要列 code=40009；无可导入数据 code=40010',
  })
  @Post('/import/preview')
  async previewImport(@Body() dto: ImportPreviewDTO) {
    return this.transactionImportService.preview(this.userId, dto);
  }

  @ApiOperation({
    summary: '流水导入 · 提交',
    description:
      '把文件写入当前账本。**入参与预览完全相同**（同文件 / 同账本 / 同开关）—— ' +
      '服务端**重新解析该文件**并重新读取分类树。因此：' +
      '① 行数上限只有「文件体积 2MB」一条（约 3 万行），**不存在按行数截断**；' +
      '② 预览与提交口径天然一致（同一份解析逻辑）；' +
      '③ 预览到提交之间分类若被改名 / 删除，会自然走降级路径（挂一级 / 记为未分类）并计入 unmatched。' +
      '整体在一个事务里分批写入。',
  })
  @ApiResponse({ status: 200, description: '导入完成' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @Post('/import/commit')
  async commitImport(@Body() dto: ImportCommitDTO) {
    return this.transactionImportService.commit(this.userId, dto);
  }

  @ApiOperation({ summary: '账单详情' })
  @ApiResponse({ status: 200, type: TransactionDetailResponseVO, description: '查询成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '账单不存在时 code=40402',
  })
  @Get('/:id')
  async detail(@Param('id') id: string) {
    return this.transactionService.findById(this.userId, id);
  }

  @ApiOperation({
    summary: '记一笔',
    description:
      '金额以字符串传输（如 "35.50"）；若传 categoryId，其收支类型必须与 type 一致，否则返回 40000。',
  })
  @ApiResponse({ status: 200, type: TransactionDetailResponseVO, description: '创建成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败（如金额为 0）' })
  @Post('/')
  async create(@Body() dto: CreateTransactionDTO) {
    return this.transactionService.create(this.userId, dto);
  }

  @ApiOperation({
    summary: '更新账单',
    description: '局部更新；类型与分类会被合并后用最终值做一致性校验，冲突返回 40000。',
  })
  @ApiResponse({ status: 200, type: TransactionDetailResponseVO, description: '更新成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: '参数校验失败' })
  @Put('/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTransactionDTO) {
    return this.transactionService.update(this.userId, id, dto);
  }

  @ApiOperation({
    summary: '删除账单（软删除）',
    description:
      '⚠️ 自 2026-09-15 起为**软删除**：只写 deleted_at，不真删行。' +
      '删除后 7 天内在「流水回收站」可恢复，超期由回收站接口惰性真删。' +
      '删账本的级联删除不在此列（仍是真删）。',
  })
  @ApiResponse({ status: 200, type: DeleteResponseVO, description: '删除成功' })
  @ApiResponse({
    status: 200,
    type: ErrorResponseVO,
    description: '账单不存在时 code=40402',
  })
  @Del('/:id')
  async remove(@Param('id') id: string) {
    return this.transactionService.delete(this.userId, id);
  }
}
