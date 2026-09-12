import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

export class CreateCategoryDTO {
  @ApiProperty({ description: '分类名，同一用户名下唯一', example: '餐饮', required: true })
  @Rule(RuleType.string().trim().required().min(1).max(64))
  name: string;

  @ApiProperty({
    description: '收支类型',
    example: 'expense',
    enum: ['income', 'expense'],
    required: true,
  })
  @Rule(RuleType.string().required().valid('income', 'expense'))
  type: 'income' | 'expense';

  @ApiProperty({ description: '图标标识或 emoji', example: '🍜', required: false })
  @Rule(RuleType.string().max(64).allow('').default(''))
  icon?: string;

  @ApiProperty({ description: '排序值，升序', example: 0, required: false })
  @Rule(RuleType.number().integer().default(0))
  sort?: number;

  @ApiProperty({
    description:
      '父分类 ID。传值即为二级分类，**父分类必须是一级分类**（不支持三级）；不传则创建一级分类。',
    example: '1',
    required: false,
    nullable: true,
  })
  @Rule(RuleType.string().optional().allow(null, ''))
  parentId?: string;
}

export class UpdateCategoryDTO {
  @ApiProperty({ description: '分类名，同一用户名下唯一', example: '餐饮', required: false })
  @Rule(RuleType.string().trim().min(1).max(64).optional())
  name?: string;

  @ApiProperty({
    description: '收支类型',
    example: 'expense',
    enum: ['income', 'expense'],
    required: false,
  })
  @Rule(RuleType.string().valid('income', 'expense').optional())
  type?: 'income' | 'expense';

  @ApiProperty({ description: '图标标识或 emoji', example: '🍜', required: false })
  @Rule(RuleType.string().max(64).allow('').optional())
  icon?: string;

  @ApiProperty({ description: '排序值', example: 0, required: false })
  @Rule(RuleType.number().integer().optional())
  sort?: number;

  @ApiProperty({
    description:
      '父分类 ID。传空字符串表示提升为一级分类；**若该分类自身已有子分类，则不允许再挂到别的分类下**（会形成三级）。',
    example: '1',
    required: false,
    nullable: true,
  })
  @Rule(RuleType.string().optional().allow(null, ''))
  parentId?: string;
}

export class QueryCategoryDTO {
  @ApiProperty({
    description: '按收支类型筛选，不传则返回全部',
    example: 'expense',
    enum: ['income', 'expense'],
    required: false,
  })
  @Rule(RuleType.string().valid('income', 'expense').optional())
  type?: 'income' | 'expense';

  @ApiProperty({
    description:
      '按父分类筛选：传 ID 返回该父下的二级分类；传 `root` 只返回一级分类；不传返回全部分类（含 parentId，前端可自行组装成树）。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  parentId?: string;
}
