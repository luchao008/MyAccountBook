/**
 * CSV 导出工具（流水页 / 报表页 / 数据导出页共用）。
 *
 * ⚠️ 抽出来的原因：这套逻辑原本在 flow 页与 ReportView 各写了一遍（完全相同的代码），
 *    数据导出页是第三处 —— 项目一贯反对"各写一遍"，MEMORY 里明确记着"两份必然分叉"。
 */

/**
 * CSV 单元格转义。
 *
 * ⚠️ 含逗号 / 引号 / 换行的值必须整体加引号，且内部引号要翻倍 ——
 *    否则 Excel 会把一个单元格拆成多列（备注里带逗号是常见场景）。
 */
export function csvCell(v: string): string {
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** 二维数组 → CSV 文本（带 BOM，保证 Excel 正确识别中文） */
export function toCsv(rows: string[][]): string {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/**
 * 触发浏览器下载（仅 H5）。
 *
 * @returns 是否真的发起了下载（非 H5 端返回 false，调用方负责提示）
 */
export function downloadCsv(filename: string, csv: string): boolean {
  // #ifdef H5
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
  // #endif
  // #ifndef H5
  return false;
  // #endif
}
