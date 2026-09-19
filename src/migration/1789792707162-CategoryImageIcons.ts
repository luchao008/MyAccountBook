import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 存量分类的默认图标：旧 emoji → 图片图标（`img:<分类名>`）。
 *
 * 背景（2026-09-19）：预置分类的 icon 字段从 emoji 换成图片图标（见 category-preset.ts）。
 * 但**已有账本的分类是各自入库的副本**（账本级分类，2026-09-16 起），
 * 改预置文件只影响之后新建的账本 —— 存量账本必须靠本迁移更新，否则新旧账本显示不一致。
 *
 * 覆盖 54 个分类：54 个「有专属图片图标」的二级分类。
 * 「腐败聚会」没有同名图，借「朋友聚会」的图（两者同义，见导入报告）。
 *
 * ⚠️ 只更新「名字 + 图标都仍等于旧预置」的行 ——
 *    用户手动改过图标的分类**不碰**（那是明确的用户选择，不该被迁移覆盖）。
 *    反过来说，本迁移天然幂等：跑过一次后 icon 不再等于旧值，重复执行是 no-op。
 *
 * down 就是反向 UPDATE（把 icon 写回旧 emoji），同样只认"名字 + 当前值"两条件。
 */
export class CategoryImageIcons1789792707162 implements MigrationInterface {
  name = 'CategoryImageIcons1789792707162';

  /** [分类名, 旧 emoji, 新图标 key] —— 由 scripts 生成，与预置文件同源 */
  private readonly rows: [string, string, string][] = [
    ['日常用品', '🧻', 'img:日常用品'],
    ['水电煤气宽带', '💡', 'img:水电煤气宽带'],
    ['房租', '🏘️', 'img:房租'],
    ['物业管理', '🏢', 'img:物业管理'],
    ['维修保养', '🔧', 'img:维修保养'],
    ['家用电器', '🔌', 'img:家用电器'],
    ['家具', '🛋️', 'img:家具'],
    ['公共交通', '🚌', 'img:公共交通'],
    ['打车租车', '🚕', 'img:打车租车'],
    ['私家车费用', '🚙', 'img:私家车费用'],
    ['座机费', '☎️', 'img:座机费'],
    ['手机费', '📱', 'img:手机费'],
    ['上网费', '💻', 'img:上网费'],
    ['邮寄费', '📮', 'img:邮寄费'],
    ['运动健身', '🏃', 'img:运动健身'],
    ['腐败聚会', '🍻', 'img:朋友聚会'],
    ['休闲玩乐', '🎮', 'img:休闲玩乐'],
    ['宠物宝贝', '🐱', 'img:宠物宝贝'],
    ['旅游度假', '🏖️', 'img:旅游度假'],
    ['银行手续', '🏦', 'img:银行手续'],
    ['投资亏损', '📉', 'img:投资亏损'],
    ['按揭还款', '🏚️', 'img:按揭还款'],
    ['消费税收', '🧾', 'img:消费税收'],
    ['利息支出', '💹', 'img:利息支出'],
    ['赔偿罚款', '⚠️', 'img:赔偿罚款'],
    ['其他支出', '💳', 'img:其他支出'],
    ['意外丢失', '🗑️', 'img:意外丢失'],
    ['烂账损失', '💔', 'img:烂账损失'],
    ['手机', '📱', 'img:手机'],
    ['电脑', '💻', 'img:电脑'],
    ['配件', '🔩', 'img:配件'],
    ['数码产品', '🎧', 'img:数码产品'],
    ['花草类', '🪴', 'img:花草类'],
    ['药品费', '💊', 'img:药品费'],
    ['保健费', '🧴', 'img:保健费'],
    ['美容费', '💅', 'img:美容费'],
    ['治疗费', '💉', 'img:治疗费'],
    ['护肤品', '🧖', 'img:护肤品'],
    ['保健品', '🍶', 'img:保健品'],
    ['送礼请客', '🥂', 'img:送礼请客'],
    ['孝敬家长', '👴', 'img:孝敬家长'],
    ['还人钱物', '💵', 'img:还人钱物'],
    ['慈善捐助', '🤝', 'img:慈善捐助'],
    ['红包', '🧧', 'img:红包'],
    ['衣服裤子', '👖', 'img:衣服裤子'],
    ['鞋帽包包', '👜', 'img:鞋帽包包'],
    ['化妆饰品', '💄', 'img:化妆饰品'],
    ['早午晚餐', '🍱', 'img:早午晚餐'],
    ['烟酒茶', '🍷', 'img:烟酒茶'],
    ['水果零食', '🍎', 'img:水果零食'],
    ['柴米油盐蔬菜瓜果', '🥬', 'img:柴米油盐蔬菜瓜果'],
    ['书报杂志', '📰', 'img:书报杂志'],
    ['培训进修', '✏️', 'img:培训进修'],
    ['数码装备', '📷', 'img:数码装备'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, oldIcon, newIcon] of this.rows) {
      await queryRunner.query(
        `UPDATE \`categories\` SET \`icon\` = ? WHERE \`name\` = ? AND \`icon\` = ?`,
        [newIcon, name, oldIcon],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name, oldIcon, newIcon] of this.rows) {
      await queryRunner.query(
        `UPDATE \`categories\` SET \`icon\` = ? WHERE \`name\` = ? AND \`icon\` = ?`,
        [oldIcon, name, newIcon],
      );
    }
  }
}
