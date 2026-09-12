module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // 测试文件统一放 test/ 下，命名 *.test.ts
  testMatch: ['**/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // 只做转译不做类型检查，避免装饰器元数据带来的全量类型报错拖慢测试
        isolatedModules: true,
      },
    ],
  },
  // 串行执行：每个测试文件都会启动一次 Midway 应用，
  // 并行会导致端口争抢与数据库测试数据互相污染
  maxWorkers: 1,
  // 本机可能没跑 watchman 服务，但 jest 依赖里带了 fb-watchman，
  // 不关掉会直接抛 "unable to talk to your watchman" 让测试进程崩溃
  watchman: false,
  // 单测要连真实 MariaDB（TypeORM 实体关系较复杂，mock 收益低），
  // 连接 + 应用启动较慢，超时放宽
  testTimeout: 30000,
  setupFiles: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
};
