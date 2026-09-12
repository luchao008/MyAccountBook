import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 多账本改造
 *
 * 目标：在保留"唯一默认账本"语义的前提下，把单账本结构平滑升级为多账本。
 *
 * 迁移步骤（顺序不能变）：
 *   1. 建 accounts 表（含 user_id 外键 CASCADE、用户名下账本名唯一）
 *   2. transactions 加 account_id 列（先可空，避免存量数据报错）
 *   3. 为每个既有用户创建「默认账本」，is_default = 1
 *   4. 把全部存量交易挂到各自用户的默认账本
 *   5. 确认无遗漏后，把 account_id 收紧为 NOT NULL，并加外键 ON DELETE CASCADE
 *
 * 向后兼容性：
 *   - 存量接口无需改动即可继续工作（所有旧数据都归到默认账本）
 *   - 应用层的 create 在未传 accountId 时会回退到默认账本（见 TransactionService）
 */
export class MultiAccount1789137009697 implements MigrationInterface {
  name = 'MultiAccount1789137009697';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 账本表
    await queryRunner.query(
      `CREATE TABLE \`accounts\` (\`id\` bigint UNSIGNED NOT NULL AUTO_INCREMENT, \`user_id\` bigint UNSIGNED NOT NULL, \`name\` varchar(64) NOT NULL, \`icon\` varchar(64) NOT NULL DEFAULT '', \`sort\` int NOT NULL DEFAULT '0', \`is_default\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`uk_user_account_name\` (\`user_id\`, \`name\`), INDEX \`idx_user_default\` (\`user_id\`, \`is_default\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`accounts\` ADD CONSTRAINT \`FK_accounts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // 2. transactions 增加 account_id（先可空）
    await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`account_id\` bigint UNSIGNED NULL`);
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD INDEX \`idx_user_account_date\` (\`user_id\`, \`account_id\`, \`record_date\`)`,
    );

    // 3. 为既有用户建默认账本（幂等：没有 users 时这条不会产生行）
    await queryRunner.query(
      `INSERT INTO \`accounts\` (\`user_id\`, \`name\`, \`icon\`, \`sort\`, \`is_default\`) SELECT \`id\`, '默认账本', 'wallet', 0, 1 FROM \`users\``,
    );

    // 4. 存量交易归入各自用户的默认账本
    await queryRunner.query(
      `UPDATE \`transactions\` t JOIN \`accounts\` a ON a.\`user_id\` = t.\`user_id\` AND a.\`is_default\` = 1 SET t.\`account_id\` = a.\`id\``,
    );

    // 5. 确认没有漏网之鱼后再收紧为 NOT NULL
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS \`cnt\` FROM \`transactions\` WHERE \`account_id\` IS NULL`,
    );
    const orphans = Number(rows?.[0]?.cnt ?? 0);
    if (orphans > 0) {
      throw new Error(`迁移中止：仍有 ${orphans} 条交易没有归属账本，请先处理再重跑`);
    }

    await queryRunner.query(
      `ALTER TABLE \`transactions\` MODIFY \`account_id\` bigint UNSIGNED NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD CONSTRAINT \`FK_transactions_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`transactions\` DROP FOREIGN KEY \`FK_transactions_account\``,
    );
    await queryRunner.query(`DROP INDEX \`idx_user_account_date\` ON \`transactions\``);
    await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`account_id\``);
    await queryRunner.query(`ALTER TABLE \`accounts\` DROP FOREIGN KEY \`FK_accounts_user\``);
    await queryRunner.query(`DROP INDEX \`uk_user_account_name\` ON \`accounts\``);
    await queryRunner.query(`DROP INDEX \`idx_user_default\` ON \`accounts\``);
    await queryRunner.query(`DROP TABLE \`accounts\``);
  }
}
