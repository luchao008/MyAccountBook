import { createApp, close } from '@midwayjs/mock';
import { IMidwayApplication } from '@midwayjs/core';
import {
  TransactionImportService,
  type ImportRowReport,
} from '../src/transaction/transaction-import.service';
import { TransactionService } from '../src/transaction/transaction.service';
import { CategoryService } from '../src/category/category.service';
import { AuthService } from '../src/auth/auth.service';
import { AccountService } from '../src/account/account.service';
import { ErrorCode } from '../src/common/error-code';
import { cleanupUsers, closeTestDataSource, expectBusinessError, randomUsername } from './helper';
import { makeLedgerSheet, makeWorkbook, type SheetSpec } from './xlsx-fixture';

/**
 * 流水导入 service 单测。
 *
 * 直连真实 MariaDB（与项目其他 service 单测一致）：
 * 分类匹配、账本隔离、去重都依赖真实数据，mock 测不到。
 *
 * ⚠️ 绝不在「有真实数据的账本」上跑导入 —— 每个用例都用随机新用户，
 *    其默认账本由注册流程自动创建（空账本，无任何流水）。
 *
 * ⚠️ **两个入口的语义差别（2026-09-17 方案 B）**：
 *   · `preview()` 只回传**需要关注的行**（分类降级 / 疑似重复 / 无法导入），
 *     正常行（status=ok）不回传 —— 真实账单里它们占 99%。
 *   · `commit()` **收文件、重新解析**，不再接收前端回传的行。
 *
 * 于是「正常行长什么样」这类断言不能再走 `preview()`。
 * 下面的 `analyzeOf()` 直接调私有的 `analyze()` 拿到**全部行**，
 * 它是预览与提交共用的那份解析结果 —— 这是有意的：断言要落在事实源上，
 * 而不是落在「为省流量裁剪过的视图」上。
 */

/** 把内存里造的工作簿转成接口入参形态（filename + base64） */
function fileOf(
  sheets: { shared: string[]; sheet: SheetSpec }[],
  filename = '随手记默认账本.xlsx',
) {
  const buf = makeWorkbook({ shared: sheets[0]?.shared ?? [], sheets: sheets.map((s) => s.sheet) });
  return { filename, contentBase64: buf.toString('base64'), buf };
}

describe('TransactionImportService', () => {
  let app: IMidwayApplication;
  let importService: TransactionImportService;
  let transactionService: TransactionService;
  let categoryService: CategoryService;
  let authService: AuthService;
  let accountService: AccountService;

  const createdUserIds: string[] = [];

  /** 建一个全新用户，返回它的默认账本 id */
  async function newUser(): Promise<{ userId: string; accountId: string }> {
    const res = await authService.register({
      username: randomUsername('imp'),
      password: '123456',
    });
    createdUserIds.push(res.user.id);
    const accounts = await accountService.list(res.user.id);
    return { userId: res.user.id, accountId: accounts.find((a) => a.isDefault)!.id };
  }

  /** 在指定账本下建一级 + 二级分类（分类为账本级隔离，必须带 accountId） */
  async function mkCategory(
    userId: string,
    accountId: string,
    name: string,
    type: 'income' | 'expense',
    parentId?: string,
  ) {
    return categoryService.create(userId, { accountId, name, type, parentId } as any);
  }

  /**
   * 拿**全部行**（含正常行）。
   *
   * 走私有方法是有意的：`preview()` 的 `rows` 是「为省流量裁剪过的视图」，
   * 拿它断言「正常行解析对不对」等于让被测对象决定测试能看到什么。
   */
  async function analyzeOf(
    userId: string,
    dto: Record<string, unknown>,
  ): Promise<ImportRowReport[]> {
    const res = await (importService as any).analyze(userId, dto);
    return res.rows as ImportRowReport[];
  }

  beforeAll(async () => {
    app = await createApp(process.cwd());
    const ctx = app.getApplicationContext();
    importService = await ctx.getAsync(TransactionImportService);
    transactionService = await ctx.getAsync(TransactionService);
    categoryService = await ctx.getAsync(CategoryService);
    authService = await ctx.getAsync(AuthService);
    accountService = await ctx.getAsync(AccountService);
  });

  afterAll(async () => {
    await cleanupUsers(createdUserIds);
    await close(app);
    await closeTestDataSource();
  });

  describe('preview · 解析与字段校验', () => {
    it('正常文件：汇总计数正确，行字段落到预期值（时刻的秒被丢弃）', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await mkCategory(userId, accountId, '早午晚餐', 'expense', food.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 52.7,
          note: '午饭',
        },
        {
          type: '支出',
          date: '2026-09-13 12:46:53',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 105.85,
        },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      const res = await importService.preview(userId, file as any);
      expect(res.summary.total).toBe(2);
      expect(res.summary.valid).toBe(2);
      expect(res.summary.invalid).toBe(0);
      expect(res.summary.unmatched).toBe(0);
      expect(res.summary.importable).toBe(2);
      expect(res.accountId).toBe(accountId);
      expect(res.sheets).toEqual([{ name: '支出', total: 2, valid: 2, invalid: 0 }]);

      // ★ 两行都正常 → **一行都不回传**（预览只列需要关注的记录）
      expect(res.abnormal).toBe(0);
      expect(res.rows).toEqual([]);
      expect(res.rowsTruncated).toBe(false);

      const rows = await analyzeOf(userId, file);
      const r0 = rows[0];
      expect(r0.type).toBe('expense');
      expect(r0.amount).toBe('52.70');
      expect(r0.recordDate).toBe('2026-09-14');
      // 秒被丢弃：项目 TIME_PATTERN 只到分钟
      expect(r0.recordTime).toBe('18:03');
      expect(r0.categoryName).toBe('早午晚餐');
      expect(r0.status).toBe('ok');
      expect(r0.willImport).toBe(true);
    });

    it('分类值带尾部空格仍能精确命中（真实附件就是这个形态）', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await mkCategory(userId, accountId, '早午晚餐', 'expense', food.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐  ',
          amount: 10,
        },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };
      const rows = await analyzeOf(userId, file);
      expect(rows[0].status).toBe('ok');
      expect(rows[0].categoryName).toBe('早午晚餐');

      // 正常行 → 预览里看不到
      const res = await importService.preview(userId, file as any);
      expect(res.rows).toEqual([]);
      expect(res.abnormal).toBe(0);
    });

    it('二级分类不存在 → 挂到一级，标记 unmatched 并给出原因', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '不存在的二级',
          amount: 10,
        },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(res.abnormal).toBe(1);
      const row = res.rows[0];
      expect(row.status).toBe('unmatched');
      expect(row.categoryName).toBe('食品酒水');
      expect(row.categoryId).toBeTruthy();
      expect(row.messages.join()).toContain('不存在的二级');
      // 降级仍可导入
      expect(row.willImport).toBe(true);
      expect(res.summary.unmatched).toBe(1);
    });

    it('一级分类不存在 → 记为未分类，不自动创建分类', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '不存在的分类',
          l2: '也不存在',
          amount: 10,
        },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      const row = res.rows[0];
      expect(row.categoryId).toBeNull();
      expect(row.status).toBe('unmatched');
      expect(row.messages.join()).toContain('不存在');

      // ★ 不自动创建分类：账本内分类数不变
      const all = await categoryService.list(userId, { accountId } as any);
      expect(all.map((c) => c.name)).toEqual(['食品酒水']);
    });

    it('一级分类存在但收支类型不符 → 记为未分类（不误挂收入分类）', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '职业收入', 'income');

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '职业收入', l2: '', amount: 10 },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(res.rows[0].categoryId).toBeNull();
      expect(res.rows[0].status).toBe('unmatched');
    });

    it('宽松回退：仅空白 / 全角差异也能命中，并标注为宽松匹配', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品 酒水',
          l2: '',
          amount: 10,
        },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      const row = res.rows[0];
      expect(row.categoryName).toBe('食品酒水');
      expect(row.status).toBe('unmatched');
      expect(row.messages.join()).toContain('宽松匹配');
    });

    it('金额 ≤ 0 / 日期无法识别 → invalid，且不影响同文件其他行', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      // 给正常那行配一个真实存在的二级分类，它才是真正的 ok；
      // 否则「一级存在但没填二级」本身就会走降级（unmatched），混进异常里
      await mkCategory(userId, accountId, '早午晚餐', 'expense', food.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 10,
        },
        // 金额 0：xlsx 里是真数字 0，DTO 层正则也是拦 0
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 0,
        },
        { type: '支出', date: '不是日期', l1: '食品酒水', l2: '早午晚餐', amount: 12 },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(res.summary.total).toBe(3);
      expect(res.summary.invalid).toBe(2);
      expect(res.summary.unmatched).toBe(0);
      expect(res.summary.importable).toBe(1);
      // 正常那行不回传，所以预览里只剩两条 invalid
      expect(res.abnormal).toBe(2);
      expect(res.rows.map((r) => r.status)).toEqual(['invalid', 'invalid']);
      expect(res.rows[0].willImport).toBe(false);
    });

    it('没填二级分类 → 挂到一级并标记 unmatched（不算 invalid，仍可导入）', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 10 },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(res.summary.unmatched).toBe(1);
      expect(res.summary.invalid).toBe(0);
      expect(res.rows[0].status).toBe('unmatched');
      expect(res.rows[0].willImport).toBe(true);
    });

    it('金额超过两位小数：四舍五入并给警告，**不算 invalid**', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await mkCategory(userId, accountId, '早午晚餐', 'expense', food.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 12.345,
        },
      ]);
      const rows = await analyzeOf(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      });
      expect(rows[0].amount).toBe('12.35');
      expect(rows[0].status).toBe('ok');
      expect(rows[0].messages.join()).toContain('四舍五入');
    });

    it('备注超 255 字：截断并给警告', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');
      const longNote = 'x'.repeat(300);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '',
          amount: 10,
          note: longNote,
        },
      ]);
      const rows = await analyzeOf(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      });
      expect(rows[0].note.length).toBe(255);
      expect(rows[0].messages.join()).toContain('截断');
    });

    it('两个工作表（支出 / 收入）都被读到，类型分别正确', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');
      await mkCategory(userId, accountId, '职业收入', 'income');

      // 两张表共用同一个共享串表（整个工作簿只有一份 sharedStrings.xml）
      const shared: string[] = [];
      const exp = makeLedgerSheet(
        '支出',
        [{ type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 10 }],
        shared,
      );
      const inc = makeLedgerSheet(
        '收入',
        [{ type: '收入', date: '2026-09-10 16:16:38', l1: '职业收入', l2: '', amount: 11756.33 }],
        shared,
      );
      const buf = makeWorkbook({ shared, sheets: [exp.sheet, inc.sheet] });
      const file = { filename: 'x.xlsx', contentBase64: buf.toString('base64'), accountId };

      const res = await importService.preview(userId, file as any);
      expect(res.sheets.map((s) => s.name)).toEqual(['支出', '收入']);
      expect(res.summary.total).toBe(2);

      const rows = await analyzeOf(userId, file);
      expect(rows[0].type).toBe('expense');
      expect(rows[1].type).toBe('income');
    });
  });

  describe('preview · 去重', () => {
    it('与库内已有流水指纹相同 → duplicate，默认跳过', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');

      // 库里先有一笔：同类型 / 同金额 / 同日期 / 同分类 / 同备注
      await transactionService.create(userId, {
        type: 'expense',
        amount: '52.70',
        categoryId: food.id,
        recordDate: '2026-09-14',
        recordTime: '18:03',
        note: '',
        accountId,
      });

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '',
          amount: 52.7,
        },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(res.rows[0].status).toBe('duplicate');
      expect(res.rows[0].willImport).toBe(false);
      expect(res.summary.duplicate).toBe(1);
      expect(res.summary.skipped).toBe(1);
      expect(res.summary.importable).toBe(0);
    });

    it('skipDuplicates=false 时重复行也标记为「将导入」', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await transactionService.create(userId, {
        type: 'expense',
        amount: '52.70',
        categoryId: food.id,
        recordDate: '2026-09-14',
        recordTime: '18:03',
        note: '',
        accountId,
      });

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 52.7 },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
        skipDuplicates: false,
      } as any);

      expect(res.rows[0].status).toBe('duplicate');
      expect(res.rows[0].willImport).toBe(true);
      expect(res.summary.importable).toBe(1);
      expect(res.summary.skipped).toBe(0);
    });

    it('文件内部重复：只保留第一条为可导入', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await mkCategory(userId, accountId, '早午晚餐', 'expense', food.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 30,
        },
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 30,
        },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      // 正常行不回传，所以预览里只有那条重复
      const res = await importService.preview(userId, file as any);
      expect(res.abnormal).toBe(1);
      expect(res.rows[0].status).toBe('duplicate');
      expect(res.summary.importable).toBe(1);

      const rows = await analyzeOf(userId, file);
      expect(rows[0].status).toBe('ok');
      expect(rows[1].status).toBe('duplicate');
    });

    it('★ 时刻参与指纹：同金额同备注但时刻不同 → 不算重复', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 08:00:00', l1: '食品酒水', l2: '', amount: 30 },
        { type: '支出', date: '2026-09-14 20:00:00', l1: '食品酒水', l2: '', amount: 30 },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(res.summary.duplicate).toBe(0);
      expect(res.summary.importable).toBe(2);
    });

    it('去重只在本账本内生效：另一个账本的相同流水不算重复', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await transactionService.create(userId, {
        type: 'expense',
        amount: '30.00',
        categoryId: food.id,
        recordDate: '2026-09-14',
        accountId,
      });

      // 新建第二个账本（非默认），它没有那笔流水
      const other = await accountService.create(userId, { name: '旅行账本' } as any);

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 00:00:00', l1: '食品酒水', l2: '', amount: 30 },
      ]);
      const res = await importService.preview(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId: other.id,
      } as any);

      // 该账本里没有「食品酒水」分类 → 分类降级；但重复判定不该命中
      expect(res.summary.duplicate).toBe(0);
    });
  });

  describe('preview · 错误处理', () => {
    it('缺必要列 → 40009，且文案列出缺失的列名', async () => {
      const { userId, accountId } = await newUser();
      const buf = makeWorkbook({
        shared: ['日期', '金额'],
        sheets: [
          {
            name: '支出',
            file: 'worksheets/sheet1.xml',
            body:
              '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
              '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2"><v>1</v></c></row>',
          },
        ],
      });
      await expectBusinessError(
        () =>
          importService.preview(userId, {
            filename: 'bad.xlsx',
            contentBase64: buf.toString('base64'),
            accountId,
          } as any),
        ErrorCode.IMPORT_HEADER_MISSING,
      );
    });

    it('不是 xlsx（base64 合法但内容不是 zip）→ 40007', async () => {
      const { userId, accountId } = await newUser();
      const buf = Buffer.from('这不是一个 xlsx 文件', 'utf8');
      await expectBusinessError(
        () =>
          importService.preview(userId, {
            filename: 'fake.xlsx',
            contentBase64: buf.toString('base64'),
            accountId,
          } as any),
        ErrorCode.IMPORT_FILE_INVALID,
      );
    });

    it('base64 非法 → 40007', async () => {
      const { userId, accountId } = await newUser();
      await expectBusinessError(
        () =>
          importService.preview(userId, {
            filename: 'x.xlsx',
            contentBase64: '!!!not base64!!!',
            accountId,
          } as any),
        ErrorCode.IMPORT_FILE_INVALID,
      );
    });

    it('文件超过 2MB 上限 → 40008', async () => {
      const { userId, accountId } = await newUser();
      const big = Buffer.alloc(2 * 1024 * 1024 + 1024, 1);
      await expectBusinessError(
        () =>
          importService.preview(userId, {
            filename: 'big.xlsx',
            contentBase64: big.toString('base64'),
            accountId,
          } as any),
        ErrorCode.IMPORT_FILE_TOO_LARGE,
      );
    });

    it('文件里没有一条可导入的行 → 40010', async () => {
      const { userId, accountId } = await newUser();
      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '坏日期', l1: '食品酒水', l2: '', amount: 10 },
      ]);
      await expectBusinessError(
        () =>
          importService.preview(userId, {
            ...fileOf([{ shared, sheet }]),
            accountId,
          } as any),
        ErrorCode.IMPORT_NO_VALID_ROWS,
      );
    });

    it('账本不属于当前用户 → 40403', async () => {
      const a = await newUser();
      const b = await newUser();
      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 10 },
      ]);
      await expectBusinessError(
        () =>
          importService.preview(a.userId, {
            ...fileOf([{ shared, sheet }]),
            accountId: b.accountId,
          } as any),
        ErrorCode.ACCOUNT_NOT_FOUND,
      );
    });

    it('提交时文件不合法同样拒绝（commit 也走 analyze）', async () => {
      const { userId, accountId } = await newUser();
      await expectBusinessError(
        () =>
          importService.commit(userId, {
            filename: 'fake.xlsx',
            contentBase64: Buffer.from('不是 xlsx').toString('base64'),
            accountId,
          } as any),
        ErrorCode.IMPORT_FILE_INVALID,
      );
    });
  });

  describe('commit · 落库', () => {
    it('把文件写入账本，字段与预览一致（含时刻）', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');
      await mkCategory(userId, accountId, '早午晚餐', 'expense', food.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        {
          type: '支出',
          date: '2026-09-14 18:03:50',
          l1: '食品酒水',
          l2: '早午晚餐',
          amount: 52.7,
          note: '午饭',
        },
        { type: '支出', date: '2026-09-13 12:00:00', l1: '食品酒水', l2: '', amount: 20 },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      await importService.preview(userId, file as any);
      const result = await importService.commit(userId, { ...file, skipDuplicates: true } as any);

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);

      const page = await transactionService.page(userId, { accountId, page: 1, size: 50 } as any);
      expect(page.total).toBe(2);
      const withTime = page.list.find((t) => t.recordTime);
      expect(withTime!.recordTime).toBe('18:03:00');
      expect(withTime!.amount).toBe('52.70');
      expect(withTime!.note).toBe('午饭');
      expect(withTime!.category?.name).toBe('早午晚餐');
      expect(withTime!.accountId).toBe(accountId);
    });

    it('★ 超过旧上限（2000 行）也能全部导入 —— 方案 B 的核心修复', async () => {
      /*
       * 背景：早先「预览回传全部行 → 提交照单落库」时，预览为控制响应体
       * 只回传前 2000 行，于是**一份 3000 行的账单只能导入 2000 条**，
       * 而汇总卡和按钮还都显示 3000 —— 用户以为全导进去了。
       *
       * 现在提交重新解析文件，行数只受文件体积（2MB）约束。
       * 这个用例就是钉住那个天花板的：任何一天再有人引入按行数截断，它立刻红。
       */
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const COUNT = 2100;
      const rows = Array.from({ length: COUNT }, (_, i) => ({
        type: '支出' as const,
        // 逐行不同的日期/金额，避免撞上文件内去重
        date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')} 12:00:00`,
        l1: '食品酒水',
        l2: '',
        amount: String(i + 1) + '.00',
      }));
      const { shared, sheet } = makeLedgerSheet('支出', rows);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      const res = await importService.preview(userId, file as any);
      expect(res.summary.total).toBe(COUNT);
      expect(res.summary.importable).toBe(COUNT);

      const result = await importService.commit(userId, { ...file, skipDuplicates: true } as any);
      expect(result.imported).toBe(COUNT);

      const page = await transactionService.page(userId, { accountId, page: 1, size: 1 } as any);
      expect(page.total).toBe(COUNT);
    });

    it('分类在预览后被删除 → 该行降级为未分类，其余照常写入', async () => {
      /*
       * 必须在**非默认账本**里做：默认账本是分类母本，其分类受 D16 保护不允许删除
       * （`CategoryService.delete` 直接抛 40006）。
       * 新建账本会从母本复制全套分类，所以这里先把母本的分类建好，再建第二个账本。
       */
      const { userId, accountId: defaultId } = await newUser();
      const food = await mkCategory(userId, defaultId, '食品酒水', 'expense');
      await mkCategory(userId, defaultId, '早午晚餐', 'expense', food.id);
      const second = await accountService.create(userId, { name: '第二账本' } as any);
      const accountId = second.id;
      /*
       * 被删的那个分类要有**二级**：两行都必须先精确命中（status=ok），
       * 删掉之后才谈得上「降级」—— 否则「一级存在但没填二级」本身就是 unmatched，
       * 计数里会混进一条与本次改动无关的降级（这个坑真的踩到了）。
       */
      const temp = await mkCategory(userId, accountId, '临时分类', 'expense');
      await mkCategory(userId, accountId, '临时二级', 'expense', temp.id);

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '临时分类', l2: '临时二级', amount: 10 },
        { type: '支出', date: '2026-09-15 09:00:00', l1: '食品酒水', l2: '早午晚餐', amount: 20 },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      await importService.preview(userId, file as any);
      // 预览与提交之间把分类删掉（无交易 → 允许删）
      await categoryService.delete(userId, accountId, temp.id);

      const result = await importService.commit(userId, { ...file, skipDuplicates: true } as any);

      // 两行都写进去了；被删分类的那行降级为「未分类」，计入 unmatched（**不是 failed**）
      expect(result.imported).toBe(2);
      expect(result.unmatched).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.failures.some((f) => f.message.includes('临时分类'))).toBe(true);

      const page = await transactionService.page(userId, { accountId, page: 1, size: 50 } as any);
      const orphan = page.list.find((t) => t.amount === '10.00');
      expect(orphan!.categoryId == null).toBe(true);
    });

    it('提交时对库内已存在的流水再去重一次（skipDuplicates=true）', async () => {
      const { userId, accountId } = await newUser();
      const food = await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 30 },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };
      const preview = await importService.preview(userId, file as any);
      expect(preview.summary.importable).toBe(1);

      // 提交前，库里出现了同一笔（例如用户在另一个标签页记了账）
      await transactionService.create(userId, {
        type: 'expense',
        amount: '30.00',
        categoryId: food.id,
        recordDate: '2026-09-14',
        recordTime: '18:03',
        accountId,
      });

      const result = await importService.commit(userId, { ...file, skipDuplicates: true } as any);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('★ 重复提交同一份文件：第二次全部被跳过（幂等）', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 30 },
        { type: '支出', date: '2026-09-15 19:03:50', l1: '食品酒水', l2: '', amount: 40 },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      const first = await importService.commit(userId, { ...file, skipDuplicates: true } as any);
      expect(first.imported).toBe(2);

      const second = await importService.commit(userId, { ...file, skipDuplicates: true } as any);
      expect(second.imported).toBe(0);
      expect(second.skipped).toBe(2);

      const page = await transactionService.page(userId, { accountId, page: 1, size: 50 } as any);
      expect(page.total).toBe(2);
    });

    it('skipDuplicates=false 时重复的也照写', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');

      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 30 },
      ]);
      const file = { ...fileOf([{ shared, sheet }]), accountId };

      await importService.commit(userId, { ...file, skipDuplicates: true } as any);
      const again = await importService.commit(userId, { ...file, skipDuplicates: false } as any);
      expect(again.imported).toBe(1);
      expect(again.skipped).toBe(0);

      const page = await transactionService.page(userId, { accountId, page: 1, size: 50 } as any);
      expect(page.total).toBe(2);
    });

    it('字段不合法的行被拒绝，且不写库', async () => {
      const { userId, accountId } = await newUser();
      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '坏日期', l1: '食品酒水', l2: '', amount: 10 },
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 0 },
      ]);
      const result = await importService.commit(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(2);
      const page = await transactionService.page(userId, { accountId, page: 1, size: 50 } as any);
      expect(page.total).toBe(0);
    });

    it('导入的流水是「未删除」状态，不出现在回收站', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');
      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 30 },
      ]);
      await importService.commit(userId, {
        ...fileOf([{ shared, sheet }]),
        accountId,
      } as any);

      const deleted = await transactionService.listDeleted(userId);
      expect(deleted.length).toBe(0);
    });

    it('不传 accountId → 落到默认账本', async () => {
      const { userId, accountId } = await newUser();
      await mkCategory(userId, accountId, '食品酒水', 'expense');
      const { shared, sheet } = makeLedgerSheet('支出', [
        { type: '支出', date: '2026-09-14 18:03:50', l1: '食品酒水', l2: '', amount: 30 },
      ]);
      const result = await importService.commit(userId, {
        ...fileOf([{ shared, sheet }]),
      } as any);
      expect(result.imported).toBe(1);
      expect(result.accountId).toBe(accountId);
    });
  });
});
