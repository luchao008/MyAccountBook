/**
 * 分组键 ↔ 日期区间 的互转。
 *
 * 后端 `/transactions/summary` 返回的 `key` 是**字符串**（2026 / 2026-Q3 / 2026-09 /
 * 2026-W37 / 2026-09-14），而展开某组时要拿它的日期区间去查明细列表。
 * 转换规则必须与后端 `GROUP_FORMAT` 完全一致，否则会"展开了却是空列表"。
 *
 * ⚠️ 后端 week 用的是 `%x-W%v`（ISO 周：**周一为起点**，与首页"本周"口径一致），
 *    这里也必须按 ISO 周算，不能用 JS 默认的周日起点。
 */

/** 补零 */
const pad = (n: number) => String(n).padStart(2, '0');

/** Date → YYYY-MM-DD（本地时区，不能用 toISOString —— 那会按 UTC 偏移一天） */
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 某年某月的最后一天（month 为 0-based） */
function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * ISO 周 → 该周周一。
 *
 * ISO 8601：周一为每周第一天；每年第 1 周是"包含 1 月 4 日的那一周"。
 * 所以从 1 月 4 日往回退到周一，就是第 1 周的起点，再往后推 (week-1) 周。
 */
function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  // getDay(): 0=周日 → 转成 ISO 的 1=周一 … 7=周日
  const isoDow = jan4.getDay() === 0 ? 7 : jan4.getDay();
  const week1Monday = new Date(year, 0, 4 - (isoDow - 1));
  const d = new Date(week1Monday);
  d.setDate(week1Monday.getDate() + (week - 1) * 7);
  return d;
}

/** 分组键 → { start, end }（闭区间，YYYY-MM-DD） */
export function periodRange(key: string, unit: string): { start: string; end: string } {
  if (unit === 'year') {
    const y = Number(key);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  if (unit === 'quarter') {
    // 2026-Q3
    const [yStr, qStr] = key.split('-Q');
    const y = Number(yStr);
    const q = Number(qStr);
    const startMonth0 = (q - 1) * 3;
    const endMonth0 = startMonth0 + 2;
    return {
      start: `${y}-${pad(startMonth0 + 1)}-01`,
      end: `${y}-${pad(endMonth0 + 1)}-${pad(lastDayOfMonth(y, endMonth0))}`,
    };
  }

  if (unit === 'month') {
    // 2026-09
    const [yStr, mStr] = key.split('-');
    const y = Number(yStr);
    const m0 = Number(mStr) - 1;
    return {
      start: `${y}-${pad(m0 + 1)}-01`,
      end: `${y}-${pad(m0 + 1)}-${pad(lastDayOfMonth(y, m0))}`,
    };
  }

  if (unit === 'week') {
    // 2026-W37
    const [yStr, wStr] = key.split('-W');
    const start = isoWeekStart(Number(yStr), Number(wStr));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  // day：key 本身就是日期
  return { start: key, end: key };
}

/** 分组键 → 展示用的标题与副标题（参考图：「9月 / 2026」「2026年 / 第3季度」…） */
export function periodLabel(key: string, unit: string): { title: string; sub: string } {
  if (unit === 'year') {
    return { title: `${key}年`, sub: '' };
  }
  if (unit === 'quarter') {
    const [yStr, qStr] = key.split('-Q');
    return { title: `${Number(qStr)}季度`, sub: yStr };
  }
  if (unit === 'month') {
    const [yStr, mStr] = key.split('-');
    return { title: `${Number(mStr)}月`, sub: yStr };
  }
  if (unit === 'week') {
    const [yStr, wStr] = key.split('-W');
    return { title: `第${Number(wStr)}周`, sub: yStr };
  }
  // day：09-14 → 9月14日
  const [, mStr, dStr] = key.split('-');
  return { title: `${Number(mStr)}月${Number(dStr)}日`, sub: key.slice(0, 4) };
}

/**
 * 日期 → 「13日 周一」/「9月13日 周一」这种日期头（流水页明细按日分组时用）。
 *
 * `withMonth` 的判据**不在本函数里**，由调用方决定 —— 流水页是 `dayHeadWithMonth`
 * （见 `pages/flow/index.vue`）。规则（2026-10-03 luchao 定）：
 *   · **只有「时间维度 × 月粒度」传 false** —— 组头已经是「9月」，明细必然同月，再加是重复
 *   · 其余一律传 true：年 / 季 / 分类（明细横跨多个月）、
 *     周（**ISO 周会跨月**，如 9月30 ~ 10月6）、天（与组头重复，但规则统一）
 *
 * 核心问题是"**仅看这一行文字，能不能确定是哪一天**"：
 *   8月13 与 9月13 的日头如果都写「13日 周三」，两者完全同形，无法区分。
 */
export function dayHeader(dateStr: string, withMonth = false): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  // getDay(): 0=周日 → 按「周一…周日」的自然顺序排列
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${withMonth ? `${m}月${d}日` : `${d}日`} ${names[dow]}`;
}

/* ============================================================
 * 图表页的时间粒度（2026-09-30 加）
 * ============================================================ */

/** 图表页的时间粒度。`all` = 不限时间；`custom` = 用户自选起止 */
export type Granularity = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

/** `2026-09-30` → `9.30`（不补零，与参考图的「今年 1.1 ~ 12.31」写法一致） */
function md(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}.${d}`;
}

/** 某个日期所在 ISO 周的周一（周一为一周起点，与后端 `%x-%v` 口径一致） */
function mondayOf(d: Date): Date {
  // getDay(): 0=周日 → 需要映射成 ISO 的 7
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1));
  return monday;
}

/** 单期粒度（不含 all / custom）在某个基准日期上的区间 */
function rangeOf(
  gran: Exclude<Granularity, 'all' | 'custom'>,
  d: Date,
): { start: string; end: string } {
  const year = d.getFullYear();
  const month0 = d.getMonth();

  if (gran === 'day') {
    const s = fmtDate(d);
    return { start: s, end: s };
  }
  if (gran === 'week') {
    const start = mondayOf(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: fmtDate(start), end: fmtDate(end) };
  }
  if (gran === 'month') {
    return {
      start: `${year}-${pad(month0 + 1)}-01`,
      end: `${year}-${pad(month0 + 1)}-${pad(lastDayOfMonth(year, month0))}`,
    };
  }
  if (gran === 'quarter') {
    const first0 = Math.floor(month0 / 3) * 3;
    const last0 = first0 + 2;
    return {
      start: `${year}-${pad(first0 + 1)}-01`,
      end: `${year}-${pad(last0 + 1)}-${pad(lastDayOfMonth(year, last0))}`,
    };
  }
  // year
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** 「今天 / 本周 / 本月 / 本季度 / 今年」前缀（仅当区间正好落在此刻所在的当期） */
const CURRENT_PREFIX: Record<Exclude<Granularity, 'all' | 'custom'>, string> = {
  day: '今天',
  week: '本周',
  month: '本月',
  quarter: '本季度',
  year: '今年',
};

/**
 * 时间粒度 → 查询区间（`start` / `end`，闭区间）+ 左下角展示文案。
 *
 * `all` 返回**不含 start/end** 的对象 —— 调用方据此"不传时间参数"，
 * 而不是传个空串（后端 DTO 对空串会走"必须匹配日期正则"的分支，直接 422）。
 *
 * `anchor` = 基准日期（默认今天）。左下角的左右箭头靠它实现"往前/往后翻一期"，
 * 翻页后区间就不是"当期"了 —— 那时文案改为带年份（`2025年 1.1 ~ 12.31`），
 * 否则光看「1.1 ~ 12.31」根本不知道是哪一年。
 *
 * ⚠️ 周按 **ISO 周**（周一为一周起点），必须与后端 `GROUP_FORMAT.week`（`%x-%v`）同口径；
 *    用 JS 默认的周日起点会让"本周"错一天。
 * ⚠️ 文案里的日期**不补零**（`1.1` 而不是 `01.01`），与参考图一致。
 */
export function granularityRange(
  gran: Granularity,
  custom?: { start: string; end: string },
  anchor?: Date,
): { start?: string; end?: string; label: string } {
  if (gran === 'all') return { label: '全部时间' };

  if (gran === 'custom') {
    // 用户明确给了起止；缺一边时按"不给限制"处理，不猜
    const s = custom?.start || '';
    const e = custom?.end || '';
    if (!s || !e) return { label: '自定义时间' };
    return { start: s, end: e, label: `${md(s)} ~ ${md(e)}` };
  }

  const base = anchor ?? new Date();
  const { start, end } = rangeOf(gran, base);
  const now = rangeOf(gran, new Date());
  const isCurrent = start === now.start && end === now.end;

  if (isCurrent) {
    // 「今天」只有一天，写成「今天 9.30 ~ 9.30」是废话
    return gran === 'day'
      ? { start, end, label: `今天 ${md(start)}` }
      : { start, end, label: `${CURRENT_PREFIX[gran]} ${md(start)} ~ ${md(end)}` };
  }
  return { start, end, label: `${base.getFullYear()}年 ${md(start)} ~ ${md(end)}` };
}
