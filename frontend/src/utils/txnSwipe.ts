import { ref } from 'vue';
import { deleteTransaction } from '@/api/transaction';

/**
 * 流水行左滑操作（复制 / 删除）—— 流水页与日历页共用。
 *
 * ⚠️ **只做「复制」「删除」两个**（luchao 确认）。参考图里还有「退款」，
 *    但退款需要「原单 + 退款单关联」的数据模型，本项目没有，**不做假控件**。
 *    「编辑」也不放：点整行就是编辑，重复。
 *
 * ⚠️ 删除是**软删除**（2026-09-15 起）：后端只写 deleted_at，
 *    7 天内在「流水回收站」可恢复 —— 所以确认文案必须如实告诉用户「可恢复」，
 *    否则用户会以为彻底没了。
 *
 * ⚠️ uni-swipe-action-item 的 `@click` 回参是 `{ index, content }`，
 *    `index` 对应 right-options 里的下标 —— **用下标判断而不是中文文案**，
 *    这样改文案不会影响逻辑。
 */

export interface SwipeableTxn {
  id: string;
}

/** 左滑按钮配置（压白字：蓝 5.95:1 / 红 4.83:1，均 ≥4.5） */
export const SWIPE_OPTIONS = [
  { text: '复制', style: { backgroundColor: '#1D63B8' } },
  { text: '删除', style: { backgroundColor: '#D92D20' } },
];

/** 跳记一笔页的**复制态**（用 `copyFrom` 而不是 `id`，后者是编辑） */
export function copyTransaction(id: string) {
  uni.navigateTo({ url: `/pages/record/index?copyFrom=${id}` });
}

/**
 * 删除确认 → 调软删除接口 → 成功后调 onDone（由页面决定怎么刷新）。
 *
 * 抽成 composable 的原因：流水页（分组明细 + 搜索结果）与日历页（当日明细）
 * 三处行为必须完全一致 —— 各写一遍必然出现「某处忘了刷新」或「文案不一样」。
 */
export function useTxnSwipe(onDone: () => void) {
  const deleting = ref(false);

  function onSwipe(e: { index: number }, t: SwipeableTxn) {
    if (e.index === 0) copyTransaction(t.id);
    else if (e.index === 1) confirmDelete(t);
  }

  function confirmDelete(t: SwipeableTxn) {
    uni.showModal({
      title: '删除提醒',
      // 文案与参考图一致，且如实说明「7 天内可恢复」
      content: '确定删除该笔流水？\n删除后7天内可到流水回收站恢复',
      confirmText: '确定删除',
      confirmColor: '#D92D20',
      success: async (res) => {
        if (!res.confirm) return;
        if (deleting.value) return;
        deleting.value = true;
        try {
          await deleteTransaction(t.id);
          uni.showToast({ title: '已删除', icon: 'none' });
          onDone();
        } catch (err) {
          console.error('[swipe] 删除失败', err);
        } finally {
          deleting.value = false;
        }
      },
    });
  }

  return { SWIPE_OPTIONS, onSwipe, copyTransaction, confirmDelete, deleting };
}
