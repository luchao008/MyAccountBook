import http from '@/utils/request';

export interface CategoryItem {
  id: string;
  userId: string;
  /** 所属账本（分类自 2026-09-16 起为账本级隔离） */
  accountId: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  sort: number;
  /** 父分类 ID；null 表示一级分类 */
  parentId: string | null;
  /**
   * 是否隐藏。
   *
   * 语义：隐藏的分类**不出现在「记一笔」的分类选择器里**，其余场景完全不受影响
   * （分类管理页仍可见、历史交易 / 明细 / 统计照旧）。
   * 一级分类隐藏时其下二级也选不到 —— 这个判断由 `visibility=visible` 或
   * store 的 `selectable*` getter 做，**不会冗余写到子分类上**。
   */
  isHidden: boolean;
}

/**
 * 分类列表。
 *
 * parentId 三种取值：
 *   - 'root'  → 只返回一级分类
 *   - 具体 ID → 返回该父下的二级分类
 *   - 不传    → 返回全部（前端自行组装成树）
 *
 * visibility 两种取值：
 *   - 'all'（默认）→ 全部，**分类管理页用这个**：必须能看到被隐藏的分类，
 *     否则用户永远无法取消隐藏（功能死锁）
 *   - 'visible'   → 只返回可用于记账的（自身未隐藏，且二级分类的父也未隐藏）
 *
 * 用显式枚举而不是布尔参数：query 值都是字符串，`"false"` 是 truthy，很容易埋坑。
 */
export function getCategories(
  accountId: string,
  type?: 'income' | 'expense',
  parentId?: string,
  visibility?: 'all' | 'visible'
): Promise<CategoryItem[]> {
  return http.get('/categories', { params: { accountId, type, parentId, visibility } }) as any;
}

export function createCategory(data: {
  accountId: string;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  sort?: number;
  /** 传值即为二级分类；父必须是一级分类（不支持三级） */
  parentId?: string;
}): Promise<CategoryItem> {
  return http.post('/categories', data) as any;
}

export function updateCategory(
  accountId: string,
  id: string,
  data: Partial<{
    name: string;
    type: 'income' | 'expense';
    icon: string;
    sort: number;
    /** 传空字符串表示提升为一级分类 */
    parentId: string;
  }>
): Promise<CategoryItem> {
  return http.put(`/categories/${id}?accountId=${accountId}`, data) as any;
}

export function deleteCategory(
  accountId: string,
  id: string
): Promise<{ success: boolean; deletedChildren: number }> {
  return http.delete(`/categories/${id}?accountId=${accountId}`) as any;
}

/**
 * 批量删除分类。
 *
 * `deleted` 是**实际消失的分类总数**（含被级联删掉的二级），
 * `deletedChildren` 单列其中因删除一级而连带删掉的数量 —— 提示文案要用到后者。
 * 传入的 ids 若含不存在/不属于自己的，后端**整单失败**（不静默少删）。
 */
export function batchDeleteCategories(
  accountId: string,
  ids: string[]
): Promise<{
  success: boolean;
  deleted: number;
  deletedChildren: number;
}> {
  return http.post('/categories/batch-delete', { accountId, ids }) as any;
}

/**
 * 批量隐藏 / 恢复显示。
 *
 * `updated` 可能**小于**传入的 id 数：父分类已被选中时，其二级分类不重复写入
 * （由「父隐藏 ⇒ 子不可选」的规则覆盖，取消隐藏时子级自动回来）。
 */
export function batchHideCategories(
  accountId: string,
  ids: string[],
  hidden: boolean
): Promise<{ success: boolean; updated: number; hidden: boolean }> {
  return http.post('/categories/batch-hide', { accountId, ids, hidden }) as any;
}

/**
 * 拖动排序：把某一层级下的分类按 `ids` 顺序重排。
 *
 * ⚠️ **作用域是 `(accountId, type, parentId)` 三元组**，不是整个账本：
 *   - 支出与收入的一级分类是两条独立列表，各自从 0 开始编号（所以要传 `type`）
 *   - 一级与二级是两层独立顺序（`parentId` 传 `null` = 排一级）
 *
 * ⚠️ **`ids` 必须是该层级下的全集**（顺序即目标顺序）。只传一部分后端会拒绝
 * （`40013`）而不是"剩下的保持原样"—— 那会产生一个没人能预测的顺序。
 *
 * 失败码：`40011` 有重复 id / `40012` 跨层级或跨收支类型 / `40013` 不是全集 / `40401` 分类不存在。
 */
export function reorderCategories(
  accountId: string,
  type: 'income' | 'expense',
  parentId: string | null,
  ids: string[]
): Promise<{ success: boolean; updated: number }> {
  // parentId 传空字符串表示"排一级"（后端 DTO 用 optional().allow(null, '') 接）
  return http.post('/categories/reorder', {
    accountId,
    type,
    parentId: parentId ?? '',
    ids,
  }) as any;
}
