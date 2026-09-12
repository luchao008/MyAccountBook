/**
 * 金额展示格式化。
 *
 * 后端传输的金额始终是字符串（如 "1866713.65"），展示时需要千分位。
 * 输入兼容字符串与数字，非法值按 0 处理，保证界面不会出现 NaN。
 */
export function formatMoney(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0.00';

  const fixed = Math.abs(num).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = num < 0 ? '-' : '';

  return `${sign}${withSeparator}.${decPart}`;
}

/** 只取两位小数，不做千分位（用于输入框回填等场景） */
export function toFixed2(value: string | number | null | undefined): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}
