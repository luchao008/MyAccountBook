import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export class MonthlyQueryDTO {
  @ApiProperty({
    description: '统计月份，格式 YYYY-MM',
    example: '2026-09',
    required: true,
  })
  @Rule(RuleType.string().required().pattern(MONTH_PATTERN))
  month: string;

  @ApiProperty({
    description: '按账本统计。**不传则统计该用户全部账本**（向后兼容旧前端）。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  accountId?: string;
}

export class OverviewQueryDTO {
  @ApiProperty({
    description: '按账本统计总览。不传则统计该用户全部账本。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  accountId?: string;
}

export class CategoryQueryDTO {
  @ApiProperty({
    description: '统计月份，格式 YYYY-MM',
    example: '2026-09',
    required: true,
  })
  @Rule(RuleType.string().required().pattern(MONTH_PATTERN))
  month: string;

  @ApiProperty({
    description: '收支类型，不传则收入与支出一并统计',
    example: 'expense',
    enum: ['income', 'expense'],
    required: false,
  })
  @Rule(RuleType.string().valid('income', 'expense').optional())
  type?: 'income' | 'expense';

  @ApiProperty({
    description: '按账本统计。不传则统计全部账本。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  accountId?: string;
}
