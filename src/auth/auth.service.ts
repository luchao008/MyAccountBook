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
   * 登录：校验账号密码 + 账号状态，签发 JWT。
   *
   * 状态拦截（中台设计决策 D18，注册改申请制）：
   *   pending  -> 40102 账号审核中（注册后需管理员在中台审批）
   *   disabled -> 40103 账号已停用
   * 只有 active 用户能登录。
   *
   * 注意顺序：先统一校验"用户名或密码错误"，再查状态——
   * 否则可以通过错误信息差异探测"这个用户名存在且被停用"。
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

    // 状态拦截（放在密码校验之后，防用户名探测）
    if (user.status === 'pending') {
      throw new BusinessError('该账号正在审核中，请等待管理员审批后登录', ErrorCode.USER_PENDING);
    }
    if (user.status === 'disabled') {
      throw new BusinessError('该账号已被停用，如有疑问请联系客服', ErrorCode.USER_DISABLED);
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
   * 注册：创建 pending 用户，不签发 token（申请制，D18）。
   *
   * 变更点（相对旧版"注册即登录"）：
   *   - 返回值不再含 token —— 新用户必须等管理员审批后才能登录
   *   - 默认账本与预设分类仍照常创建（沿用旧逻辑）：
   *     驳回时一并物理删除（reject 接口级联删），
   *     通过时用户拿到的是完整就绪的账号，无需二次初始化。
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
      // 显式声明（列默认值也是 pending，但显式写防止将来默认值变动悄悄改变行为）
      status: 'pending' as const,
    });
    const saved = await this.repo.save(user);

    // 多账本：新用户自动获得一个默认账本（审批期间即可就绪，见上方注释）
    await this.accountService.create(saved.id, {
      name: DEFAULT_ACCOUNT_NAME,
      icon: 'wallet',
      sort: 0,
    });

    return {
      status: 'pending' as const,
      message: '注册申请已提交，请等待管理员审批后登录',
      user: {
        id: saved.id,
        username: saved.username,
      },
    };
  }
}
