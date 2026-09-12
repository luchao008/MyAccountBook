import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 账单支持"时刻"：transactions 增加 record_time（TIME，可空）。
 *
 * 设计：**不动 record_date**。日期仍是 DATE 类型，
 * 承担统计区间过滤与索引的全部职责；record_time 只影响展示与同日排序。
 * 这样日期统计（BETWEEN 闭区间）完全不受影响，平滑升级。
 *
 * 可空语义：NULL = 用户未开启"时刻"开关，展示时不显示时间。
 */
export class TransactionRecordTime1789144765914 implements MigrationInterface {
  name = 'TransactionRecordTime1789144765914';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`transactions\` ADD \`record_time\` time NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`transactions\` DROP COLUMN \`record_time\``);
  }
}
