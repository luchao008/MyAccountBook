import { Provide, Inject } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@midwayjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entity/user.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { LoginDTO } from './dto/login.dto';
import { RegisterDTO } from './dto/register.dto';
import { AccountService, DEFAULT_ACCOUNT_NAME } from '../account/account.service';

const SALT_ROUNDS = 10;

@Provide()
export class AuthService {
  @InjectDataSource()
  dataSource: DataSource;

  @Inject()
  jwtService: JwtService;

  @Inject()
  accountService: AccountService;

  private get repo(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  /**
   * 登录：校验账号密码，签发 JWT
   */
  async login(dto: LoginDTO) {
    const user = await this.repo.findOne({
      where: { username: dto.username },
    });

    // 统一提示，避免暴露"用户是否存在"
    if (!user) {
      throw new BusinessError('用户名或密码错误', ErrorCode.LOGIN_FAILED);
    }

    const matched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matched) {
      throw new BusinessError('用户名或密码错误', ErrorCode.LOGIN_FAILED);
    }

    const token = await this.jwtService.sign({
      userId: user.id,
      username: user.username,
    });

    return {
      token,
      expiresIn: '7d',
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  /**
   * 注册：创建用户，返回 token（注册即登录）
   */
  async register(dto: RegisterDTO) {
    const exists = await this.repo.findOne({
      where: { username: dto.username },
    });
    if (exists) {
      throw new BusinessError('用户名已存在', ErrorCode.USERNAME_EXISTS);
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this.repo.create({
      username: dto.username,
      passwordHash,
    });
    const saved = await this.repo.save(user);

    // 多账本：新用户自动获得一个默认账本。
    // AccountService.create 会把用户的第一个账本自动标记为 isDefault，
    // 从而保证「每个用户必定有默认账本」这一不变量从注册那刻起成立。
    await this.accountService.create(saved.id, {
      name: DEFAULT_ACCOUNT_NAME,
      icon: 'wallet',
      sort: 0,
    });

    const token = await this.jwtService.sign({
      userId: saved.id,
      username: saved.username,
    });

    return {
      token,
      expiresIn: '7d',
      user: {
        id: saved.id,
        username: saved.username,
      },
    };
  }
}
