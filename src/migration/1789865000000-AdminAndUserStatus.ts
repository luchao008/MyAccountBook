import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 中台管理系统（docs/中台管理系统设计.md v1.0）：
 *   1. 新建 admins 表 —— 中台账号体系与 App users 完全隔离（决策 D17）
 *   2. users 加 status 列 —— 注册改申请制（决策 D18）
 *
 * status 默认 'pending'：默认收口，宁可新用户卡待审也不能漏放。
 * 存量用户在迁移收尾 UPDATE 为 active（一次性放行），
 * 不敢把列默认值设成 active —— 否则将来任何"忘记显式写状态"
 * 的代码路径都会直接放进新用户。
 */
export class AdminAndUserStatus1789865000000 implements MigrationInterface {
  name = 'AdminAndUserStatus1789865000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. admins 表（中台账号，与 users 无任何外键关联）
    await queryRunner.query(
      `CREATE TABLE \`admins\` (
        \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
        \`username\` varchar(64) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`nickname\` varchar(64) DEFAULT NULL,
        \`status\` enum('active','disabled') NOT NULL DEFAULT 'active',
        \`last_login_at\` datetime DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_admins_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );

    // 2. users 加 status
    await queryRunner.query(
      `ALTER TABLE \`users\`
        ADD \`status\` enum('pending','active','disabled') NOT NULL DEFAULT 'pending'`,
    );

    // 3. 存量用户一次性放行
    await queryRunner.query(`UPDATE \`users\` SET \`status\` = 'active'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`status\``);
    await queryRunner.query(`DROP TABLE \`admins\``);
  }
}
