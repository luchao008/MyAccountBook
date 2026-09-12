import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

export class RegisterDTO {
  @ApiProperty({
    description: '用户名，3-64 位，全库唯一',
    example: 'alice',
    required: true,
  })
  @Rule(RuleType.string().trim().required().min(3).max(64))
  username: string;

  @ApiProperty({
    description: '密码，6-64 位，bcrypt 加盐存储',
    example: '123456',
    required: true,
    format: 'password',
  })
  @Rule(RuleType.string().required().min(6).max(64))
  password: string;
}
