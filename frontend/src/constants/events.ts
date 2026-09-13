/**
 * 跨页面事件名。
 *
 * 图标选择页与「新建二级分类」页是两个独立页面，选中结果要回传。
 * 用事件而不是把值塞进 storage / store：这是一次性的 UI 回传，
 * 不属于「应用状态」，放全局状态里反而要多写一套"用完清理"的逻辑。
 *
 * 事件名集中在这里定义，避免两页各写一遍字符串——
 * 那是最典型的"改一处、漏一处"（拼错不报错，只是永远收不到）。
 */

/** 图标选择页 → 发起页：选中的图标 key（`colorful:shop` / `cat-food` …） */
export const EVENT_ICON_PICKED = 'app:icon-picked';

/**
 * 新建分类页 → 分类管理页：新建成功。
 * 带上父分类 id，好让列表自动展开那一组 ——
 * 否则用户保存回来看到的是收起的列表，会以为"没创建成功"。
 */
export const EVENT_CATEGORY_CREATED = 'app:category-created';
