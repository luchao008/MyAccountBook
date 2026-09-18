import { deflateRawSync } from 'zlib';

/**
 * 测试用的最小 xlsx 构造器（内存里拼 zip + XML）。
 *
 * 存在的理由：真实的随手记账单文件在仓库之外（且含真实账目），
 * 单测必须能**自己造文件**，才能精确构造各种形态：
 * 缺列的表头、坏掉的日期、超长备注、deflate 压缩、缺 sharedStrings…
 *
 * 生产代码里没有「写 xlsx」的能力（导入是只读的），
 * 所以这个写入器只活在 test/ 下，不进 src/。
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

interface Entry {
  name: string;
  data: Buffer;
  rawSize: number;
  crc: number;
  method: 0 | 8;
}

/** 把 `{ 文件名: 内容 }` 打包成一个 zip（store 或 deflate） */
export function buildZip(files: Record<string, string>, method: 0 | 8 = 0): Buffer {
  const entries: Entry[] = Object.entries(files).map(([name, content]) => {
    const raw = Buffer.from(content, 'utf8');
    return {
      name,
      rawSize: raw.length,
      crc: crc32(raw),
      method,
      data: method === 8 ? deflateRawSync(raw) : raw,
    };
  });

  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.method, 8);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.rawSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(e.method, 10);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.rawSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + e.data.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([Buffer.concat(locals), cd, eocd]);
}

export interface SheetSpec {
  name: string;
  /** rels 里的 Target，相对 xl/ 目录 */
  file: string;
  /** `<sheetData>` 的内容 */
  body: string;
}

/** 一张工作表的一行（`cells` 直接写 `<c>` 片段） */
export function row(idx: number, cells: string): string {
  return `<row r="${idx}">${cells}</row>`;
}

/** 字符串单元格（走共享串） */
export function sCell(ref: string, sharedIndex: number): string {
  return `<c r="${ref}" t="s"><v>${sharedIndex}</v></c>`;
}

/** 数字单元格 */
export function nCell(ref: string, value: number): string {
  return `<c r="${ref}"><v>${value}</v></c>`;
}

/** 内联字符串单元格（不占用共享串表） */
export function iCell(ref: string, text: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
}

/**
 * 拼一个可用的 xlsx。
 *
 * `shared` 里的字符串按顺序编号；`sheets[].body` 里用 `sCell` 引用它们。
 * 默认 styles 里索引 0 是普通格式、索引 1 是内置日期格式（numFmtId=14）。
 */
export function makeWorkbook(opts: {
  shared?: string[];
  sheets: SheetSpec[];
  styles?: string;
  method?: 0 | 8;
}): Buffer {
  const shared = opts.shared ?? [];
  const files: Record<string, string> = {
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      opts.sheets.map((s, i) => `<sheet name="${s.name}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0"?><Relationships>' +
      opts.sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Target="${s.file}"/>`).join('') +
      '</Relationships>',
    'xl/styles.xml':
      opts.styles ??
      '<?xml version="1.0"?><styleSheet><numFmts/><cellXfs count="2">' +
        '<xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  };

  if (shared.length) {
    files['xl/sharedStrings.xml'] =
      '<?xml version="1.0"?><sst>' + shared.map((s) => `<si><t>${s}</t></si>`).join('') + '</sst>';
  }

  for (const s of opts.sheets) {
    files[`xl/${s.file}`] =
      '<?xml version="1.0"?><worksheet><sheetData>' + s.body + '</sheetData></worksheet>';
  }

  return buildZip(files, opts.method ?? 0);
}

/** 随手记导出格式的表头（13 列，支出/收入只是第 5 列列名不同） */
export const HEADER = [
  '交易类型',
  '日期',
  '一级分类',
  '二级分类',
  '支出账户',
  '账户币种',
  '金额',
  '成员',
  '商家',
  '项目分类',
  '项目',
  '记账人',
  '备注',
];

/**
 * 造一张「随手记风格」的工作表。
 *
 * 表头 + 数据行全部走共享串（与真实文件一致），
 * 金额是数字型、日期是字符串（实测附件就是这两种形态）。
 */
export function makeLedgerSheet(
  name: string,
  rows: {
    type: '支出' | '收入';
    date: string;
    l1: string;
    l2: string;
    amount: number | string;
    note?: string;
  }[],
  /**
   * 共享字符串表。**多张工作表必须传同一个数组**（会被就地追加）：
   * 整个工作簿只有一份 sharedStrings.xml，各表的字符串索引共用同一个编号空间；
   * 每张表各建一份再拼起来，索引就对不上了。
   */
  shared: string[] = [...HEADER],
): { shared: string[]; sheet: SheetSpec } {
  const idx = (s: string): number => {
    let i = shared.indexOf(s);
    if (i < 0) {
      shared.push(s);
      i = shared.length - 1;
    }
    return i;
  };

  let body = '';
  const headerCells = HEADER.map((h, c) => sCell(`${String.fromCharCode(65 + c)}1`, idx(h))).join(
    '',
  );
  body += row(1, headerCells);

  rows.forEach((r, i) => {
    const n = i + 2;
    const cells = [
      sCell(`A${n}`, idx(r.type)),
      sCell(`B${n}`, idx(r.date)),
      sCell(`C${n}`, idx(r.l1)),
      sCell(`D${n}`, idx(r.l2)),
      sCell(`E${n}`, idx('现金')),
      sCell(`F${n}`, idx('CNY')),
      // 金额列固定是 G；数字型直接写数字，字符串型走共享串（两种都要覆盖）
      typeof r.amount === 'number' ? nCell(`G${n}`, r.amount) : sCell(`G${n}`, idx(r.amount)),
      sCell(`H${n}`, idx('本人')),
      iCell(`I${n}`, ''),
      iCell(`J${n}`, ''),
      iCell(`K${n}`, ''),
      sCell(`L${n}`, idx('tester')),
      r.note ? sCell(`M${n}`, idx(r.note)) : iCell(`M${n}`, ''),
    ].join('');
    body += row(n, cells);
  });

  return { shared, sheet: { name, file: `worksheets/sheet${name === '支出' ? 1 : 2}.xml`, body } };
}
