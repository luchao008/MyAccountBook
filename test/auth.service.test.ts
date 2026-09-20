import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { JwtService } from '@midwayjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { ErrorCode } from '../src/common/error-code';
import {
  cleanupUsers,
  closeTestDataSource,
  expectBusinessError,
  getTestDataSource,
  randomUsername,
} from './helper';

describe('AuthService', () => {
  let app: IMidwayApplication;
  let authService: AuthService;
  let jwtService: JwtService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    authService = await ctx.getAsync(AuthService);
    jwtService = await ctx.getAsync(JwtService);
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    // 必须关掉自建数据源，否则数据库连接句柄不释放，jest 进程不会退出
    await closeTestDataSource();
  });

  describe('register（申请制）', () => {
    it('注册成功：返回 pending 状态与用户信息，不签发 token', async () => {
      const username = randomUsername('reg');
      const result = await authService.register({
        username,
        password: '123456',
      });
      createdUserIds.push(result.user.id);

      // 申请制（D18）：注册不再"即登录"，必须等待中台审批
      expect(result.status).toBe('pending');
      expect(result.message).toEqual(expect.any(String));
      expect('token' in result).toBe(false);
      expect('expiresIn' in result).toBe(false);
      expect(result.user.username).toBe(username);
      expect(result.user.id).toEqual(expect.any(String));
    });

    it('注册后用户状态为 pending（登录被拦截，40102）', async () => {
      const username = randomUsername('reg');
      const password = '123456';
      const registered = await authService.register({ username, password });
      createdUserIds.push(registered.user.id);

      // 密码正确也不能登录：账号还在审核中
      await expectBusinessError(
        () => authService.login({ username, password }),
        ErrorCode.USER_PENDING,
      );
    });

    it('注册成功：密码以哈希存储，不返回明文', async () => {
      const username = randomUsername('reg');
      const result = await authService.register({
        username,
        password: 'plain-password',
      });
      createdUserIds.push(result.user.id);

      // 返回结果里不应出现明文密码
      expect(JSON.stringify(result)).not.toContain('plain-password');
    });

    it('用户名重复：抛 40901', async () => {
      const username = randomUsername('dup');
      const first = await authService.register({ username, password: '123456' });
      createdUserIds.push(first.user.id);

      await expectBusinessError(
        () => authService.register({ username, password: '654321' }),
        ErrorCode.USERNAME_EXISTS,
      );
    });
  });

  describe('login', () => {
    /** 注册 + 激活（模拟中台审批通过），得到可登录用户 */
    async function createActiveUser(prefix: string, password: string) {
      const username = randomUsername(prefix);
      const registered = await authService.register({ username, password });
      createdUserIds.push(registered.user.id);
      const ds = await getTestDataSource();
      await ds.getRepository('users').update(registered.user.id, { status: 'active' });
      return registered;
    }

    it('登录成功：返回可解析的 token', async () => {
      const password = 'abcdef';
      const registered = await createActiveUser('login', password);

      const result = await authService.login({
        username: registered.user.username,
        password,
      });
      expect(result.token).toEqual(expect.any(String));
      expect(result.expiresIn).toBe('7d');

      const payload: any = await jwtService.verify(result.token);
      expect(payload.userId).toBe(registered.user.id);
      expect(payload.username).toBe(registered.user.username);
    });

    it('disabled 用户登录：抛 40103（已停用）', async () => {
      const password = '123456';
      const registered = await createActiveUser('dis', password);

      const ds = await getTestDataSource();
      await ds.getRepository('users').update(registered.user.id, { status: 'disabled' });

      await expectBusinessError(
        () => authService.login({ username: registered.user.username, password }),
        ErrorCode.USER_DISABLED,
      );
    });

    it('密码错误：抛 40101', async () => {
      const password = 'correct-pwd';
      const registered = await createActiveUser('wrongpwd', password);

      await expectBusinessError(
        () => authService.login({ username: registered.user.username, password: 'wrong-pwd' }),
        ErrorCode.LOGIN_FAILED,
      );
    });

    it('用户不存在：抛 40101，且提示与密码错误完全一致（不暴露用户是否存在）', async () => {
      let missingUserMsg = '';
      let wrongPwdMsg = '';
      const password = 'correct-pwd';
      const registered = await createActiveUser('probe', password);

      try {
        await authService.login({
          username: randomUsername('nobody'),
          password: 'whatever',
        });
      } catch (err: any) {
        missingUserMsg = err.message;
      }

      try {
        await authService.login({ username: registered.user.username, password: 'wrong-pwd' });
      } catch (err: any) {
        wrongPwdMsg = err.message;
      }

      expect(missingUserMsg).toBe('用户名或密码错误');
      expect(missingUserMsg).toBe(wrongPwdMsg);
    });
  });
});
