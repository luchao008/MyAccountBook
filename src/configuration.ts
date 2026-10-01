import { Configuration, CommonJSFileDetector, App, ILifeCycle } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as typeorm from '@midwayjs/typeorm';
import * as validate from '@midwayjs/validate';
import * as jwt from '@midwayjs/jwt';
import * as swagger from '@midwayjs/swagger';
import * as crossDomain from '@midwayjs/cross-domain';
import { join } from 'path';
import { DefaultErrorFilter } from './filter/default.filter';
import { JwtGuardMiddleware } from './middleware/jwt.guard';
import { AdminGuardMiddleware } from './middleware/admin.guard';
import { ResponseMiddleware } from './middleware/response.middleware';
import { CompressMiddleware } from './middleware/compress.middleware';

@Configuration({
  imports: [koa, typeorm, validate, jwt, swagger, crossDomain],
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
    // 顺序：gzip 压缩 -> JWT 守卫 -> 响应包装
    //
    // 压缩必须放在数组最前面（即最外层）：useMiddleware 是 insertLast 语义，
    // 数组第 0 项先执行、最外层，而 koa-compress 是在 await next() 之后才读 ctx.body。
    // 只有站在 ResponseMiddleware 外面，等它把返回值包装成 {code,data,message}
    // 并且 controller 的异步逻辑全部跑完之后，压缩读到的才是最终 body。
    // 若放在 ResponseMiddleware 之后，读到的是包装前的中间态（甚至 undefined），压了个空。
    this.app.useMiddleware([
      CompressMiddleware,
      JwtGuardMiddleware,
      AdminGuardMiddleware,
      ResponseMiddleware,
    ]);
    this.app.useFilter([DefaultErrorFilter]);
  }
}
