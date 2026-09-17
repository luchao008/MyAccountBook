import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 流水软删除：transactions 增加 deleted_at（可空）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 为什么是软删除
 *
 * 需求「删除后在流水回收站存在 7 天」意味着删除不能真删行 —— 否则无从恢复。
 * 于是：删除 = 写 deleted_at 时间戳；回收站 = 查 deleted_at 非空且未超期的记录。
 *
 * 连带影响（**必须同步改，否则回收站里的流水会漏进常规查询**）：
 *   · transaction.service 的 page() / summary() / summaryByCategory()
 *   · statistics.service 的 monthly() / categoryBreakdown() / overview() / report()
 *   · 以上全部要加 `deleted_at IS NULL`
 *
 * ⚠️ 字段名用 `deleted_at` 而不是 `is_deleted`：需要知道**删除时间**才能判 7 天。
 *
 * ⚠️ **超期清理是「查询时惰性真删」**（luchao 确认）：查回收站时先把
 *    deleted_at < NOW() - 7d 的记录物理删掉，再返回剩余的 ——
 *    这样「7 天内可恢复」的文案与行为严格一致，库也不会慢慢堆积。
 *
 * ⚠️ **删账本的级联删除不走软删除**（luchao 确认）：account_id 是 ON DELETE CASCADE，
 *    删账本时其下交易真删、不进回收站。理由：回收站只服务「用户逐笔删的流水」；
 *    账本都没了，恢复的流水挂哪？
 * ────────────────────────────────────────────────────────────────────────
 */
export class AddTransactionDeletedAt1789290000000 implements MigrationInterface {
  name = 'AddTransactionDeletedAt1789290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`deleted_at\` datetime(6) NULL`);
    // (user_id, deleted_at)：回收站列表按 user 查、常规查询按 deleted_at IS NULL 过滤
    await queryRunner.query(
      `CREATE INDEX \`idx_user_deleted\` ON \`transactions\` (\`user_id\`, \`deleted_at\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`idx_user_deleted\` ON \`transactions\``);
    await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`deleted_at\``);
  }
}
