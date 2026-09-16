import { DataSource, Repository } from 'typeorm';
import { Category } from '../entity/category.entity';
import { Transaction } from '../entity/transaction.entity';
import {
  EXPENSE_CATEGORY_PRESET,
  INCOME_CATEGORY_PRESET,
  FALLBACK_EXPENSE_CATEGORY,
} from './category-preset';

/** 收入侧的回退分类 */
const FALLBACK_INCOME_CATEGORY = '其他';

export interface RebuildResult {
  total: number;
  roots: number;
  children: number;
  legacyRemoved: number;
  reassigned: number;
}

/**
 * 按 preset 重建**某个账本**的分类体系（幂等）。
 *
 * 从 `src/seed/index.ts` 抽出（2026-09-16）：账本级分类改造后，
 * ① seed 要为默认账本重建；② 删默认账本时新默认账本也要重建全套母本（设计 D14）。
 * 两处共用这一份，避免逻辑分叉。
 *
 * 步骤（顺序重要）：
 *   1. 批量 upsert 一级分类（同名复用，避免打断已有交易的归属）
 *   2. 批量 upsert 二级分类（parentId 指向第 1 步的一级）
 *   3. 找出不在新体系名单里的旧分类
 *   4. 把旧分类下的交易按收支类型改挂到回退分类
 *   5. 删除旧分类（其下二级由外键 CASCADE 一并删除）
 */
export async function rebuildAccountCategories(
  dataSource: DataSource,
  userId: string,
  accountId: string,
): Promise<RebuildResult> {
  const categoryRepo: Repository<Category> = dataSource.getRepository(Category);
  const txnRepo: Repository<Transaction> = dataSource.getRepository(Transaction);

  const existing = await categoryRepo.find({ where: { accountId } });
  const byName = new Map(existing.map((c) => [c.name, c]));

  // 1. 一级分类（支出 + 收入）
  const rootPlan = [
    ...EXPENSE_CATEGORY_PRESET.map((r) => ({ ...r, type: 'expense' as const })),
    ...INCOME_CATEGORY_PRESET.map((r) => ({ ...r, type: 'income' as const })),
  ];

  const rootEntities = rootPlan.map((root, index) => {
    const found = byName.get(root.name);
    if (found) {
      found.icon = root.icon;
      found.type = root.type;
      found.sort = index + 1;
      found.parentId = null;
      return found;
    }
    return categoryRepo.create({
      userId,
      accountId,
      name: root.name,
      icon: root.icon,
      type: root.type,
      sort: index + 1,
      parentId: null,
    });
  });

  const savedRoots = await categoryRepo.save(rootEntities);
  const rootByName = new Map(savedRoots.map((r) => [r.name, r]));

  // 2. 二级分类
  const childPlan: Array<{
    name: string;
    icon: string;
    sort: number;
    parentId: string;
    type: 'income' | 'expense';
  }> = [];

  const withType = [
    ...EXPENSE_CATEGORY_PRESET.map((r) => ({ ...r, type: 'expense' as const })),
    ...INCOME_CATEGORY_PRESET.map((r) => ({ ...r, type: 'income' as const })),
  ];
  for (const root of withType) {
    const parent = rootByName.get(root.name);
    root.children.forEach((child, index) => {
      childPlan.push({
        name: child.name,
        icon: child.icon,
        sort: index + 1,
        parentId: parent.id,
        type: root.type,
      });
    });
  }

  const childEntities = childPlan.map((child) => {
    const found = byName.get(child.name);
    if (found) {
      found.icon = child.icon;
      found.type = child.type;
      found.sort = child.sort;
      found.parentId = child.parentId;
      return found;
    }
    return categoryRepo.create({
      userId,
      accountId,
      name: child.name,
      icon: child.icon,
      type: child.type,
      sort: child.sort,
      parentId: child.parentId,
    });
  });

  const savedChildren = await categoryRepo.save(childEntities);

  // 3. 清理不在新体系里的旧分类
  const presetNames = new Set<string>([
    ...savedRoots.map((r) => r.name),
    ...savedChildren.map((c) => c.name),
  ]);

  const afterSave = await categoryRepo.find({ where: { accountId } });
  const legacy = afterSave.filter((c) => !presetNames.has(c.name));

  let reassigned = 0;
  if (legacy.length) {
    const fallbackExpense = rootByName.get(FALLBACK_EXPENSE_CATEGORY);
    const fallbackIncome = rootByName.get(FALLBACK_INCOME_CATEGORY);

    for (const old of legacy) {
      const target = old.type === 'income' ? fallbackIncome : fallbackExpense;
      if (!target) continue;
      const affected = await txnRepo.count({ where: { userId, categoryId: old.id } });
      if (affected > 0) {
        await txnRepo.update({ userId, categoryId: old.id }, { categoryId: target.id });
        reassigned += affected;
      }
    }

    await categoryRepo.delete(legacy.map((c) => c.id));
  }

  return {
    total: savedRoots.length + savedChildren.length,
    roots: savedRoots.length,
    children: savedChildren.length,
    legacyRemoved: legacy.length,
    reassigned,
  };
}
