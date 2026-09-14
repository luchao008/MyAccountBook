import { Controller, Get, Query, Inject } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@midwayjs/swagger';
import { StatisticsService } from './statistics.service';
import {
  MonthlyQueryDTO,
  CategoryQueryDTO,
  OverviewQueryDTO,
  ReportQueryDTO,
} from './dto/statistics.dto';
import {
  MonthlyStatResponseVO,
  CategoryStatResponseVO,
  ErrorResponseVO,
} from '../common/swagger/response.vo';
import { OverviewResponseVO, ReportResponseVO } from './dto/statistics.vo';

@ApiTags(['统计'])
@ApiBearerAuth()
@Controller('/api/statistics')
export class StatisticsController {
  @Inject()
  statisticsService: StatisticsService;

  @Inject()
  ctx: Context;

  private get userId(): string {
    return this.ctx.user.userId;
  }

  @ApiOperation({
    summary: '总览（首页用）',
    description:
      '一次返回当前账本的**历年累计**收支，以及**今天 / 本周 / 本月 / 本年 / 去年**五个区间的收入、支出、结余与笔数。本周按周一至周日计算。不传 accountId 则统计全部账本。',
  })
  @ApiResponse({ status: 200, type: OverviewResponseVO, description: '查询成功' })
  @Get('/overview')
  async overview(@Query() query: OverviewQueryDTO) {
    return this.statisticsService.overview(this.userId, query.accountId);
  }

  @ApiOperation({
    summary: '报表聚合（年 / 月）',
    description:
      '按 period 粒度一次返回：汇总、支出分类、收入分类、12 个月趋势。' +
      'period 为 YYYY 时按整年聚合且 trend 返回 12 个月；为 YYYY-MM 时按该月聚合且 trend 为空数组。' +
      '分类按一级聚合，口径与 /statistics/category 一致。不传 accountId 则统计全部账本。',
  })
  @ApiResponse({ status: 200, type: ReportResponseVO, description: '查询成功' })
  @ApiResponse({
    status: 422,
    type: ErrorResponseVO,
    description: 'period 格式必须为 YYYY 或 YYYY-MM',
  })
  @Get('/report')
  async report(@Query() query: ReportQueryDTO) {
    return this.statisticsService.report(this.userId, query.period, query.accountId);
  }

  @ApiOperation({
    summary: '月度收支汇总',
    description: '统计该月收入、支出与结余；结余 = 收入 - 支出，不含期初余额。',
  })
  @ApiResponse({ status: 200, type: MonthlyStatResponseVO, description: '查询成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: 'month 格式必须为 YYYY-MM' })
  @Get('/monthly')
  async monthly(@Query() query: MonthlyQueryDTO) {
    return this.statisticsService.monthly(this.userId, query.month, query.accountId);
  }

  @ApiOperation({
    summary: '分类占比统计',
    description:
      '按分类聚合金额并计算占比，默认降序；未分类账单归入"未分类"组。不传 type 时收入与支出一并统计。',
  })
  @ApiResponse({ status: 200, type: CategoryStatResponseVO, description: '查询成功' })
  @ApiResponse({ status: 422, type: ErrorResponseVO, description: 'month 格式必须为 YYYY-MM' })
  @Get('/category')
  async category(@Query() query: CategoryQueryDTO) {
    return this.statisticsService.categoryBreakdown(
      this.userId,
      query.month,
      query.type,
      query.accountId,
    );
  }
}
