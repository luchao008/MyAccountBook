/**
 * Jest 全局前置设置（在所有测试文件导入前执行）。
 *
 * 两个目的：
 *   1. 让测试使用独立的端口与密钥，避免与开发中的服务（7001）打架、
 *      也避免依赖开发者本机的环境变量。
 *   2. 统一时区，避免日期类断言在不同机器上结果不同。
 */

// 端口：避开开发服务占用的 7001
process.env.PORT = process.env.TEST_PORT || '7002';

// 固定的测试密钥，保证 JWT 相关断言可复现
process.env.JWT_SECRET = 'unit-test-jwt-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.APP_KEYS = 'unit-test-app-keys';

// 数据库：默认复用本地 Docker 容器，可用环境变量覆盖
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'root123456';
process.env.DB_NAME = process.env.DB_NAME || 'account_book';

// 统一时区，保证 record_date / 月度统计断言稳定
process.env.TZ = 'Asia/Shanghai';
