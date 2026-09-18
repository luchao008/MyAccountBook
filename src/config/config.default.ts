import { MidwayConfig } from '@midwayjs/core';
import { User } from '../entity/user.entity';
import { Category } from '../entity/category.entity';
import { Transaction } from '../entity/transaction.entity';
import { Account } from '../entity/account.entity';

/**
 * 实体列表。
 *
 * ⚠️ **直接传实体类数组，不要用 glob 路径**（2026-09-18 修）。
 *
 * 原来用 `relative(process.cwd()/src, __dirname/../entity) + '/*.entity{...}'`
 * 算 glob：开发时 baseDir = <根>/src，能匹配；但**构建后目录结构变成 dist**，
 * 该计算失效 → 生产启动后所有走实体的查询抛
 * `EntityMetadataNotFoundError: No metadata for "User" was found`（注册即 500）。
 *
 * 改为显式 import 实体类（与 `src/data-source.ts` 一致）：
 * 不依赖任何运行时路径，dev / prod 都稳。
 */
const entities = [User, Category, Transaction, Account];

export default {
  keys: process.env.APP_KEYS || 'my-account-book-secret-key',

  koa: {
    port: Number(process.env.PORT) || 7001,
  },

  // JWT 配置
  jwt: {
    secret: process.env.JWT_SECRET || 'my-account-book-jwt-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // DTO 校验（@midwayjs/validate / joi）
  validation: {
    errorStatus: 422,
    throwValidateError: true,
  },

  /**
   * CORS（@midwayjs/cross-domain）。
   *
   * 背景：开发期前端走 Vite 代理（/api -> 127.0.0.1:7001）绕开跨域，
   * 但**前端要独立域名部署时**必须由后端放行 —— 这里就是那个放行点。
   *
   * 策略：**白名单**，不是「反射任意 Origin」。允许的来源由环境变量
   * `CORS_ORIGINS`（逗号分隔）提供，默认只放行本地开发源；
   * 部署到独立域名时改环境变量即可，无需改代码。
   *
   * 只放行命中白名单的 Origin：不在名单里的返回 false，组件会跳过 CORS 头
   * （浏览器侧照旧拦截）。非浏览器请求（无 Origin 头）不受影响。
   *
   * 本项目鉴权用 Bearer token（不依赖 cookie），故 credentials 保持 false。
   */
  cors: {
    origin: (() => {
      const raw = process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
      const allow = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return (req: { get: (k: string) => string }) => {
        const origin = req.get('origin');
        return origin && allow.includes(origin) ? origin : false;
      };
    })(),
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH',
    allowHeaders: 'Content-Type,Authorization',
    credentials: false,
  },

  /**
   * 请求体上限。
   *
   * 默认 jsonLimit 是 1mb；流水导入用 JSON + base64 承载 xlsx
   * （随手记账单 664 行约 41KB → base64 约 55KB），1MB 也够，
   * 但**显式写出来**：这个上限是接口契约的一部分，
   * 后端 `MAX_XLSX_BYTES`（2MB → base64 约 2.7MB）必须落在它之内，
   * 否则用户会拿到 Koa 的 413 而不是我们可读的 40008。
   */
  bodyParser: {
    jsonLimit: '8mb',
    formLimit: '8mb',
    textLimit: '8mb',
  },

  // Swagger 接口文档
  // 访问 http://127.0.0.1:7001/swagger-ui
  swagger: {
    title: '个人记账应用 API',
    description: 'Midway.js 4 + MariaDB 10.11 实现的记账应用后端接口',
    version: '1.0.0',
    // 全局 Bearer 认证
    auth: {
      name: 'Authorization',
      authType: 'bearer',
    },
  },

  typeorm: {
    dataSource: {
      default: {
        // 有意偏离文档：实际运行的是 MariaDB 10.11，
        // 使用 TypeORM 专用 'mariadb' 驱动（底层仍复用 mysql2 包）
        type: 'mariadb',
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        username: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root123456',
        database: process.env.DB_NAME || 'account_book',
        charset: 'utf8mb4',
        timezone: '+08:00',
        // 生产用迁移，禁止自动改表（文档第 4.1 节）
        synchronize: false,
        logging: false,
        entities,
      },
    },
  },
} as MidwayConfig;
