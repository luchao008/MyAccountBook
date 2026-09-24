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

/** 日期 → 「13日 周一」这种日期头（明细按日分组时用） */
export function dayHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  // getDay(): 0=周日 → 按「周一…周日」的自然顺序排列
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d}日 ${names[dow]}`;
}
