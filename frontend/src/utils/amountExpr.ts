/**
 * 金额表达式 · 记一笔键盘的「加减计算」内核
 *
 * 模型：`amount` 字符串不再只是数字，可以是一个**纯加减表达式**，
 * 如 `12.5+3-2`、`-5+3`、`3+-2`（加负数）。
 *
 * ── 三条铁律 ─────────────────────────────────────────────────────
 *
 * 1. **只有 + 和 -，从左到右**，没有乘除、没有括号、没有优先级。
 *    记账场景的四则运算需求 99% 是"几笔钱凑一个数"，
 *    引入乘除只会把边界条件从「难」变成「不可测」。
 *
 * 2. **全程分（cents）整数运算**，求值前不碰浮点。
 *    `0.1 + 0.2 = 0.30000000000000004` 这种鬼故事出现在金额上是事故。
 *
 * 3. **符号规则刻意收窄**：
 *    - 开头允许 `-`（负数起始），不允许 `+`（无意义）；
 *    - `+` 后允许跟一个 `-` 表示"加负数"（`3+-2 = 1`）；
 *    - `3--2` 这种写法**不支持**（`-` 后不能再跟符号）——
 *      语法越窄，"用户到底想干嘛"的歧义越少。
 *
 * 输入规则（数字/小数点）与改造前一致，只是作用域从"整个值"
 * 收窄为"当前操作数"：每个操作数独立遵守
 * 「一个小数点 / 两位小数 / 整数位 ≤9 / 去前导零」。
 */

/** 整数部分最大位数（与原键盘一致） */
const MAX_INT_LEN = 9;

/** 每个操作数小数位数上限 */
const MAX_FRAC_LEN = 2;

/**
 * 尾部数字串：当前操作数的数字部分（不含符号与运算符）。
 * 如 `3+-12.5` → `12.5`；`3+` → ``；`-` → ``。
 */
function tailNumber(expr: string): string {
  const m = expr.match(/[\d.]*$/);
  return m ? m[0] : '';
}

/** 输入数字键（'0'-'9'）。不合法时原样返回（静默忽略，与原键盘一致）。 */
export function pressDigit(expr: string, digit: string): string {
  const tail = tailNumber(expr);
  const dotIndex = tail.indexOf('.');

  if (dotIndex >= 0) {
    // 小数位已达上限
    if (tail.length - dotIndex - 1 >= MAX_FRAC_LEN) return expr;
  } else {
    // 整数部分长度限制（去前导零后计）
    if (tail.replace(/^0+/, '').length >= MAX_INT_LEN) return expr;
  }

  // 前导零坍缩：`0` → 按 `5` 得 `5`；`3+0` → 按 `5` 得 `3+5`
  if (tail === '0') return expr.slice(0, -1) + digit;

  return expr + digit;
}

/** 输入小数点。 */
export function pressDot(expr: string): string {
  const tail = tailNumber(expr);
  if (tail.includes('.')) return expr;
  // 空位（开头 / 运算符后 / 符号后）按 `.` 自动补 `0.`
  if (tail === '') return expr + '0.';
  return expr + '.';
}

/**
 * 输入运算符（'+' / '-'）。状态机见文件头第 3 条。
 *
 * 转换表（last = 末字符）：
 *   空串        : '+' 忽略；'-' 起始负号
 *   数字        : 追加为运算符          `3` + `-` → `3-`
 *   '.'         : 收掉悬点小数点再追加   `3.` + `+` → `3+`
 *   '+'         : '+' 去重；'-' 变"加负数"  `3+` + `-` → `3+-`
 *   '-'(起始)   : '-' 去重；'+' 撤掉负号   `-` + `+` → ``
 *   '-'(在'+')  : '-' 去重；'+' 撤掉负号   `3+-` + `+` → `3+`
 *   '-'(运算符) : '-' 去重；'+' 改运算符   `3-` + `+` → `3+`
 */
export function pressOperator(expr: string, op: '+' | '-'): string {
  if (expr === '') return op === '-' ? '-' : '';

  const last = expr.slice(-1);

  if (last >= '0' && last <= '9') return expr + op;
  if (last === '.') return expr.slice(0, -1) + op;

  if (last === '+') {
    // `+` 后再按 `-` = "加负数"的负号；再按 `+` 无意义
    return op === '-' ? expr + '-' : expr;
  }

  // last === '-'
  if (expr === '-') {
    // 起始负号：再按 `+` 视为撤销负号，按 `-` 去重
    return op === '+' ? '' : expr;
  }
  if (expr.endsWith('+-')) {
    // 已有"加负数"的负号：按 `+` 撤销该负号，按 `-` 去重
    return op === '+' ? expr.slice(0, -1) : expr;
  }
  // `-` 是数字后的运算符：按 `+` 换运算符，按 `-` 去重（不支持 `--`）
  return op === '+' ? expr.slice(0, -1) + '+' : expr;
}

/** 退格：逐字符删除（表达式与数字一视同仁）。 */
export function backspaceExpr(expr: string): string {
  return expr.slice(0, -1);
}

/**
 * 是否为「表达式」（含真正的运算符，不只是开头的负号）。
 * 用于记一笔页切换「表达式 + 实时结果」的展示形态。
 */
export function isExpression(expr: string): boolean {
  return /[+-]/.test(expr.slice(1));
}

/**
 * 求值 → **分**（整数）；无法求值（空 / 只剩符号）返回 null。
 *
 * 容忍不完整输入：尾部悬空的运算符、符号、悬点小数点会先剥离，
 * 所以 `12+`、`3+-`、`3.` 都能求出值（分别为 1200 / 300 / 300）——
 * 实时预览与「确定」共用这一条路径，行为天然一致。
 */
export function evalExpr(expr: string): number | null {
  // 剥离尾部悬空片段：`3+-` → `3+` → `3`；`3.` → `3`
  let s = expr.replace(/[+-]+$/, '').replace(/\.$/, '');
  if (!s) return null;

  // `3+-2` 归一为 `3-2`（x + (-y) ≡ x - y），随后只剩简单加减链
  s = s.replace(/\+-/g, '-');

  if (!/^-?\d+(\.\d{0,2})?([+-]\d+(\.\d{0,2})?)*$/.test(s)) return null;

  let cents = 0;
  for (const token of s.match(/[+-]?\d+(\.\d{0,2})?/g) || []) {
    cents += toCents(token);
  }
  return cents;
}

/** 单个带符号操作数 → 分。`'3.5'` → 350，`'-2'` → -200，`'3.'` → 300 */
function toCents(token: string): number {
  const neg = token.startsWith('-');
  const body = neg || token.startsWith('+') ? token.slice(1) : token;
  const [intPart, fracPart = ''] = body.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  const value = parseInt(intPart || '0', 10) * 100 + parseInt(frac, 10);
  return neg ? -value : value;
}

/**
 * 分 → 展示字符串：**去掉多余的尾零**。
 * 1350 → `13.5`，1300 → `13`，1305 → `13.05`，-200 → `-2`。
 * （存储走 `toFixed(2)` 另行格式化，这里只服务实时预览。）
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = abs % 100;
  if (fracPart === 0) return sign + intPart;
  const frac = String(fracPart).padStart(2, '0').replace(/0$/, '');
  return `${sign}${intPart}.${frac}`;
}
