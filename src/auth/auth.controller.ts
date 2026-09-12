import { Controller, Post, Body, Inject } from '@midwayjs/core';
import { ApiTags, ApiOperation, ApiResponse } from '@midwayjs/swagger';
import { AuthService } from './auth.service';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import {
  LoginResponseVO,
  RegisterResponseVO,
  ErrorResponseVO,
} from '../common/swagger/response.vo';

@ApiTags(['认证'])
@Controller('/api/auth')
export class AuthController {
  @Inject()
  authService: AuthService;

  @ApiOperation({ summary: '用户登录', description: '校验账号密码，成功返回 JWT（有效期 7 天）。' })
  @ApiResponse({
    status: 200,
    type: LoginResponseVO,
    description: '登录成功。失败时 code=40101，message=用户名或密码错误',
  })
  @Post('/login')
  async login(@Body() dto: LoginDTO) {
    return this.authService.login(dto);
  }

  @ApiOperation({
    summary: '用户注册',
    description: '创建账号并直接返回 JWT（注册即登录，无需再调一次登录接口）。',
  })
  @ApiResponse({
    status: 200,
    type: RegisterResponseVO,
    description: '注册成功。用户名已存在时 code=40901',
  })
  @ApiResponse({
    status: 422,
    type: ErrorResponseVO,
    description: '参数校验失败（如密码不足 6 位）',
  })
  @Post('/register')
  async register(@Body() dto: RegisterDTO) {
    return this.authService.register(dto);
  }
}
