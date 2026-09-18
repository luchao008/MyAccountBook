import { inflateRawSync } from 'zlib';

/**
 * 零依赖 xlsx 读取器（只读）。
 *
 * 为什么不用 npm 的 xlsx / exceljs：
 *   ① 项目一贯风格是「零依赖自写」（CSV 工具、配色校验器、图标生成器都是）；
 *   ② `xlsx@0.18.5` 有未修复的原型污染公告，exceljs 的体积远超本需求；
 *   ③ 我们只需要「读一张表 → 二维数组」这一个能力。
 *
 * 支持范围（覆盖随手记导出的 xlsx）：
 *   - zip 压缩方式：store(0) 与 deflate(8)
 *   - 单元格类型：共享字符串 `t="s"`、内联字符串 `t="inlineStr"`、公式串 `t="str"`、
 *     布尔 `t="b"`、数值（含 Excel 1900 日期序列号，按单元格样式判定）
 *   - 富文本 `<si><r><t>…</t></r></si>`（多段拼接）
 *   - 稀疏单元格：按 `r="C5"` 的列号落位，缺的列补 null
 *
 * 不支持：`.xls`（BIFF 二进制）、加密文件、ZIP64（>4GB，账单文件不可能到）。
 * 遇到不支持的情况抛 `XlsxParseError`，由调用方转成可读的业务错误。
 */

/** 解析失败。调用方据此转成「文件无法解析」类业务错误码。 */
export class XlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxParseError';
  }
}

/** 单个工作表：`rows` 为二维数组，行内按列号落位，缺列是 null。 */
export interface XlsxSheet {
  name: string;
  rows: (string | number | null)[][];
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

/** 允许的最大文件体积（2MB）。随手记账单 664 行仅 41KB，留了 50 倍余量。 */
export const MAX_XLSX_BYTES = 2 * 1024 * 1024;

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** zip 中央目录条目 */
interface ZipEntry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** 内置的日期/时间数字格式 id（ECMA-376 第 18.8.30 节） */
const BUILTIN_DATE_FMT = new Set<number>();
for (let i = 14; i <= 22; i++) BUILTIN_DATE_FMT.add(i);
for (let i = 27; i <= 36; i++) BUILTIN_DATE_FMT.add(i);
for (let i = 45; i <= 47; i++) BUILTIN_DATE_FMT.add(i);
for (let i = 50; i <= 58; i++) BUILTIN_DATE_FMT.add(i);

/* ============================================================
 * 一、zip 解包
 * ============================================================ */

/**
 * 读中央目录。
 *
 * 只读中央目录而不扫本地头：本地头可能带 data descriptor（尺寸写在数据之后），
 * 而中央目录里的尺寸永远是最终值。
 */
function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  const eocd = findEocd(buf);
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  const entries = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    if (localHeaderOffset === 0xffffffff || compressedSize === 0xffffffff) {
      throw new XlsxParseError('不支持 ZIP64 格式的 xlsx');
    }
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  if (entries.size === 0) {
    throw new XlsxParseError('不是有效的 xlsx 文件（zip 目录为空）');
  }
  return entries;
}

/** 从尾部向前找 EOCD 签名（注释最长 65535，所以最多回看 65557 字节）。 */
function findEocd(buf: Buffer): number {
  const lowest = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new XlsxParseError('不是有效的 xlsx 文件（缺少 zip 结尾标记）');
}

/** 解出单个条目的内容。 */
function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== LOCAL_SIG) {
    throw new XlsxParseError('xlsx 内部结构损坏（本地头无效）');
  }
  // 本地头的 extra 长度可能与中央目录不同，必须用本地头算数据起点
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) {
    try {
      return inflateRawSync(data);
    } catch {
      throw new XlsxParseError('xlsx 内部数据解压失败（文件可能已损坏）');
    }
  }
  throw new XlsxParseError(`不支持的压缩方式（method=${entry.method}）`);
}

/* ============================================================
 * 二、XML 小工具
 * ============================================================ */

/** 解码 XML 实体。只在确实含 `&` 时才走替换，避免整表逐字符正则。 */
function decodeXmlText(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (whole, g: string) => {
    switch (g) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        const code =
          g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
    }
  });
}

/** 取标签上的属性值。`name` 允许含冒号（如 `r:id`）。 */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`));
  return m ? decodeXmlText(m[1]) : null;
}

/** 把 `<si>` / `<is>` 里所有 `<t>` 片段拼起来（富文本就是多个 `<r><t>`）。 */
function extractTextRuns(inner: string): string {
  // 去掉注音块，否则拼音会被混进分类名
  const cleaned = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let text = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) text += decodeXmlText(m[1]);
  return text;
}

/** 由 `A1` / `AB12` 这类引用取 0 基列号。 */
function colIndexOf(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
    else break;
  }
  return n - 1;
}

/* ============================================================
 * 三、共享字符串 / 样式 / 工作表
 * ============================================================ */

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(m[1] ? extractTextRuns(m[1]) : '');
  }
  return out;
}

/**
 * 收集「哪些单元格样式索引代表日期」。
 *
 * 数值型的日期在 xlsx 里就是天数，只有看样式才知道要显示成日期。
 * 自定义格式先剥掉引号字面量、方括号段与反斜杠转义，再看有没有 y/m/d/h/s。
 */
function parseDateStyles(xml: string): Set<number> {
  const custom = new Map<number, string>();
  const fmtRe = /<numFmt\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = fmtRe.exec(xml))) {
    const id = attr(m[0], 'numFmtId');
    const code = attr(m[0], 'formatCode');
    if (id !== null && code !== null) custom.set(Number(id), code);
  }

  const cellXfsBlock = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  const dateStyles = new Set<number>();
  if (!cellXfsBlock) return dateStyles;

  const xfRe = /<xf\b[^>]*\/?>/g;
  let idx = 0;
  while ((m = xfRe.exec(cellXfsBlock[1]))) {
    const raw = attr(m[0], 'numFmtId');
    const numFmtId = raw === null ? 0 : Number(raw);
    let isDate = BUILTIN_DATE_FMT.has(numFmtId);
    if (!isDate && custom.has(numFmtId)) {
      const code = custom
        .get(numFmtId)!
        .replace(/"[^"]*"/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\\./g, '');
      isDate = /[ymdhs]/i.test(code);
    }
    if (isDate) dateStyles.add(idx);
    idx += 1;
  }
  return dateStyles;
}

/** Excel 1900 日期序列号 → `YYYY-MM-DD` 或 `YYYY-MM-DD HH:mm:ss`（UTC 计算，避免时区漂移）。 */
function excelSerialToText(serial: number): string {
  const days = Math.floor(serial);
  const frac = serial - days;
  // 25569 = 1970-01-01 在 Excel 里的序列号（已含 1900 闰年 bug 的偏移）
  const ms = Math.round((days - 25569) * 86400000 + frac * 86400000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  if (frac <= 0) return datePart;
  const secs = Math.round(frac * 86400);
  return `${datePart} ${p2(Math.floor(secs / 3600) % 24)}:${p2(Math.floor(secs / 60) % 60)}:${p2(
    secs % 60,
  )}`;
}

function parseSheet(
  xml: string,
  shared: string[],
  dateStyles: Set<number>,
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  const rowRe = /<row\b([^>]*)\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  let autoRow = 0;

  while ((rm = rowRe.exec(xml))) {
    const rowAttrs = rm[1] !== undefined ? rm[1] : rm[2];
    const body = rm[1] !== undefined ? '' : rm[3];
    const rawRowIdx = attr(rowAttrs, 'r');
    const rowIdx = rawRowIdx === null ? autoRow : Number(rawRowIdx) - 1;
    autoRow = rowIdx + 1;

    const cells: (string | number | null)[] = [];
    let autoCol = 0;
    const cellRe = /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(body))) {
      const cellAttrs = cm[1] !== undefined ? cm[1] : cm[2];
      const cellBody = cm[1] !== undefined ? '' : cm[3];
      const ref = attr(cellAttrs, 'r');
      const col = ref === null ? autoCol : colIndexOf(ref);
      autoCol = col + 1;
      if (col < 0) continue;
      cells[col] = readCellValue(cellAttrs, cellBody, shared, dateStyles);
    }

    // 行内未出现的列补 null，保证列号与表头对得上
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows[rowIdx] = cells;
  }

  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

function readCellValue(
  cellAttrs: string,
  cellBody: string,
  shared: string[],
  dateStyles: Set<number>,
): string | number | null {
  const type = attr(cellAttrs, 't');

  if (type === 'inlineStr') {
    const isBlock = cellBody.match(/<is\b[^>]*>([\s\S]*?)<\/is>/);
    return isBlock ? extractTextRuns(isBlock[1]) : null;
  }

  const vMatch = cellBody.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (!vMatch) return null;
  const raw = decodeXmlText(vMatch[1]);

  if (type === 's') {
    const idx = parseInt(raw, 10);
    return Number.isFinite(idx) && idx >= 0 && idx < shared.length ? shared[idx] : null;
  }
  if (type === 'str' || type === 'e') return raw;
  if (type === 'b') return raw === '1' ? 1 : 0;

  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  const styleRaw = attr(cellAttrs, 's');
  if (styleRaw !== null && dateStyles.has(Number(styleRaw))) return excelSerialToText(num);
  return num;
}

/* ============================================================
 * 四、入口
 * ============================================================ */

/** 读出工作簿里的全部工作表（按 workbook.xml 的声明顺序）。 */
export function readXlsx(buf: Buffer): XlsxWorkbook {
  if (buf.length === 0) throw new XlsxParseError('文件内容为空');
  if (buf.readUInt32LE(0) !== LOCAL_SIG) {
    throw new XlsxParseError('不是 xlsx 文件（可能是不支持的 .xls 旧格式）');
  }

  const entries = readZipEntries(buf);
  const read = (name: string): Buffer | null => {
    const e = entries.get(name);
    return e ? readZipEntry(buf, e) : null;
  };

  const workbookBuf = read('xl/workbook.xml');
  if (!workbookBuf) throw new XlsxParseError('xlsx 缺少 xl/workbook.xml');
  const workbookXml = workbookBuf.toString('utf8');

  // 共享字符串可能不存在（全内联字符串的工作簿）
  const sharedBuf = read('xl/sharedStrings.xml');
  const shared = sharedBuf ? parseSharedStrings(sharedBuf.toString('utf8')) : [];

  const stylesBuf = read('xl/styles.xml');
  const dateStyles = stylesBuf ? parseDateStyles(stylesBuf.toString('utf8')) : new Set<number>();

  // 工作表文件名走 rels（Target 相对 xl/ 目录，也可能是以 / 开头的绝对路径）
  const targets = new Map<string, string>();
  const relsBuf = read('xl/_rels/workbook.xml.rels');
  if (relsBuf) {
    const relRe = /<Relationship\b[^>]*>/g;
    let m: RegExpExecArray | null;
    const relsXml = relsBuf.toString('utf8');
    while ((m = relRe.exec(relsXml))) {
      const id = attr(m[0], 'Id');
      const target = attr(m[0], 'Target');
      if (id && target) targets.set(id, target);
    }
  }

  const sheets: XlsxSheet[] = [];
  const sheetRe = /<sheet\b[^>]*>/g;
  let sm: RegExpExecArray | null;
  let fallback = 0;
  while ((sm = sheetRe.exec(workbookXml))) {
    const name = attr(sm[0], 'name') ?? `Sheet${fallback + 1}`;
    const rid = attr(sm[0], 'r:id');
    fallback += 1;

    const target = rid === null ? undefined : targets.get(rid);
    // 没有 rels 时的兜底：按声明顺序猜 sheetN.xml
    const path = target
      ? target.startsWith('/')
        ? target.slice(1)
        : `xl/${target}`
      : `xl/worksheets/sheet${fallback}.xml`;

    const sheetBuf = read(path);
    if (!sheetBuf) continue;
    sheets.push({ name, rows: parseSheet(sheetBuf.toString('utf8'), shared, dateStyles) });
  }

  if (sheets.length === 0) throw new XlsxParseError('xlsx 里没有可读的工作表');
  return { sheets };
}
