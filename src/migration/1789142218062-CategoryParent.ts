import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 分类支持两级：categories 增加 parent_id 自引用外键。
 *
 * 本次只做**结构变更**，不动数据。
 * 之所以不在迁移里重建分类体系：重建需要"把旧分类下的交易改挂到「其他支出」再删旧分类"，
 * 而「其他支出」属于新体系、迁移执行时还不存在；且分类是 per-user 的，
 * 在 SQL 里铺开 13 个一级 + 54 个二级分类会非常笨重且难维护。
 * 因此数据重建放在 seed 脚本（`npm run seed`）里，按用户顺序执行、可重复运行。
 *
 * 约束：最多两级（二级下不能再挂子分类），由应用层校验。
 */
export class CategoryParent1789142218062 implements MigrationInterface {
  name = 'CategoryParent1789142218062';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`categories\` ADD \`parent_id\` bigint UNSIGNED NULL`);
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD INDEX \`idx_user_parent\` (\`user_id\`, \`parent_id\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD CONSTRAINT \`FK_categories_parent\` FOREIGN KEY (\`parent_id\`) REFERENCES \`categories\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`categories\` DROP FOREIGN KEY \`FK_categories_parent\``);
    await queryRunner.query(`DROP INDEX \`idx_user_parent\` ON \`categories\``);
    await queryRunner.query(`ALTER TABLE \`categories\` DROP COLUMN \`parent_id\``);
  }
}
