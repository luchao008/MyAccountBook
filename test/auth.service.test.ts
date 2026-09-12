import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { JwtService } from '@midwayjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';

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

  describe('register', () => {
    it('注册成功：返回 token、expiresIn 与用户信息', async () => {
      const username = randomUsername('reg');
      const result = await authService.register({
        username,
        password: '123456',
      });
      createdUserIds.push(result.user.id);

      expect(result.token).toEqual(expect.any(String));
      expect(result.expiresIn).toBe('7d');
      expect(result.user.username).toBe(username);
      expect(result.user.id).toEqual(expect.any(String));
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
      // token 可解出 userId，说明签名内容正确
      const payload: any = await jwtService.verify(result.token);
      expect(payload.userId).toBe(result.user.id);
      expect(payload.username).toBe(username);
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
    it('登录成功：返回可解析的 token', async () => {
      const username = randomUsername('login');
      const password = 'abcdef';
      const registered = await authService.register({ username, password });
      createdUserIds.push(registered.user.id);

      const result = await authService.login({ username, password });
      expect(result.token).toEqual(expect.any(String));

      const payload: any = await jwtService.verify(result.token);
      expect(payload.userId).toBe(registered.user.id);
    });

    it('密码错误：抛 40101', async () => {
      const username = randomUsername('login');
      const registered = await authService.register({
        username,
        password: 'correct-pwd',
      });
      createdUserIds.push(registered.user.id);

      await expectBusinessError(
        () => authService.login({ username, password: 'wrong-pwd' }),
        ErrorCode.LOGIN_FAILED,
      );
    });

    it('用户不存在：抛 40101，且提示与密码错误完全一致（不暴露用户是否存在）', async () => {
      let missingUserMsg = '';
      let wrongPwdMsg = '';
      const username = randomUsername('login');
      const registered = await authService.register({
        username,
        password: 'correct-pwd',
      });
      createdUserIds.push(registered.user.id);

      try {
        await authService.login({
          username: randomUsername('nobody'),
          password: 'whatever',
        });
      } catch (err: any) {
        missingUserMsg = err.message;
      }

      try {
        await authService.login({ username, password: 'wrong-pwd' });
      } catch (err: any) {
        wrongPwdMsg = err.message;
      }

      expect(missingUserMsg).toBe('用户名或密码错误');
      expect(missingUserMsg).toBe(wrongPwdMsg);
    });
  });
});
