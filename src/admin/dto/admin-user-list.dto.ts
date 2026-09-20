import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

/** 中台用户列表查询参数（全部可选，走 GET query） */
export class AdminUserListDTO {
  @ApiProperty({ description: '页码，从 1 开始', example: 1, required: false })
  @Rule(RuleType.number().integer().min(1).default(1))
  page: number;

  @ApiProperty({ description: '每页条数，1-100', example: 20, required: false })
  @Rule(RuleType.number().integer().min(1).max(100).default(20))
  pageSize: number;

  @ApiProperty({ description: '用户名模糊搜索', example: 'demo', required: false })
  @Rule(RuleType.string().trim().allow('').max(64).default(''))
  keyword?: string;

  @ApiProperty({
    description: '状态筛选：pending / active / disabled，空 = 全部',
    example: 'pending',
    required: false,
    enum: ['', 'pending', 'active', 'disabled'],
  })
  @Rule(RuleType.string().valid('', 'pending', 'active', 'disabled').default(''))
  status?: '' | 'pending' | 'active' | 'disabled';
}
