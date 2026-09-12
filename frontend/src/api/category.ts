import http from '@/utils/request';

export interface CategoryItem {
  id: string;
  userId: string;
  name: string;
  type: 'income' | 'expense';
  icon: string;
  sort: number;
  /** 父分类 ID；null 表示一级分类 */
  parentId: string | null;
}

/**
 * 分类列表。
 *
 * parentId 三种取值：
 *   - 'root'  → 只返回一级分类
 *   - 具体 ID → 返回该父下的二级分类
 *   - 不传    → 返回全部（前端自行组装成树）
 */
export function getCategories(
  type?: 'income' | 'expense',
  parentId?: string
): Promise<CategoryItem[]> {
  return http.get('/categories', { params: { type, parentId } }) as any;
}

export function createCategory(data: {
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
  return http.put(`/categories/${id}`, data) as any;
}

export function deleteCategory(
  id: string
): Promise<{ success: boolean; deletedChildren: number }> {
  return http.delete(`/categories/${id}`) as any;
}
