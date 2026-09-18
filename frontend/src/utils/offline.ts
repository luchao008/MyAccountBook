/**
 * 离线记账队列（仅 H5，MVP）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 范围（刻意压小，见与 luchao 确认的 MVP 边界）：
 *   ✅ 断网时「记一笔」保存到本地队列，联网后自动补传
 *   ❌ 不支持离线查询 / 编辑 / 删除 / 改分类账本
 *
 * 因为**只允许离线"新增"**，所以不存在"离线改了别处也改了"的冲突 ——
 * 联网后就是普通新增。这是把复杂度压到最低的关键取舍。
 *
 * 幂等：每条离线记录带一个客户端生成的 clientId（UUID），补传重试带同一个值；
 * 服务端 (user_id, client_id) 唯一，重复提交只会落一条（见后端 create()）。
 * ────────────────────────────────────────────────────────────────────────
 */

/** 待补传的一条离线流水（字段与 createTransaction 的入参对齐，外加本地元信息） */
export interface OfflineTxn {
  /** 客户端幂等键（UUID），也是本地队列的 key */
  clientId: string;
  /** 记录入队时间（仅本地展示/排序用，不传服务端） */
  queuedAt: number;
  /** createTransaction 的入参（accountId 已含在内，入队时快照） */
  payload: {
    type: 'income' | 'expense';
    amount: string;
    recordDate: string;
    categoryId?: string;
    note?: string;
    recordTime?: string;
    accountId?: string;
  };
}

const QUEUE_KEY = 'offlineTxnQueue';

/** 读队列（容错：存储损坏时返回空数组，不抛） */
export function getQueue(): OfflineTxn[] {
  try {
    const raw = uni.getStorageSync(QUEUE_KEY);
    if (!raw) return [];
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveQueue(list: OfflineTxn[]): void {
  uni.setStorageSync(QUEUE_KEY, list);
}

/** 当前待补传条数（UI 角标用） */
export function queueCount(): number {
  return getQueue().length;
}

/** 生成一个 UUID（H5 优先 crypto.randomUUID，回退手写） */
export function genClientId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // 回退：时间戳 + 随机数（够唯一，离线补传幂等不要求密码学强度）
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 入队一条离线流水 */
export function enqueue(item: OfflineTxn): void {
  const list = getQueue();
  list.push(item);
  saveQueue(list);
}

/** 按 clientId 出队（补传成功后调用） */
export function dequeue(clientId: string): void {
  saveQueue(getQueue().filter((x) => x.clientId !== clientId));
}

/** 是否在线（uni.getNetworkType 的 sync 版不存在，用 getNetworkType 的异步封装成本高；
 *  这里用简单判据：H5 下 navigator.onLine；非 H5 端默认 true，由请求失败兜底） */
export function isOnline(): boolean {
  const nav = (globalThis as any).navigator;
  if (nav && typeof nav.onLine === 'boolean') return nav.onLine;
  return true;
}


/**
 * 补传队列：逐条提交，成功即出队。
 *
 * ⚠️ **串行**提交（不是 Promise.all）：队列通常只有个位数条，串行实现简单、
 *    且某条失败时可以精确停止（不继续后面的），避免同时并发一堆请求。
 *
 * ⚠️ 某条**业务失败**（如分类已被删 → 后端降级为未分类其实不会失败；
 *    但若账本已删 → 404）时**保留在队列并停止**，不静默丢弃 ——
 *    宁可留着让用户知道，也不假装成功。
 *
 * 返回 { sent, remaining }，调用方可据此提示。
 */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const list = getQueue();
  if (!list.length) return { sent: 0, remaining: 0 };

  const { createTransaction } = await import('@/api/transaction');
  let sent = 0;
  for (const item of list) {
    try {
      await createTransaction({ ...item.payload, clientId: item.clientId });
      dequeue(item.clientId);
      sent += 1;
    } catch (err) {
      // 网络仍不通 / 业务失败：停止，保留剩余（含当前这条）在队列
      console.warn('[offline] 补传中断', err);
      break;
    }
  }
  return { sent, remaining: getQueue().length };
}

