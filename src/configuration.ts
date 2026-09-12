import { Configuration, CommonJSFileDetector, App, ILifeCycle } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as typeorm from '@midwayjs/typeorm';
import * as validate from '@midwayjs/validate';
import * as jwt from '@midwayjs/jwt';
import * as swagger from '@midwayjs/swagger';
import { join } from 'path';
import { DefaultErrorFilter } from './filter/default.filter';
import { JwtGuardMiddleware } from './middleware/jwt.guard';
import { ResponseMiddleware } from './middleware/response.middleware';

@Configuration({
  imports: [koa, typeorm, validate, jwt, swagger],
  importConfigs: [join(__dirname, './config')],
  // Midway v4 的文件扫描器需显式声明，
  // 否则 controller / middleware / filter 等文件不会被自动加载
  detector: new CommonJSFileDetector({
    conflictCheck: true,
  }),
})
export class MainConfiguration implements ILifeCycle {
  @App()
  app: koa.Application;

  async onReady() {
    // Midway v4 不再读取 config.middleware，
    // 全局中间件与过滤器都必须在 onReady 中显式注册。
    // 顺序：JWT 守卫 -> 响应包装
    this.app.useMiddleware([JwtGuardMiddleware, ResponseMiddleware]);
    this.app.useFilter([DefaultErrorFilter]);
  }
}
