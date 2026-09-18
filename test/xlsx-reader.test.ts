import { buildZip, makeWorkbook, row } from './xlsx-fixture';
import { readXlsx, XlsxParseError, MAX_XLSX_BYTES } from '../src/transaction/xlsx-reader';

/**
 * xlsx 读取器的单测。
 *
 * 这里**不依赖真实附件文件**（附件在仓库外，CI 上没有）：
 * 测试用 `test/xlsx-fixture.ts` 在内存里拼最小 xlsx（zip + 几个 XML），
 * 这样可以精确构造各种形态（共享串 / 内联串 / 日期序列号 / 空单元格 / 损坏 zip）。
 *
 * zip 用 store(0) 方式写入；另有一条用例专门覆盖 deflate(8) 分支。
 */

describe('readXlsx', () => {
  it('读共享字符串 / 数字 / 日期序列号，并按 r 属性落位', () => {
    const buf = makeWorkbook({
      shared: ['交易类型', '支出', '餐饮'],
      sheets: [
        {
          name: '支出',
          file: 'worksheets/sheet1.xml',
          body:
            row(
              1,
              '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>',
            ) +
            // G 列是日期样式（s=1 → numFmtId 14），值为 Excel 序列号
            row(
              2,
              '<c r="A2" t="s"><v>1</v></c><c r="G2" s="1"><v>46265.5</v></c><c r="H2"><v>52.7</v></c>',
            ),
        },
      ],
    });

    const wb = readXlsx(buf);
    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0].name).toBe('支出');
    const rows = wb.sheets[0].rows;
    expect(rows[0]).toEqual(['交易类型', '支出', '餐饮']);
    // 稀疏列补 null：A 之后到 F 都是 null
    expect(rows[1][0]).toBe('支出');
    expect(rows[1].slice(1, 6)).toEqual([null, null, null, null, null]);
    // 日期序列号按样式转成日期时间文本
    expect(String(rows[1][6])).toMatch(/^\d{4}-\d{2}-\d{2} 12:00:00$/);
    // 数字保持数字类型（便于上层 toFixed）
    expect(rows[1][7]).toBe(52.7);
  });

  it('无样式索引的数字保持数字（不会被误判成日期）', () => {
    const buf = makeWorkbook({
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(1, '<c r="A1"><v>128</v></c>'),
        },
      ],
    });
    expect(readXlsx(buf).sheets[0].rows[0][0]).toBe(128);
  });

  it('支持 inlineStr 与富文本多段拼接', () => {
    const buf = makeWorkbook({
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(
            1,
            '<c r="A1" t="inlineStr"><is><t>内联</t></is></c>' +
              '<c r="B1" t="inlineStr"><is><r><t>早</t></r><r><t>午餐</t></r></is></c>',
          ),
        },
      ],
    });
    const rows = readXlsx(buf).sheets[0].rows;
    expect(rows[0][0]).toBe('内联');
    expect(rows[0][1]).toBe('早午餐');
  });

  it('共享串里的富文本同样拼接，并剥离注音块', () => {
    const buf = buildZip({
      'xl/workbook.xml':
        '<?xml version="1.0"?><workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<?xml version="1.0"?><sst>' +
        '<si><r><t>食品</t></r><r><t>酒水</t></r><rPh sb="0" eb="2"><t>shipin</t></rPh></si>' +
        '</sst>',
      'xl/worksheets/sheet1.xml':
        '<?xml version="1.0"?><worksheet><sheetData>' +
        row(1, '<c r="A1" t="s"><v>0</v></c>') +
        '</sheetData></worksheet>',
    });
    expect(readXlsx(buf).sheets[0].rows[0][0]).toBe('食品酒水');
  });

  it('没有 sharedStrings.xml 也能读（全内联串的工作簿）', () => {
    const buf = makeWorkbook({
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(1, '<c r="A1" t="inlineStr"><is><t>甲</t></is></c>'),
        },
      ],
    });
    expect(readXlsx(buf).sheets[0].rows[0][0]).toBe('甲');
  });

  it('deflate(8) 压缩的条目同样能解', () => {
    const buf = makeWorkbook({
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(1, '<c r="A1"><v>7</v></c>'),
        },
      ],
      method: 8,
    });
    expect(readXlsx(buf).sheets[0].rows[0][0]).toBe(7);
  });

  it('XML 实体与 Unicode 码点被正确解码', () => {
    const buf = makeWorkbook({
      shared: ['a&amp;b', '&#x1F9E6;', '&lt;tag&gt;'],
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(
            1,
            '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c>',
          ),
        },
      ],
    });
    expect(readXlsx(buf).sheets[0].rows[0]).toEqual(['a&b', '🧦', '<tag>']);
  });

  it('空行补成空数组，不产生 undefined 行', () => {
    const buf = makeWorkbook({
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(1, '<c r="A1"><v>1</v></c>') + row(3, '<c r="A3"><v>3</v></c>'),
        },
      ],
    });
    const rows = readXlsx(buf).sheets[0].rows;
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([]);
    expect(rows[2][0]).toBe(3);
  });

  it('多个工作表按 workbook 声明顺序返回', () => {
    const buf = makeWorkbook({
      sheets: [
        {
          name: '支出',
          file: 'worksheets/sheet1.xml',
          body: row(1, '<c r="A1"><v>1</v></c>'),
        },
        {
          name: '收入',
          file: 'worksheets/sheet2.xml',
          body: row(1, '<c r="A1"><v>2</v></c>'),
        },
      ],
    });
    expect(readXlsx(buf).sheets.map((s) => s.name)).toEqual(['支出', '收入']);
  });

  it('不是 zip / .xls 旧格式：抛可读错误', () => {
    expect(() => readXlsx(Buffer.from('not a zip at all'))).toThrow(XlsxParseError);
    // BIFF 的 .xls 头（D0 CF 11 E0）
    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => readXlsx(xls)).toThrow(/\.xls/);
  });

  it('zip 结构损坏（本地头签名不对）：抛可读错误', () => {
    const good = makeWorkbook({
      sheets: [
        {
          name: 'S',
          file: 'worksheets/sheet1.xml',
          body: row(1, '<c r="A1"><v>1</v></c>'),
        },
      ],
    });
    // 改坏第一个本地头的签名，中央目录仍然完好
    const broken = Buffer.from(good);
    broken.writeUInt32LE(0xdeadbeef, 0);
    expect(() => readXlsx(broken)).toThrow(XlsxParseError);
  });

  it('空文件：抛可读错误', () => {
    expect(() => readXlsx(Buffer.alloc(0))).toThrow(/空/);
  });

  it('体积上限是 2MB（供上层做前置校验）', () => {
    expect(MAX_XLSX_BYTES).toBe(2 * 1024 * 1024);
  });
});
