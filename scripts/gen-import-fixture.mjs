/**
 * 生成「流水导入」回归测试用的最小 xlsx（scripts/fixtures/ledger-sample.xlsx）。
 *
 *   node scripts/gen-import-fixture.mjs
 *
 * 为什么需要它：
 *   `scripts/regression-test.sh` 是纯 curl + bash，没有 TS 运行时，
 *   用不了 `test/xlsx-fixture.ts` 那个内存构造器。而导入接口必须收到**真的 xlsx**
 *   （后端要解析 zip + XML），不能拿假 base64 糊弄。
 *
 * 为什么不直接提交一个二进制 fixture 了事：
 *   二进制在仓库里是"看不懂、改不动"的黑盒；生成器只有 80 行，
 *   改表头 / 加一列都能自己动手，且产物可复现。
 *
 * 产物内容（够覆盖回归用例即可，不做全量账单）：
 *   工作表「支出」2 行 + 「收入」1 行，表头与随手记导出一致（13 列）。
 *
 * ⚠️ 与 `test/xlsx-fixture.ts` 的 zip 写入逻辑是**同源的两份**（一份 JS 一份 TS）。
 *    刻意不抽公共：两者运行环境不同（node ESM vs ts-jest），
 *    且这份只在改 fixture 时才跑一次，抽出去的收益小于耦合成本。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** `{ 文件名: 内容 }` → zip（store 模式；后端两种模式都支持，store 更好排查） */
function buildZip(files) {
  const entries = Object.entries(files).map(([name, content]) => {
    const raw = Buffer.from(content, 'utf8');
    return { name, rawSize: raw.length, crc: crc32(raw), data: raw };
  });

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(e.crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.rawSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
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

const HEADER = [
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

/** 列号 → A/B/C…（只用到 13 列，不必支持双字母） */
const col = (i) => String.fromCharCode(65 + i);

/**
 * 造一张工作表。
 *
 * `shared` 是**整个工作簿共用**的共享串表（xlsx 只有一份 sharedStrings.xml），
 * 两张表必须传同一个数组，否则第二张表的字符串索引会全部错位。
 */
function makeSheet(name, rows, shared) {
  const idx = (s) => {
    let i = shared.indexOf(s);
    if (i < 0) {
      shared.push(s);
      i = shared.length - 1;
    }
    return i;
  };
  const sCell = (ref, text) => `<c r="${ref}" t="s"><v>${idx(text)}</v></c>`;

  let body = HEADER.map((h, c) => sCell(`${col(c)}1`, h)).join('');
  body = `<row r="1">${body}</row>`;

  rows.forEach((r, i) => {
    const n = i + 2;
    // 金额列（G）刻意写成**数字型**：随手记导出的就是数字，走字符串分支反而测不到真实形态
    const cells = [
      sCell(`A${n}`, r.type),
      sCell(`B${n}`, r.date),
      sCell(`C${n}`, r.l1),
      sCell(`D${n}`, r.l2),
      sCell(`E${n}`, '现金'),
      sCell(`F${n}`, 'CNY'),
      `<c r="G${n}"><v>${r.amount}</v></c>`,
      sCell(`H${n}`, '本人'),
      sCell(`L${n}`, 'regression'),
      r.note ? sCell(`M${n}`, r.note) : '',
    ].join('');
    body += `<row r="${n}">${cells}</row>`;
  });

  return { name, file: `worksheets/sheet${name === '支出' ? 1 : 2}.xml`, body };
}

const shared = [];
const sheets = [
  makeSheet(
    '支出',
    [
      // 二级分类带尾部空格 —— 实测附件就是这个形态，导入必须 trim 后才能命中
      { type: '支出', date: '2026-03-01 12:30:00', l1: '食品酒水', l2: '早午晚餐  ', amount: '35.5', note: '回归午饭' },
      { type: '支出', date: '2026-03-02 08:15:00', l1: '行车交通', l2: '公共交通', amount: '6', note: '' },
      /*
       * 二级分类不存在 → 后端降级挂到一级「食品酒水」并标记 unmatched。
       * ⚠️ 这一行是**故意留的异常样本**：前端预览页只列需要关注的记录
       * （正常流水被省略），没有它的话「分类降级」这一组永远是空的，测不到。
       */
      { type: '支出', date: '2026-03-03 19:20:00', l1: '食品酒水', l2: '不存在的二级', amount: '88', note: '回归分类降级' },
    ],
    shared
  ),
  makeSheet(
    '收入',
    [{ type: '收入', date: '2026-03-05 09:00:00', l1: '职业收入', l2: '工资收入', amount: '1000.00', note: '回归工资' }],
    shared
  ),
];

const files = {
  'xl/workbook.xml':
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    sheets.map((s, i) => `<sheet name="${s.name}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<?xml version="1.0"?><Relationships>' +
    sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Target="${s.file}"/>`).join('') +
    '</Relationships>',
  'xl/styles.xml':
    '<?xml version="1.0"?><styleSheet><numFmts/><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>',
  'xl/sharedStrings.xml':
    '<?xml version="1.0"?><sst>' + shared.map((s) => `<si><t>${s}</t></si>`).join('') + '</sst>',
};
for (const s of sheets) {
  files[`xl/${s.file}`] =
    '<?xml version="1.0"?><worksheet><sheetData>' + s.body + '</sheetData></worksheet>';
}

const out = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ledger-sample.xlsx');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buildZip(files));
console.log('written:', out);