import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 分类支持「隐藏」：categories 增加 is_hidden。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 这个迁移是一次**故障修复**，不只是新功能。
 *
 * `category.entity.ts` 里早已声明了 `isHidden` 字段（注释还写着"语义已与产品确认"），
 * 但**没有任何迁移去建这一列** —— 而 `config.default.ts` 是 `synchronize: false`，
 * TypeORM 不会自己补列。
 *
 * 后果：TypeORM 的 `find()` 会 SELECT 全部已映射列，于是**每一个走 Category 实体的
 * 查询都直接抛 `ER_BAD_FIELD_ERROR: Unknown column 'Category.is_hidden'`**。
 * 实测受影响（HTTP 500 / 业务码 50000）：`GET /categories`、`GET /categories/:id`、
 * `GET /transactions`（明细，join 了分类）。
 * 只有 `statistics/*` 与 `accounts` 幸存 —— 它们走裸 SQL，不碰实体。
 *
 * 教训：**实体与迁移必须同步提交**。只加实体不改库，在 `synchronize: false` 下
 * 不是"暂时没生效"，而是"立刻把整个模块打挂"，且错误信息只在服务端日志里
 * （前端只看到 50000），排查成本很高。
 * ────────────────────────────────────────────────────────────────────────
 *
 * 语义（已与产品确认，见实体注释）：
 *   - 隐藏的分类**不出现在「记一笔」的分类选择器里**，目的是把不常用的收起来；
 *   - 分类管理页仍可见、可取消隐藏；
 *   - 历史交易 / 明细 / 统计**完全不受影响**（隐藏不改变任何已有数据的归属）。
 *
 * 「一级隐藏 ⇒ 其下二级也选不到」这个判断放在**查询侧**做，
 * 不给二级冗余写 is_hidden —— 否则取消隐藏时还要回滚所有子分类，极易漏掉而留下脏数据。
 */
export class AddCategoryHidden1789285116000 implements MigrationInterface {
  name = 'AddCategoryHidden1789285116000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`categories\` ADD \`is_hidden\` tinyint NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`categories\` DROP COLUMN \`is_hidden\``);
  }
}
