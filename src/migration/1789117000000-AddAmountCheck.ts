import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 补充 amount > 0 的数据库层约束。
 *
 * 背景：TypeORM 0.3 的 @Check 装饰器在 MySQL/MariaDB 方言下不参与
 * schema 生成，因此实体上的 @Check 无法自动落到 DDL，需要手工补。
 * 对齐规划文档第 5 节 transactions 表的 CHECK (amount > 0)。
 */
export class AddAmountCheck1789117000000 implements MigrationInterface {
  name = 'AddAmountCheck1789117000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD CONSTRAINT \`transactions_amount_check\` CHECK (\`amount\` > 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`transactions\` DROP CONSTRAINT \`transactions_amount_check\``,
    );
  }
}
