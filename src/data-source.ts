import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { User } from './entity/user.entity';
import { Category } from './entity/category.entity';
import { Transaction } from './entity/transaction.entity';
import { Account } from './entity/account.entity';

/**
 * TypeORM CLI 专用数据源
 * 仅供 migration:generate / migration:run 等命令使用，
 * 应用运行时仍由 @midwayjs/typeorm 按 config.default.ts 建立连接。
 * 两边配置需保持一致。
 */
export default new DataSource({
  type: 'mariadb',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root123456',
  database: process.env.DB_NAME || 'account_book',
  charset: 'utf8mb4',
  timezone: '+08:00',
  synchronize: false,
  logging: false,
  entities: [User, Category, Transaction, Account],
  migrations: [join(__dirname, 'migration/*{.ts,.js}')],
});
