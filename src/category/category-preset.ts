/**
 * 预置分类体系（支出、收入均为两级：一级为分组，二级才是可记账的分类）。
 *
 * 每用户合计 88 个：支出 13 一级 + 54 二级，收入 2 一级 + 19 二级。
 *
 * icon 字段直接存 emoji，而不是"food"这类标识：
 * 几十个分类逐个维护标识→emoji 的映射表太笨重，直接存 emoji 更省事。
 * 前端 `iconOf()` 对两者都兼容（见 utils/icon.ts）。
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
      { name: '日常用品', icon: '🧻' },
      { name: '水电煤气宽带', icon: '💡' },
      { name: '房租', icon: '🏘️' },
      { name: '物业管理', icon: '🏢' },
      { name: '维修保养', icon: '🔧' },
      { name: '家用电器', icon: '🔌' },
      { name: '家具', icon: '🛋️' },
    ],
  },
  {
    name: '行车交通',
    icon: '🚗',
    children: [
      { name: '公共交通', icon: '🚌' },
      { name: '打车租车', icon: '🚕' },
      { name: '私家车费用', icon: '🚙' },
    ],
  },
  {
    name: '交流通讯',
    icon: '📡',
    children: [
      { name: '座机费', icon: '☎️' },
      { name: '手机费', icon: '📱' },
      { name: '上网费', icon: '💻' },
      { name: '邮寄费', icon: '📮' },
    ],
  },
  {
    name: '休闲娱乐',
    icon: '🎉',
    children: [
      { name: '运动健身', icon: '🏃' },
      { name: '腐败聚会', icon: '🍻' },
      { name: '休闲玩乐', icon: '🎮' },
      { name: '宠物宝贝', icon: '🐱' },
      { name: '旅游度假', icon: '🏖️' },
    ],
  },
  {
    name: '金融保险',
    icon: '🛡️',
    children: [
      { name: '银行手续', icon: '🏦' },
      { name: '投资亏损', icon: '📉' },
      { name: '按揭还款', icon: '🏚️' },
      { name: '消费税收', icon: '🧾' },
      { name: '利息支出', icon: '💹' },
      { name: '赔偿罚款', icon: '⚠️' },
    ],
  },
  {
    name: '其他杂项',
    icon: '📦',
    children: [
      { name: '其他支出', icon: '💳' },
      { name: '意外丢失', icon: '🗑️' },
      { name: '烂账损失', icon: '💔' },
    ],
  },
  {
    name: '电子产品',
    icon: '🖥️',
    children: [
      { name: '手机', icon: '📱' },
      { name: '电脑', icon: '💻' },
      { name: '配件', icon: '🔩' },
      { name: '数码产品', icon: '🎧' },
    ],
  },
  {
    name: '养殖',
    icon: '🌱',
    children: [{ name: '花草类', icon: '🪴' }],
  },
  {
    name: '医疗保健',
    icon: '🏥',
    children: [
      { name: '药品费', icon: '💊' },
      { name: '保健费', icon: '🧴' },
      { name: '美容费', icon: '💅' },
      { name: '治疗费', icon: '💉' },
      { name: '护肤品', icon: '🧖' },
      { name: '保健品', icon: '🍶' },
    ],
  },
  {
    name: '人情往来',
    icon: '🎁',
    children: [
      { name: '送礼请客', icon: '🥂' },
      { name: '孝敬家长', icon: '👴' },
      { name: '还人钱物', icon: '💵' },
      { name: '慈善捐助', icon: '🤝' },
      { name: '红包', icon: '🧧' },
    ],
  },
  {
    name: '衣服饰品',
    icon: '👗',
    children: [
      { name: '衣服裤子', icon: '👖' },
      { name: '鞋帽包包', icon: '👜' },
      { name: '化妆饰品', icon: '💄' },
    ],
  },
  {
    name: '食品酒水',
    icon: '🍜',
    children: [
      { name: '早午晚餐', icon: '🍱' },
      { name: '烟酒茶', icon: '🍷' },
      { name: '水果零食', icon: '🍎' },
      { name: '柴米油盐蔬菜瓜果', icon: '🥬' },
    ],
  },
  {
    name: '学习进修',
    icon: '📚',
    children: [
      { name: '书报杂志', icon: '📰' },
      { name: '培训进修', icon: '✏️' },
      { name: '数码装备', icon: '📷' },
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
      { name: '工资收入', icon: '💰' },
      { name: '利息收入', icon: '🏦' },
      { name: '加班收入', icon: '⏰' },
      { name: '奖金收入', icon: '🏆' },
      { name: '投资收入', icon: '📈' },
      { name: '兼职收入', icon: '💵' },
      { name: '公积金提款', icon: '🏛️' },
      { name: '顺风车', icon: '🚙' },
    ],
  },
  {
    name: '其他收入',
    icon: '💰',
    children: [
      { name: '礼金收入', icon: '🧧' },
      { name: '中奖收入', icon: '🎁' },
      { name: '意外来钱', icon: '💫' },
      { name: '经营所得', icon: '🏪' },
      { name: '信用卡还款', icon: '💳' },
      { name: 'AA还款', icon: '🍸' },
      { name: '物品回收', icon: '♻️' },
      { name: '房租收入', icon: '🏠' },
      { name: '共享带宽收入', icon: '🌐' },
      { name: '保险报销', icon: '🛡️' },
      // 收入侧的回退分类：见 FALLBACK_INCOME_CATEGORY
      { name: '其他', icon: '📦' },
    ],
  },
];

/** 重建时，旧分类下的交易会统一改挂到这个名字的分类上 */
export const FALLBACK_EXPENSE_CATEGORY = '其他支出';
