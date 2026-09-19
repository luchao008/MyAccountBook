import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 存量**收入**分类的默认图标：旧 emoji → 图片图标（`img:<分类名>`）。
 *
 * 背景（2026-09-19）：收入侧原先没有专属图片图标（第一批 75 张源图全是支出），
 * icon 仍是 emoji。补做 19 张收入图后，预置文件（category-preset.ts）已改为
 * `img:*`，但**已有账本的分类是各自入库的副本**（账本级分类，2026-09-16 起），
 * 改预置文件只影响之后新建的账本 —— 存量账本必须靠本迁移更新，否则新旧账本不一致。
 *
 * 与同日的 1789792707162-CategoryImageIcons 是**两支独立迁移**（那支管支出 54 个）：
 *   分开写的原因是一次性把两组都塞进旧迁移，会让"已跑过旧迁移的库"漏掉收入部分
 *   （TypeORM 按迁移名记录，跑过就不再执行）。所以收入必须单独一支。
 *
 * ⚠️ 只更新「名字 + 图标都仍等于旧预置」的行 ——
 *    用户手动改过图标的分类**不碰**（那是明确的用户选择，不该被迁移覆盖）。
 *    反过来说，本迁移天然幂等：跑过一次后 icon 不再等于旧值，重复执行是 no-op。
 *
 * down 就是反向 UPDATE（把 icon 写回旧 emoji），同样只认"名字 + 当前值"两条件。
 */
export class IncomeCategoryImageIcons1789812122000 implements MigrationInterface {
  name = 'IncomeCategoryImageIcons1789812122000';

  /** [分类名, 旧 emoji, 新图标 key] —— 与 category-preset.ts 的 INCOME_CATEGORY_PRESET 同源 */
  private readonly rows: [string, string, string][] = [
    // 职业收入
    ['工资收入', '💰', 'img:工资收入'],
    ['利息收入', '🏦', 'img:利息收入'],
    ['加班收入', '⏰', 'img:加班收入'],
    ['奖金收入', '🏆', 'img:奖金收入'],
    ['投资收入', '📈', 'img:投资收入'],
    ['兼职收入', '💵', 'img:兼职收入'],
    ['公积金提款', '🏛️', 'img:公积金提款'],
    ['顺风车', '🚙', 'img:顺风车'],
    // 其他收入
    ['礼金收入', '🧧', 'img:礼金收入'],
    ['中奖收入', '🎁', 'img:中奖收入'],
    ['意外来钱', '💫', 'img:意外来钱'],
    ['经营所得', '🏪', 'img:经营所得'],
    ['信用卡还款', '💳', 'img:信用卡还款'],
    ['AA还款', '🍸', 'img:AA还款'],
    ['物品回收', '♻️', 'img:物品回收'],
    ['房租收入', '🏠', 'img:房租收入'],
    ['共享带宽收入', '🌐', 'img:共享带宽收入'],
    ['保险报销', '🛡️', 'img:保险报销'],
    // 收入侧的回退分类（见 FALLBACK_INCOME_CATEGORY）
    ['其他', '📦', 'img:其他'],
  ];

  /*
   * ⚠️ WHERE 里带 \`type = 'income'\`：本迁移是收入侧专属，而收入分类里有个叫
   *    **「其他」**的通用名（支出侧没有同名，但将来可能加）。加上类型条件后，
   *    即便某天支出侧也出现同名分类，也不会被误改。
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, oldIcon, newIcon] of this.rows) {
      await queryRunner.query(
        `UPDATE \`categories\` SET \`icon\` = ? WHERE \`name\` = ? AND \`icon\` = ? AND \`type\` = 'income'`,
        [newIcon, name, oldIcon],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name, oldIcon, newIcon] of this.rows) {
      await queryRunner.query(
        `UPDATE \`categories\` SET \`icon\` = ? WHERE \`name\` = ? AND \`icon\` = ? AND \`type\` = 'income'`,
        [oldIcon, name, newIcon],
      );
    }
  }
}
