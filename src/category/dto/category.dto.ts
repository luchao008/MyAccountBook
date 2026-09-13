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

  @ApiProperty({
    description:
      '可见性过滤。`all`（默认）返回全部分类，供分类管理页使用（要能看到被隐藏的才能取消隐藏）；' +
      '`visible` 只返回**可用于记账**的分类 —— 自身未隐藏，且若为二级分类其父也未隐藏。' +
      '不改用布尔参数是因为 query 值都是字符串，`"false"` 是 truthy，容易埋坑。',
    example: 'all',
    enum: ['all', 'visible'],
    required: false,
    default: 'all',
  })
  @Rule(RuleType.string().valid('all', 'visible').optional().default('all'))
  visibility?: 'all' | 'visible';
}

export class BatchDeleteCategoryDTO {
  @ApiProperty({
    description:
      '要删除的分类 ID 列表，一级与二级可混合。传一级会连同其下二级一并删除（CASCADE）。' +
      '列表内的重复 id 会自动去重；不存在的 id 会整单报错（不静默少删）。',
    example: ['1', '2'],
    required: true,
  })
  @Rule(RuleType.array().items(RuleType.string().required()).required().min(1).max(200))
  ids: string[];
}

export class BatchHideCategoryDTO {
  @ApiProperty({ description: '要操作的分类 ID 列表', example: ['1', '2'], required: true })
  @Rule(RuleType.array().items(RuleType.string().required()).required().min(1).max(200))
  ids: string[];

  @ApiProperty({
    description: 'true = 隐藏；false = 恢复显示',
    example: true,
    required: true,
  })
  @Rule(RuleType.boolean().required())
  hidden: boolean;
}
