import { MidwayConfig } from '@midwayjs/core';
import { join, relative } from 'path';

/**
 * 计算实体文件的 glob 路径。
 *
 * 背景：@midwayjs/typeorm 内部用 @midwayjs/glob 扫描实体，
 * 其匹配逻辑是把文件绝对路径 replace(entryDir, '') 后比对 pattern，
 * 而 entryDir = baseDir = <项目根>/src。
 * 因此 pattern 必须是【以 / 开头、相对 src 目录】的路径，
 * 例如 '/entity/*.entity{.ts,.js}'。
 * 直接传 join(__dirname, ...) 的绝对路径会匹配不到任何文件。
 */
const entityPattern =
  relative(join(process.cwd(), 'src'), join(__dirname, '../entity')) + '/*.entity{.ts,.js}';

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
        entities: [entityPattern],
      },
    },
  },
} as MidwayConfig;
