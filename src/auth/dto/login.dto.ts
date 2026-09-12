import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

export class LoginDTO {
  @ApiProperty({ description: '用户名', example: 'alice', required: true })
  @Rule(RuleType.string().trim().required().min(1).max(64))
  username: string;

  @ApiProperty({
    description: '密码，6-64 位',
    example: '123456',
    required: true,
    format: 'password',
  })
  @Rule(RuleType.string().required().min(6).max(64))
  password: string;
}
