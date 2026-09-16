import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

export class CreateAccountDTO {
  @ApiProperty({
    description: '账本名称，同一用户名下唯一',
    example: '家庭账本',
    required: true,
  })
  @Rule(RuleType.string().trim().required().min(1).max(64))
  name: string;

  @ApiProperty({ description: '图标标识，前端自行映射', example: 'wallet', required: false })
  @Rule(RuleType.string().max(64).allow('').default(''))
  icon?: string;

  @ApiProperty({ description: '排序值，升序', example: 0, required: false })
  @Rule(RuleType.number().integer().default(0))
  sort?: number;

  @ApiProperty({
    description:
      '要从默认账本（母本）复制过来的分类 id 列表。不传 = 复制全部（默认全选）；' +
      '传一级会连带其下二级，只传二级会自动带上其父。仅对非默认账本生效。',
    example: ['1', '2'],
    required: false,
  })
  @Rule(RuleType.array().items(RuleType.string().required()).optional())
  categoryIds?: string[];
}

export class UpdateAccountDTO {
  @ApiProperty({ description: '账本名称，同一用户名下唯一', example: '家庭账本', required: false })
  @Rule(RuleType.string().trim().min(1).max(64).optional())
  name?: string;

  @ApiProperty({ description: '图标标识', example: 'wallet', required: false })
  @Rule(RuleType.string().max(64).allow('').optional())
  icon?: string;

  @ApiProperty({ description: '排序值', example: 0, required: false })
  @Rule(RuleType.number().integer().optional())
  sort?: number;

  @ApiProperty({
    description: '设为默认账本（会把原默认账本的标记摘掉）',
    example: false,
    required: false,
  })
  @Rule(RuleType.boolean().optional())
  isDefault?: boolean;
}

/** 删除账本：必须原样输入账本名，防误删。走查询串传递（DELETE 带 body 兼容性差） */
export class DeleteAccountQueryDTO {
  @ApiProperty({
    description: '删除确认：必须与账本名完全一致，否则拒绝删除',
    example: '旧账本',
    required: true,
  })
  @Rule(RuleType.string().required())
  confirmName: string;
}

/** 合并账本：把 sourceId 并入 targetId */
export class MergeAccountDTO {
  @ApiProperty({
    description: '目标账本 ID（数据并入到这里）',
    example: '1',
    required: true,
  })
  @Rule(RuleType.string().required())
  targetId: string;

  @ApiProperty({
    description: '被合并掉的源账本 ID（合并完成后会被删除）',
    example: '2',
    required: true,
  })
  @Rule(RuleType.string().required())
  sourceId: string;
}

export class ImportCategoriesDTO {
  @ApiProperty({
    description:
      '要从默认账本（母本）复制过来的分类 id 列表。传一级会连带其下二级，只传二级会自动带上其父。',
    example: ['1', '2'],
    required: true,
  })
  @Rule(RuleType.array().items(RuleType.string().required()).required().min(1).max(200))
  categoryIds: string[];
}
