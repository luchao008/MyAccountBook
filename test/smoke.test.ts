import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import { AuthService } from '../src/auth/auth.service';

/**
 * 基础设施冒烟测试。
 *
 * 目的：先确认「Jest + ts-jest + Midway mock + TypeORM」这条链路能跑通，
 * 再往上堆业务用例。否则一上来写几十个用例，失败时分不清是
 * 测试环境问题还是业务代码问题。
 */
describe('测试基础设施', () => {
  let app: IMidwayApplication;

  beforeAll(async () => {
    app = await createApp(process.cwd());
  });

  afterAll(async () => {
    await close(app);
  });

  it('应用可启动', () => {
    expect(app).toBeDefined();
    expect(app.getApplicationContext()).toBeDefined();
  });

  it('可以解析出 Service（依赖注入与文件扫描正常）', async () => {
    const service = await app.getApplicationContext().getAsync(AuthService);
    expect(service).toBeInstanceOf(AuthService);
  });
});
