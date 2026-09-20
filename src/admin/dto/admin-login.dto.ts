import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

export class AdminLoginDTO {
  @ApiProperty({ description: '管理员用户名', example: 'admin', required: true })
  @Rule(RuleType.string().trim().required().min(1).max(64))
  username: string;

  @ApiProperty({
    description: '密码，6-64 位',
    example: 'admin123456',
    required: true,
    format: 'password',
  })
  @Rule(RuleType.string().required().min(6).max(64))
  password: string;
}
