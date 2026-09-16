import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 账本级分类隔离
 *
 * 目标：把分类从「用户级共享」改为「账本级隔离」——每个账本拥有独立的一套分类。
 * 完整方案见 docs/账本级分类设计文档.md。
 *
 * 迁移步骤（顺序不能变）：
 *   1. categories 加 account_id（先可空，避免存量数据报错）
 *   2. 回填：每个用户的全部存量分类 → 划归其默认账本（母本）
 *   3. 非默认账本的存量交易：category_id 置空（分类已不在那些账本里）
 *   4. 收紧 account_id 为 NOT NULL，并加外键 ON DELETE CASCADE
 *   5. 唯一键 uk_user_name → uk_account_name (account_id, name)
 *   6. 加账本级索引 idx_account_parent / idx_account_sort
 *      （idx_user_parent 保留：它是 user_id 外键的支撑索引，删不得）
 *
 * ⚠️ 步骤 3 不可逆：迁移前已把受影响交易的分类归属快照到
 *    docs/migration-snapshots/category-per-account-before-*.sql
 *
 * 迁移后数据形态：只有默认账本有 89 个分类，其余账本分类为空
 * （用户下次切进去记账时，前端会按设计 D18 自动从母本导入）。
 */
export class CategoryPerAccount1789291000000 implements MigrationInterface {
  name = 'CategoryPerAccount1789291000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 加列（先可空）
    await queryRunner.query(`ALTER TABLE \`categories\` ADD \`account_id\` bigint UNSIGNED NULL`);

    // 2. 回填：存量分类全部划归各自用户的默认账本
    await queryRunner.query(
      `UPDATE \`categories\` c
         JOIN \`accounts\` a ON a.\`user_id\` = c.\`user_id\` AND a.\`is_default\` = 1
         SET c.\`account_id\` = a.\`id\``,
    );

    // 3. 非默认账本的交易：分类置空（那些分类已不属于这些账本）
    await queryRunner.query(
      `UPDATE \`transactions\` t
         JOIN \`accounts\` a ON a.\`id\` = t.\`account_id\`
         SET t.\`category_id\` = NULL
         WHERE a.\`is_default\` = 0`,
    );

    // 4. 收紧为 NOT NULL 前先确认无遗漏
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS \`cnt\` FROM \`categories\` WHERE \`account_id\` IS NULL`,
    );
    const orphans = Number(rows?.[0]?.cnt ?? 0);
    if (orphans > 0) {
      throw new Error(`迁移中止：仍有 ${orphans} 个分类没有归属账本，请先处理再重跑`);
    }
    await queryRunner.query(
      `ALTER TABLE \`categories\` MODIFY \`account_id\` bigint UNSIGNED NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD CONSTRAINT \`FK_categories_account\` FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // 5. 唯一键：用户级 → 账本级
    await queryRunner.query(`ALTER TABLE \`categories\` DROP INDEX \`uk_user_name\``);
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD UNIQUE KEY \`uk_account_name\` (\`account_id\`, \`name\`)`,
    );

    // 6. 账本级索引（idx_user_parent 保留：它是 user_id 外键的支撑索引）
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD INDEX \`idx_account_parent\` (\`account_id\`, \`parent_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD INDEX \`idx_account_sort\` (\`account_id\`, \`sort\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`categories\` DROP INDEX \`idx_account_sort\``);
    await queryRunner.query(`ALTER TABLE \`categories\` DROP INDEX \`idx_account_parent\``);
    await queryRunner.query(`ALTER TABLE \`categories\` DROP INDEX \`uk_account_name\``);
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD UNIQUE KEY \`uk_user_name\` (\`user_id\`, \`name\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`categories\` DROP FOREIGN KEY \`FK_categories_account\``,
    );
    await queryRunner.query(`ALTER TABLE \`categories\` DROP COLUMN \`account_id\``);
  }
}
