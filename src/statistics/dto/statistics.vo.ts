import { ApiProperty } from '@midwayjs/swagger';

/** 首页总览（历年累计 + 五个时间区间）的响应模型 */

export class TotalStatVO {
  @ApiProperty({ description: '历年累计收入', example: '2155580.64' })
  income: string;

  @ApiProperty({ description: '历年累计支出', example: '1866713.65' })
  expense: string;

  @ApiProperty({ description: '总结余 = 收入 - 支出', example: '288866.99' })
  balance: string;

  @ApiProperty({ description: '累计记账笔数', example: 1280 })
  count: number;
}

export class RangeStatVO {
  @ApiProperty({
    description: '区间标识',
    example: 'month',
    enum: ['today', 'week', 'month', 'year', 'lastYear'],
  })
  key: string;

  @ApiProperty({ description: '区间名称', example: '本月' })
  label: string;

  @ApiProperty({ description: '展示用的期间文案', example: '09月01日 - 09月30日' })
  period: string;

  @ApiProperty({ description: '区间起始日期（闭区间）', example: '2026-09-01' })
  start: string;

  @ApiProperty({ description: '区间结束日期（闭区间）', example: '2026-09-30' })
  end: string;

  @ApiProperty({ description: '区间收入', example: '11756.33' })
  income: string;

  @ApiProperty({ description: '区间支出', example: '4852.01' })
  expense: string;

  @ApiProperty({ description: '区间结余', example: '6904.32' })
  balance: string;

  @ApiProperty({ description: '区间记账笔数', example: 24 })
  count: number;
}

export class OverviewDataVO {
  @ApiProperty({ type: TotalStatVO, description: '历年累计（当前账本）' })
  total: TotalStatVO;

  @ApiProperty({
    type: RangeStatVO,
    isArray: true,
    description: '今天 / 本周 / 本月 / 本年 / 去年',
  })
  ranges: RangeStatVO[];
}

export class OverviewResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: OverviewDataVO })
  data: OverviewDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}
