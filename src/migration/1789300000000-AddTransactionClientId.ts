import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 流水加「客户端幂等键」client_id（离线补传用）
 *
 * 背景：离线记账在本地排队，网络恢复后补传。补传可能重试（超时后重发），
 * 若没有幂等键，同一条离线流水会被写入两次。
 *
 * 做法：
 *   1. transactions 加 client_id varchar(64) NULL（在线新增不传，保持 NULL）
 *   2. 加唯一键 (user_id, client_id) —— MySQL 唯一索引允许多个 NULL，
 *      所以"在线新增（client_id 为 NULL）"不受此约束影响，可以有很多条
 *   3. create() 里"先按 (user_id, client_id) 查，命中则直接返回已有记录"
 *      实现幂等；并发极端情况由唯一约束兜底（撞键则回查）
 */
export class AddTransactionClientId1789300000000 implements MigrationInterface {
  name = 'AddTransactionClientId1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD \`client_id\` varchar(64) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transactions\` ADD UNIQUE KEY \`uk_user_client_id\` (\`user_id\`, \`client_id\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`transactions\` DROP INDEX \`uk_user_client_id\``);
    await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`client_id\``);
  }
}
