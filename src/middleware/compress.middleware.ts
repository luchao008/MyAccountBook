import { Middleware, IMiddleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import compress from 'koa-compress';

/**
 * gzip 响应压缩中间件
 *
 * 只做一件事：对 /api 的响应体做 gzip 压缩。
 *
 * 为什么只压 /api：
 *   - /api 是本应用唯一的 JSON 数据出口，流水列表一次返回 100 条嵌套 JSON，
 *     JSON 是重复键名极多的文本，压缩比通常能到 5~10 倍。
 *   - 非 /api 路由是 Swagger 文档页与框架自带资源，属于静态内容，
 *     更适合交给 nginx 的 gzip / gzip_static 处理（还能走预压缩产物），
 *     在应用进程里再压一遍只是重复消耗 CPU，换不到额外收益。
 *   - 同时与 ResponseMiddleware 的 match 保持一致，便于理解"哪些请求会走应用层处理"。
 *
 * 为什么阈值取 1KB：
 *   - gzip 本身有固定开销（头部 + 定长块约 20 字节），响应体太小会出现
 *     "压完比原文还大"的情况；1KB 以下压缩既省不了字节，还要为每个响应付 CPU。
 *   - 1KB 也是 koa-compress 的默认值，符合社区预期，不需要额外解释成本。
 *   - 真正的大响应（列表接口几十 KB~几百 KB）远超阈值，不会被漏掉。
 *
 * 为什么不开 brotli（也不开 zstd、deflate）：
 *   - 本项目的部署是明文 HTTP，浏览器只在 HTTPS 下才广告 `br`（以及 `zstd`），
 *     明文下客户端永远不会选中它们，开了就是死在配置里的分支，只是把
 *     koa-compress 的协商路径变长。
 *   - deflate 的历史实现有兼容歧义（部分老客户端按 raw deflate 解），
 *     而 gzip 是所有支持 deflate 的客户端都支持的，没有保留它的必要。
 *   - 结论：显式把非 gzip 编码全部关掉，协商结果只可能是 gzip 或 identity，
 *     行为可预期；哪天上了 HTTPS 想启用 br，把 br 一行去掉即可。
 */
@Middleware()
export class CompressMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    // 末尾的 as unknown as 不是可有可无的装饰，去掉 tsc 会报 TS2416 / TS2322：
    // koa-compress 自带的类型把返回值声明成 @types/koa 的 Koa.Middleware，
    // 而 Midway 的 Context 是 IMidwayKoaContext，两者的 cookies.set 重载对不上
    // （cookie 的 priority 一边是 'low'/'medium'/'high'，另一边是大小写不同的
    // 'Low'/'Medium'/'High'）。运行时传进来的就是同一个 Koa ctx，所以断言是安全的。
    return compress({
      // 只保留 gzip，其余编码显式关闭（见上方"为什么不开 brotli"）
      gzip: {},
      br: false,
      zstd: false,
      deflate: false,
      // 小于 1KB 的响应不压（见上方"为什么阈值取 1KB"）
      threshold: 1024,
    }) as unknown as (ctx: Context, next: NextFunction) => Promise<void>;
  }

  /**
   * 只对 /api 生效（见上方"为什么只压 /api"）。
   * 注意：ctx.path 已带 /api 前缀。
   */
  match(ctx: Context): boolean {
    return ctx.path.startsWith('/api');
  }
}
