import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

/**
 * 金额格式：正数且大于 0，最多两位小数。
 * 负向先行断言排除 "0"、"0.0"、"0.00" 这类零值
 * （与 DB CHECK (amount > 0) 及文档第 6.3 节一致）。
 */
const AMOUNT_PATTERN = /^(?!0+(\.0{1,2})?$)\d+(\.\d{1,2})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** 24 小时制 HH:mm */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTransactionDTO {
  @ApiProperty({
    description: '收支类型',
    example: 'expense',
    enum: ['income', 'expense'],
    required: true,
  })
  @Rule(RuleType.string().required().valid('income', 'expense'))
  type: 'income' | 'expense';

  @ApiProperty({
    description: '金额字符串，必须大于 0 且最多两位小数（用字符串传输避免浮点精度丢失）',
    example: '35.50',
    required: true,
  })
  @Rule(
    RuleType.string()
      .required()
      .pattern(AMOUNT_PATTERN)
      .messages({ 'string.pattern.base': '金额必须为大于 0 的数字，最多两位小数' }),
  )
  amount: string;

  @ApiProperty({ description: '记账日期 YYYY-MM-DD', example: '2026-09-11', required: true })
  @Rule(RuleType.string().pattern(DATE_PATTERN).required())
  recordDate: string;

  @ApiProperty({
    description: '记账时刻 HH:mm（24 小时制）。不传或传 null 表示不记录时间。',
    example: '12:30',
    required: false,
    nullable: true,
  })
  @Rule(RuleType.string().pattern(TIME_PATTERN).optional().allow(null, ''))
  recordTime?: string;

  @ApiProperty({
    description: '分类 ID；必须与 type 的收支类型一致，传空或 null 表示未分类',
    example: '1',
    required: false,
    nullable: true,
  })
  @Rule(RuleType.string().optional().allow(null, ''))
  categoryId?: string;

  @ApiProperty({ description: '备注，最长 255 字', example: '午饭', required: false })
  @Rule(RuleType.string().max(255).allow('').default(''))
  note?: string;

  @ApiProperty({
    description:
      '所属账本 ID。**不传则自动记入该用户的默认账本**（保证老前端无需改动即可继续工作）。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  accountId?: string;
}

export class UpdateTransactionDTO {
  @ApiProperty({
    description: '收支类型；修改时若与分类类型冲突会返回 40000',
    example: 'expense',
    enum: ['income', 'expense'],
    required: false,
  })
  @Rule(RuleType.string().valid('income', 'expense').optional())
  type?: 'income' | 'expense';

  @ApiProperty({
    description: '金额字符串，必须大于 0 且最多两位小数',
    example: '38.00',
    required: false,
  })
  @Rule(
    RuleType.string()
      .pattern(AMOUNT_PATTERN)
      .optional()
      .messages({ 'string.pattern.base': '金额必须为大于 0 的数字，最多两位小数' }),
  )
  amount?: string;

  @ApiProperty({ description: '记账日期 YYYY-MM-DD', example: '2026-09-11', required: false })
  @Rule(RuleType.string().pattern(DATE_PATTERN).optional())
  recordDate?: string;

  @ApiProperty({
    description: '记账时刻 HH:mm；传空字符串或 null 可清除已记录的时间',
    example: '12:30',
    required: false,
    nullable: true,
  })
  @Rule(RuleType.string().pattern(TIME_PATTERN).optional().allow(null, ''))
  recordTime?: string;

  @ApiProperty({
    description: '分类 ID，传 null 可清空分类',
    example: '1',
    required: false,
    nullable: true,
  })
  @Rule(RuleType.string().optional().allow(null, ''))
  categoryId?: string;

  @ApiProperty({ description: '备注', example: '午饭', required: false })
  @Rule(RuleType.string().max(255).allow('').optional())
  note?: string;

  @ApiProperty({
    description: '改挂到另一个账本（传空字符串或 null 表示改挂到默认账本）',
    example: '2',
    required: false,
  })
  @Rule(RuleType.string().optional().allow(null, ''))
  accountId?: string;
}

export class QueryTransactionDTO {
  @ApiProperty({
    description: '起始日期 YYYY-MM-DD（闭区间，含当天）',
    example: '2026-09-01',
    required: false,
  })
  @Rule(RuleType.string().pattern(DATE_PATTERN).optional())
  start?: string;

  @ApiProperty({
    description: '结束日期 YYYY-MM-DD（闭区间，含当天）',
    example: '2026-09-30',
    required: false,
  })
  @Rule(RuleType.string().pattern(DATE_PATTERN).optional())
  end?: string;

  @ApiProperty({
    description: '按收支类型筛选',
    example: 'expense',
    enum: ['income', 'expense'],
    required: false,
  })
  @Rule(RuleType.string().valid('income', 'expense').optional())
  type?: 'income' | 'expense';

  @ApiProperty({ description: '按分类 ID 筛选', example: '1', required: false })
  @Rule(RuleType.string().optional())
  categoryId?: string;

  @ApiProperty({
    description: '按账本筛选。**不传则返回该用户全部账本的账单**（向后兼容旧前端）。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  accountId?: string;

  @ApiProperty({ description: '页码，从 1 开始', example: 1, required: false })
  @Rule(RuleType.number().integer().min(1).default(1))
  page: number;

  @ApiProperty({ description: '每页条数，1-100', example: 20, required: false })
  @Rule(RuleType.number().integer().min(1).max(100).default(20))
  size: number;
}
