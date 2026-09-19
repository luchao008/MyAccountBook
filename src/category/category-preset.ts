/**
 * 预置分类体系（支出、收入均为两级：一级为分组，二级才是可记账的分类）。
 *
 * 每用户合计 89 个：支出 13 一级 + 55 二级，收入 2 一级 + 19 二级。
 * （2026-09-15 补了「衣服饰品 / 🧦」—— 随手记导出文件里用户把二级分类直接命名成 emoji）
 *
 * icon 字段**存图标标识**，取值两类：
 *   · `img:<分类名>` —— 专属图片图标（支出 54 + 收入 19 = 73 个）。
 *     PNG 在 frontend/src/static/cat-icons/，由 scripts/gen-cat-icons.mjs 生成；
 *     「腐败聚会」借用「朋友聚会」的图（两者同义）。
 *   · 其余仍是 emoji —— 前端 EMOJI_TO_ICON 会把 emoji 兜底成单色分类图标，永不留白
 *     （见 frontend/src/constants/icons.ts）。
 * 前端按值形态自动选渲染器，收敛在 CategoryIcon.vue 一处（img → 图片 / 彩色 / 单色）。
 */

export interface PresetChild {
  name: string;
  icon: string;
}

export interface PresetRoot {
  name: string;
  icon: string;
  children: PresetChild[];
}

/** 支出分类：13 个一级 + 54 个二级 */
export const EXPENSE_CATEGORY_PRESET: PresetRoot[] = [
  {
    name: '居家物业',
    icon: '🏠',
    children: [
      { name: '日常用品', icon: 'img:日常用品' },
      { name: '水电煤气宽带', icon: 'img:水电煤气宽带' },
      { name: '房租', icon: 'img:房租' },
      { name: '物业管理', icon: 'img:物业管理' },
      { name: '维修保养', icon: 'img:维修保养' },
      { name: '家用电器', icon: 'img:家用电器' },
      { name: '家具', icon: 'img:家具' },
    ],
  },
  {
    name: '行车交通',
    icon: '🚗',
    children: [
      { name: '公共交通', icon: 'img:公共交通' },
      { name: '打车租车', icon: 'img:打车租车' },
      { name: '私家车费用', icon: 'img:私家车费用' },
    ],
  },
  {
    name: '交流通讯',
    icon: '📡',
    children: [
      { name: '座机费', icon: 'img:座机费' },
      { name: '手机费', icon: 'img:手机费' },
      { name: '上网费', icon: 'img:上网费' },
      { name: '邮寄费', icon: 'img:邮寄费' },
    ],
  },
  {
    name: '休闲娱乐',
    icon: '🎉',
    children: [
      { name: '运动健身', icon: 'img:运动健身' },
      { name: '腐败聚会', icon: 'img:朋友聚会' },
      { name: '休闲玩乐', icon: 'img:休闲玩乐' },
      { name: '宠物宝贝', icon: 'img:宠物宝贝' },
      { name: '旅游度假', icon: 'img:旅游度假' },
    ],
  },
  {
    name: '金融保险',
    icon: '🛡️',
    children: [
      { name: '银行手续', icon: 'img:银行手续' },
      { name: '投资亏损', icon: 'img:投资亏损' },
      { name: '按揭还款', icon: 'img:按揭还款' },
      { name: '消费税收', icon: 'img:消费税收' },
      { name: '利息支出', icon: 'img:利息支出' },
      { name: '赔偿罚款', icon: 'img:赔偿罚款' },
    ],
  },
  {
    name: '其他杂项',
    icon: '📦',
    children: [
      { name: '其他支出', icon: 'img:其他支出' },
      { name: '意外丢失', icon: 'img:意外丢失' },
      { name: '烂账损失', icon: 'img:烂账损失' },
    ],
  },
  {
    name: '电子产品',
    icon: '🖥️',
    children: [
      { name: '手机', icon: 'img:手机' },
      { name: '电脑', icon: 'img:电脑' },
      { name: '配件', icon: 'img:配件' },
      { name: '数码产品', icon: 'img:数码产品' },
    ],
  },
  {
    name: '养殖',
    icon: '🌱',
    children: [{ name: '花草类', icon: 'img:花草类' }],
  },
  {
    name: '医疗保健',
    icon: '🏥',
    children: [
      { name: '药品费', icon: 'img:药品费' },
      { name: '保健费', icon: 'img:保健费' },
      { name: '美容费', icon: 'img:美容费' },
      { name: '治疗费', icon: 'img:治疗费' },
      { name: '护肤品', icon: 'img:护肤品' },
      { name: '保健品', icon: 'img:保健品' },
    ],
  },
  {
    name: '人情往来',
    icon: '🎁',
    children: [
      { name: '送礼请客', icon: 'img:送礼请客' },
      { name: '孝敬家长', icon: 'img:孝敬家长' },
      { name: '还人钱物', icon: 'img:还人钱物' },
      { name: '慈善捐助', icon: 'img:慈善捐助' },
      { name: '红包', icon: 'img:红包' },
    ],
  },
  {
    name: '衣服饰品',
    icon: '👗',
    children: [
      { name: '衣服裤子', icon: 'img:衣服裤子' },
      { name: '鞋帽包包', icon: 'img:鞋帽包包' },
      { name: '化妆饰品', icon: 'img:化妆饰品' },
      /*
       * ⚠️ 这个名字就是 emoji 本身（luchao 要求"按原样添加"）—— 它是随手记导出文件里
       *    的原始写法：用户当时把二级分类直接命名成了 🧦（袜子）。
       *    项目允许这样（name 与 icon 都是同一串），只是分类列表里会显示成"🧦"。
       */
      { name: '🧦', icon: '🧦' },
    ],
  },
  {
    name: '食品酒水',
    icon: '🍜',
    children: [
      { name: '早午晚餐', icon: 'img:早午晚餐' },
      { name: '烟酒茶', icon: 'img:烟酒茶' },
      { name: '水果零食', icon: 'img:水果零食' },
      { name: '柴米油盐蔬菜瓜果', icon: 'img:柴米油盐蔬菜瓜果' },
    ],
  },
  {
    name: '学习进修',
    icon: '📚',
    children: [
      { name: '书报杂志', icon: 'img:书报杂志' },
      { name: '培训进修', icon: 'img:培训进修' },
      { name: '数码装备', icon: 'img:数码装备' },
    ],
  },
];

/**
 * 收入分类：与支出一样是两级结构（参考随手记收入分类截图）。
 *
 * 「其他收入」下有个二级分类就叫「其他」——它同时是收入侧的回退分类：
 * 旧收入分类（工资 / 奖金等）被清理时，其交易统一改挂到它上面。
 * 复用旧「其他」分类的名字正好能接住这笔历史归属（upsert 会保留原 id）。
 */
export const INCOME_CATEGORY_PRESET: PresetRoot[] = [
  {
    name: '职业收入',
    icon: '💼',
    children: [
      { name: '工资收入', icon: 'img:工资收入' },
      { name: '利息收入', icon: 'img:利息收入' },
      { name: '加班收入', icon: 'img:加班收入' },
      { name: '奖金收入', icon: 'img:奖金收入' },
      { name: '投资收入', icon: 'img:投资收入' },
      { name: '兼职收入', icon: 'img:兼职收入' },
      { name: '公积金提款', icon: 'img:公积金提款' },
      { name: '顺风车', icon: 'img:顺风车' },
    ],
  },
  {
    name: '其他收入',
    icon: '💰',
    children: [
      { name: '礼金收入', icon: 'img:礼金收入' },
      { name: '中奖收入', icon: 'img:中奖收入' },
      { name: '意外来钱', icon: 'img:意外来钱' },
      { name: '经营所得', icon: 'img:经营所得' },
      { name: '信用卡还款', icon: 'img:信用卡还款' },
      { name: 'AA还款', icon: 'img:AA还款' },
      { name: '物品回收', icon: 'img:物品回收' },
      { name: '房租收入', icon: 'img:房租收入' },
      { name: '共享带宽收入', icon: 'img:共享带宽收入' },
      { name: '保险报销', icon: 'img:保险报销' },
      // 收入侧的回退分类：见 FALLBACK_INCOME_CATEGORY
      { name: '其他', icon: 'img:其他' },
    ],
  },
];

/** 重建时，旧分类下的交易会统一改挂到这个名字的分类上 */
export const FALLBACK_EXPENSE_CATEGORY = '其他支出';
