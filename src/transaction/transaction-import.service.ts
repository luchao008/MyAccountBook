import { Provide, Inject } from '@midwayjs/core';
import { InjectDataSource } from '@midwayjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from '../entity/transaction.entity';
import { Category } from '../entity/category.entity';
import { Account } from '../entity/account.entity';
import { BusinessError } from '../common/business.error';
import { ErrorCode } from '../common/error-code';
import { AccountService } from '../account/account.service';
import { MAX_XLSX_BYTES, readXlsx, XlsxParseError } from './xlsx-reader';
import { ImportPreviewDTO, ImportCommitDTO } from './dto/transaction-import.dto';

/** 单行的处理结论 */
export type ImportRowStatus =
  /** 全部字段有效、分类精确命中 */
  | 'ok'
  /** 与库内（或文件内）已有流水指纹相同 */
  | 'duplicate'
  /** 可导入，但分类只能降级（挂到一级 / 宽松匹配 / 记为未分类） */
  | 'unmatched'
  /** 字段本身不合法，无法导入 */
  | 'invalid';

export interface ImportRowReport {
  rowNo: number;
  sheet: string;
  type: 'income' | 'expense' | null;
  amount: string | null;
  recordDate: string | null;
  /** HH:mm（秒已在导入时丢弃 —— 项目 DTO 只支持到分钟） */
  recordTime: string | null;
  note: string;
  /** 附件里的分类原文，形如「食品酒水 / 早午晚餐」 */
  categoryRaw: string;
  /** 解析后的分类 id；未匹配为 null */
  categoryId: string | null;
  categoryName: string | null;
  status: ImportRowStatus;
  /** 这一行最终是否会被写入（受 skipDuplicates 影响） */
  willImport: boolean;
  /** 降级 / 跳过 / 失败的原因，逐条可读 */
  messages: string[];
}

export interface ImportSummary {
  /** 文件里的数据行总数（不含表头） */
  total: number;
  /** 字段有效的行数（含重复与降级） */
  valid: number;
  /** 本次会被写入的行数 */
  importable: number;
  /** 因重复被跳过的行数 */
  skipped: number;
  duplicate: number;
  /** 分类未能精确命中的行数 */
  unmatched: number;
  invalid: number;
}

export interface ImportPreviewResult {
  filename: string;
  accountId: string;
  accountName: string;
  summary: ImportSummary;
  /** 按工作表拆分的小计 */
  sheets: { name: string; total: number; valid: number; invalid: number }[];
  /** 读不了的工作表（缺列等），不影响其他工作表 */
  sheetErrors: string[];
  /**
   * **只含需要关注的行**（分类降级 / 疑似重复 / 无法导入）。
   * 正常行（status=ok）不回传 —— 预览页的价值是「哪些要我处理」，
   * 而真实账单里正常行占 99%，全带上只会把异常淹掉、还白撑大响应体。
   */
  rows: ImportRowReport[];
  /** 需要关注的行总数（rows 可能因体积被截断，计数以此为准） */
  abnormal: number;
  /** rows 是否被截断（超大文件时只回传前 N 行，计数仍然准确） */
  rowsTruncated: boolean;
}

export interface ImportCommitResult {
  accountId: string;
  accountName: string;
  imported: number;
  /** 因重复被跳过的条数 */
  skipped: number;
  /** 字段不合法、无法导入的条数 */
  failed: number;
  /** 分类降级（挂到一级 / 记为未分类）的条数 —— **这些是导入成功的**，只是分类不精确 */
  unmatched: number;
  /** 降级 / 失败的明细（最多 200 条，避免报告本身过大） */
  failures: { rowNo: number; message: string }[];
}

/** 解析结果（预览与提交共用的中间产物） */
interface ImportAnalysis {
  account: Account;
  summary: ImportSummary;
  sheets: ImportPreviewResult['sheets'];
  sheetErrors: string[];
  /** 全部行（含正常行）—— 调用方各自决定怎么用 */
  rows: ImportRowReport[];
}

/** 需要关注的行状态（`ok` 不在其中） */
const ABNORMAL_STATUS: ImportRowStatus[] = ['unmatched', 'duplicate', 'invalid'];

/**
 * 预览响应里最多回传多少行**异常**明细。
 *
 * ⚠️ 这个数**只影响预览能看到几条明细，不影响能导入多少条** ——
 * 提交是拿文件重新解析的（2026-09-17 方案 B），上限只剩「文件 2MB」一条。
 */
const MAX_ABNORMAL_ROWS_RETURNED = 2000;
/** 落库时每批 insert 的行数 */
const INSERT_BATCH = 200;
/** 表头里必须存在的列 */
const REQUIRED_COLUMNS = ['交易类型', '日期', '金额', '一级分类'];

const AMOUNT_RE = /^\d+(\.\d+)?$/;

interface CategoryIndex {
  byId: Map<string, Category>;
  /** 一级分类：name → 实体 */
  rootByName: Map<string, Category>;
  /** 二级分类：`${parentId}|${name}` → 实体 */
  childByKey: Map<string, Category>;
  /** 宽松匹配（去空白 + 全角转半角）用的一级分类 */
  looseRoot: Map<string, Category>;
  looseChild: Map<string, Category>;
}

/** 逐行解析的中间产物：字段合法时才有 */
interface ParsedRow {
  rowNo: number;
  sheet: string;
  /** 解析不出来的行是 null（它们仍要出现在报告里，但不参与去重与落库） */
  type: 'income' | 'expense' | null;
  amount: string | null;
  recordDate: string | null;
  recordTime: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryRaw: string;
  note: string;
  messages: string[];
  /** 分类是否精确命中（未命中/降级 → unmatched） */
  categoryExact: boolean;
  /** 与已有流水指纹相同 */
  duplicate: boolean;
  /**
   * 字段本身不合法（类型/金额/日期），无法导入。
   *
   * 显式存一个布尔，而不是在 toReport 里靠 `messages` 的前缀去猜 ——
   * 「金额超过两位小数，已四舍五入」这类**警告**同样以「金额」开头，
   * 用前缀判会把它误判成无效行（曾写错，被单测抓住）。
   */
  invalid: boolean;
}

function pad2(n: string | number): string {
  return String(n).padStart(2, '0');
}

/** 去掉所有空白并把全角字符折成半角 —— 只用于「精确匹配失败后的宽松回退」 */
function normalizeLoose(s: string): string {
  return s
    .replace(/[\s\u3000]+/g, '')
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function cellText(raw: unknown): string {
  return raw === null || raw === undefined ? '' : String(raw).trim();
}

/** 日期列 → { date, time }；秒丢弃（项目 TIME_PATTERN 只到分钟） */
function parseDateTime(raw: unknown): { date: string; time: string | null } | null {
  const s = cellText(raw).replace(/\//g, '-');
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, hh, mi] = m;
  const date = `${y}-${pad2(mo)}-${pad2(d)}`;
  const probe = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  // 反查一次，拦掉 2026-02-31 这类「正则过得了、日历不存在」的日期
  if (probe.getUTCFullYear() !== Number(y) || probe.getUTCMonth() + 1 !== Number(mo)) return null;
  if (probe.getUTCDate() !== Number(d)) return null;
  if (hh === undefined) return { date, time: null };
  const H = Number(hh);
  const M = Number(mi);
  if (H > 23 || M > 59) return null;
  return { date, time: `${pad2(H)}:${pad2(M)}` };
}

/** 金额列 → 两位小数的字符串；≤0 / 非数字返回 null */
function parseAmount(raw: unknown): { amount: string; rounded: boolean } | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const text = String(raw);
    const frac = text.includes('.') ? text.split('.')[1].length : 0;
    return { amount: raw.toFixed(2), rounded: frac > 2 };
  }
  const s = cellText(raw).replace(/[,\s¥￥]/g, '');
  if (!s || !AMOUNT_RE.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const frac = s.includes('.') ? s.split('.')[1].length : 0;
  return { amount: n.toFixed(2), rounded: frac > 2 };
}

/** 收/支类型归一；认不出来返回 null */
function parseType(raw: unknown): 'income' | 'expense' | null {
  const s = cellText(raw);
  if (s === '支出' || s === 'expense') return 'expense';
  if (s === '收入' || s === 'income') return 'income';
  return null;
}

/** 去重指纹：与账本合并（account.service）的口径保持一致，多带一个时刻 */
function fingerprintOf(r: {
  type: string;
  amount: string;
  recordDate: string;
  recordTime: string | null;
  categoryId: string | null;
  note: string;
}): string {
  return [r.type, r.amount, r.recordDate, r.recordTime ?? '', r.categoryId ?? '', r.note].join('|');
}

/** DB 的 time 列返回 HH:mm:ss，与文件侧的 HH:mm 对齐 */
function timeToMinute(t: string | null | undefined): string | null {
  if (!t) return null;
  return String(t).slice(0, 5);
}

@Provide()
export class TransactionImportService {
  @InjectDataSource()
  dataSource: DataSource;

  @Inject()
  accountService: AccountService;

  private get repo(): Repository<Transaction> {
    return this.dataSource.getRepository(Transaction);
  }

  private get categoryRepo(): Repository<Category> {
    return this.dataSource.getRepository(Category);
  }

  /* ============================================================
   * 一、解析（预览与提交**共用同一份**）
   * ============================================================ */

  /**
   * 解析文件 → 逐行报告 + 汇总。**不写库**。
   *
   * ⚠️ 预览与提交都走这里（2026-09-17 方案 B 重构）。此前提交用的是
   * 「前端回传预览时那批 rows」，于是：
   *   ① 预览为控制响应体只回传前 2000 行 → **超过 2000 行的账单只能导入 2000 条**；
   *   ② 预览与提交的口径可能分叉（前者截断、后者照单全收）。
   * 现在提交重新解析同一个文件，行数上限只剩「文件体积 2MB」一条（约 3 万行），
   * 且两者天然同口径 —— 本来它们就该是同一次解析的两种用法。
   */
  private async analyze(
    userId: string,
    dto: { contentBase64: string; accountId?: string; skipDuplicates?: boolean },
  ): Promise<ImportAnalysis> {
    const account = await this.resolveAccount(userId, dto.accountId);
    const buf = this.decodeBase64(dto.contentBase64);
    const index = await this.buildCategoryIndex(account.id);

    let workbook: { sheets: { name: string; rows: (string | number | null)[][] }[] };
    try {
      workbook = readXlsx(buf);
    } catch (err) {
      if (err instanceof XlsxParseError) {
        throw new BusinessError(
          `文件无法解析：${err.message}。请确认是从随手记导出的 .xlsx（不支持 .xls 与加密文件）`,
          ErrorCode.IMPORT_FILE_INVALID,
        );
      }
      throw err;
    }

    const sheetErrors: string[] = [];
    const sheets: ImportPreviewResult['sheets'] = [];
    const parsed: ParsedRow[] = [];
    let headerSeen = false;
    const missingUnion = new Set<string>();

    for (const sheet of workbook.sheets) {
      const headerMap = this.buildHeaderMap(sheet.rows[0] ?? []);
      const missing = REQUIRED_COLUMNS.filter((c) => !headerMap.has(c));
      if (missing.length) {
        missing.forEach((c) => missingUnion.add(c));
        sheetErrors.push(`工作表「${sheet.name}」缺少必要列：${missing.join('、')}`);
        sheets.push({ name: sheet.name, total: 0, valid: 0, invalid: 0 });
        continue;
      }
      headerSeen = true;

      let total = 0;
      let valid = 0;
      let invalid = 0;
      for (let i = 1; i < sheet.rows.length; i++) {
        const raw = sheet.rows[i];
        if (!raw || raw.every((c) => c === null || cellText(c) === '')) continue; // 整行空
        total += 1;
        const row = this.parseRow(raw, headerMap, i + 1, sheet.name, index);
        if (row) {
          parsed.push(row);
          valid += 1;
        } else {
          invalid += 1;
          parsed.push(this.invalidRow(raw, headerMap, i + 1, sheet.name));
        }
      }
      sheets.push({ name: sheet.name, total, valid, invalid });
    }

    if (!headerSeen) {
      throw new BusinessError(
        `文件里没有可识别的工作表，缺少必要列：${[...missingUnion].join('、')}。` +
          '请确认表头与随手记导出一致（交易类型 / 日期 / 一级分类 / 金额）',
        ErrorCode.IMPORT_HEADER_MISSING,
      );
    }

    // 与库内已有流水比对（只取文件日期区间，等价但便宜得多 —— 指纹含日期）
    const dates = parsed.map((r) => r.recordDate).filter(Boolean) as string[];
    const existing = await this.loadExistingFingerprints(
      account.id,
      dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null,
      dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    );

    const inFile = new Set<string>();
    const skipDuplicates = dto.skipDuplicates !== false;
    for (const row of parsed) {
      if (row.amount === null || row.recordDate === null || row.type === null) continue;
      const fp = fingerprintOf(row);
      if (existing.has(fp) || inFile.has(fp)) row.duplicate = true;
      inFile.add(fp);
    }

    const rows = parsed.map((row) => this.toReport(row, skipDuplicates));
    const duplicate = rows.filter((r) => r.status === 'duplicate').length;
    const invalid = rows.filter((r) => r.status === 'invalid').length;
    const unmatched = rows.filter((r) => r.status === 'unmatched').length;
    const summary: ImportSummary = {
      total: rows.length,
      valid: rows.length - invalid,
      importable: rows.filter((r) => r.willImport).length,
      skipped: rows.filter((r) => r.status === 'duplicate' && !r.willImport).length,
      duplicate,
      unmatched,
      invalid,
    };

    return { account, summary, sheets, sheetErrors, rows };
  }

  /* ============================================================
   * 二、预览
   * ============================================================ */

  async preview(userId: string, dto: ImportPreviewDTO): Promise<ImportPreviewResult> {
    const { account, summary, sheets, sheetErrors, rows } = await this.analyze(userId, dto);

    if (summary.valid === 0) {
      throw new BusinessError(
        '文件里没有一条可导入的流水，请检查文件内容是否与随手记导出格式一致',
        ErrorCode.IMPORT_NO_VALID_ROWS,
      );
    }

    // 只回传需要关注的行；正常行占绝大多数，带上它们既淹异常又撑大响应体
    const abnormalRows = rows.filter((r) => ABNORMAL_STATUS.indexOf(r.status) >= 0);

    return {
      filename: dto.filename,
      accountId: account.id,
      accountName: account.name,
      summary,
      sheets,
      sheetErrors,
      rows: abnormalRows.slice(0, MAX_ABNORMAL_ROWS_RETURNED),
      abnormal: abnormalRows.length,
      rowsTruncated: abnormalRows.length > MAX_ABNORMAL_ROWS_RETURNED,
    };
  }

  /* ============================================================
   * 三、提交
   * ============================================================ */

  /**
   * 落库。**重新解析文件**（方案 B），不接收前端回传的行。
   *
   * 这样做的收益：
   *   ① 行数上限只剩「文件 2MB」（约 3 万行），不再有「一次只能导 2000 条」的隐性天花板；
   *   ② 预览与提交是同一份 `analyze()` 的输出，口径不可能分叉；
   *   ③ 请求体小 —— 提交只带文件（几十 KB），不带几万行 JSON。
   *
   * 顺带把「预览到提交之间分类被改」这件事天然处理掉了：这次解析拿的是**当前**分类树，
   * 失效分类会走 `matchCategory` 的降级路径（挂一级 / 未分类），并计入 unmatched。
   */
  async commit(userId: string, dto: ImportCommitDTO): Promise<ImportCommitResult> {
    const skipDuplicates = dto.skipDuplicates !== false;
    const { account, rows } = await this.analyze(userId, {
      contentBase64: dto.contentBase64,
      accountId: dto.accountId,
      skipDuplicates,
    });

    const failures: { rowNo: number; message: string }[] = [];
    const toInsert: Partial<Transaction>[] = [];

    for (const row of rows) {
      // 字段不合法 → 无法导入，逐条进报告（预览页已把它们列出来）
      if (row.status === 'invalid') {
        failures.push({
          rowNo: row.rowNo,
          message: row.messages.join('；') || '字段不合法，已跳过',
        });
        continue;
      }
      // 重复 + 开关打开 → 跳过（不写库、不算失败）
      if (row.status === 'duplicate' && skipDuplicates) continue;

      // 分类降级是**导入成功**，只是分类不精确 —— 计入 unmatched 与 failures 供用户回看
      if (row.status === 'unmatched') {
        failures.push({
          rowNo: row.rowNo,
          message: row.messages.join('；') || '分类未精确匹配，已降级',
        });
      }

      toInsert.push({
        userId,
        accountId: account.id,
        type: row.type,
        amount: row.amount,
        categoryId: row.categoryId,
        recordDate: row.recordDate,
        recordTime: row.recordTime ? `${row.recordTime}:00` : null,
        note: row.note,
      });
    }

    if (toInsert.length) {
      await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Transaction);
        for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
          await repo.insert(toInsert.slice(i, i + INSERT_BATCH));
        }
      });
    }

    return {
      accountId: account.id,
      accountName: account.name,
      imported: toInsert.length,
      skipped: rows.filter((r) => r.status === 'duplicate' && skipDuplicates).length,
      failed: rows.filter((r) => r.status === 'invalid').length,
      unmatched: rows.filter((r) => r.status === 'unmatched').length,
      failures: failures.slice(0, 200),
    };
  }

  /* ============================================================
   * 三、内部工具
   * ============================================================ */

  private async resolveAccount(userId: string, accountId?: string): Promise<Account> {
    if (accountId) return this.accountService.findById(userId, accountId);
    const fallback = await this.accountService.getDefaultAccount(userId);
    if (!fallback) {
      throw new BusinessError('请先创建一个账本', ErrorCode.ACCOUNT_NOT_FOUND);
    }
    return fallback;
  }

  private decodeBase64(contentBase64: string): Buffer {
    const raw = String(contentBase64).trim();
    const payload = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
    if (!/^[A-Za-z0-9+/=\s]*$/.test(payload)) {
      throw new BusinessError('文件内容不是合法的 base64', ErrorCode.IMPORT_FILE_INVALID);
    }
    const buf = Buffer.from(payload, 'base64');
    if (buf.length === 0) {
      throw new BusinessError('文件内容为空', ErrorCode.IMPORT_FILE_INVALID);
    }
    if (buf.length > MAX_XLSX_BYTES) {
      throw new BusinessError(
        `文件超过 ${Math.round(MAX_XLSX_BYTES / 1024 / 1024)}MB 上限，请拆分后再导入`,
        ErrorCode.IMPORT_FILE_TOO_LARGE,
      );
    }
    return buf;
  }

  /** 表头 → 列号。按列名而不是固定列序，随手记改列序也不会崩。 */
  private buildHeaderMap(header: (string | number | null)[]): Map<string, number> {
    const map = new Map<string, number>();
    header.forEach((cell, idx) => {
      const name = cellText(cell);
      if (name && !map.has(name)) map.set(name, idx);
    });
    return map;
  }

  private async buildCategoryIndex(accountId: string): Promise<CategoryIndex> {
    const list = await this.categoryRepo.find({ where: { accountId } });
    const index: CategoryIndex = {
      byId: new Map(),
      rootByName: new Map(),
      childByKey: new Map(),
      looseRoot: new Map(),
      looseChild: new Map(),
    };
    for (const c of list) {
      index.byId.set(c.id, c);
      if (!c.parentId) {
        index.rootByName.set(c.name, c);
        const loose = normalizeLoose(c.name);
        if (!index.looseRoot.has(loose)) index.looseRoot.set(loose, c);
      } else {
        index.childByKey.set(`${c.parentId}|${c.name}`, c);
        const loose = `${c.parentId}|${normalizeLoose(c.name)}`;
        if (!index.looseChild.has(loose)) index.looseChild.set(loose, c);
      }
    }
    return index;
  }

  /**
   * 分类匹配（规则见计划 §3）：
   *   ① 一级精确 + 二级精确 → 二级
   *   ② 一级精确、二级为空 → 一级（统计按一级聚合，报表口径等价）
   *   ③ 一级精确、二级未命中 → 一级 + 警告
   *   ④ 一级未命中 → 未分类 + 警告
   *   ⑤ 精确失败时做一次宽松回退（去空白 + 全角转半角）
   *   **任何情况都不自动创建分类。**
   */
  private matchCategory(
    index: CategoryIndex,
    type: 'income' | 'expense',
    l1: string,
    l2: string,
  ): { category: Category | null; exact: boolean; messages: string[] } {
    if (!l1) {
      return { category: null, exact: false, messages: ['未填一级分类，已记为未分类'] };
    }

    let root = index.rootByName.get(l1);
    let loose = false;
    if (!root) {
      const candidate = index.looseRoot.get(normalizeLoose(l1));
      if (candidate) {
        root = candidate;
        loose = true;
      }
    }
    if (!root || root.type !== type) {
      return {
        category: null,
        exact: false,
        messages: [`一级分类「${l1}」在当前账本不存在，已记为未分类`],
      };
    }

    const messages: string[] = [];
    if (loose)
      messages.push(`一级分类「${l1}」为宽松匹配（原文与账本内「${root.name}」仅空白/全角差异）`);

    if (!l2) {
      messages.push(`未填二级分类，已挂到一级分类「${root.name}」`);
      return { category: root, exact: false, messages };
    }

    let child = index.childByKey.get(`${root.id}|${l2}`);
    let childLoose = false;
    if (!child) {
      const candidate = index.looseChild.get(`${root.id}|${normalizeLoose(l2)}`);
      if (candidate) {
        child = candidate;
        childLoose = true;
      }
    }
    if (child) {
      if (childLoose) messages.push(`二级分类「${l2}」为宽松匹配（账本内为「${child.name}」）`);
      return { category: child, exact: !loose && !childLoose, messages };
    }

    messages.push(`二级分类「${l2}」在当前账本不存在，已挂到一级分类「${root.name}」`);
    return { category: root, exact: false, messages };
  }

  private parseRow(
    raw: (string | number | null)[],
    headerMap: Map<string, number>,
    rowNo: number,
    sheet: string,
    index: CategoryIndex,
  ): ParsedRow | null {
    const pick = (name: string): unknown => {
      const idx = headerMap.get(name);
      return idx === undefined ? null : raw[idx];
    };

    const type = parseType(pick('交易类型'));
    const amount = parseAmount(pick('金额'));
    const dt = parseDateTime(pick('日期'));
    if (!type || !amount || !dt) return null;

    const l1 = cellText(pick('一级分类'));
    const l2 = cellText(pick('二级分类'));
    const matched = this.matchCategory(index, type, l1, l2);

    const messages = [...matched.messages];
    if (amount.rounded) messages.push('金额超过两位小数，已四舍五入');
    const rawNote = cellText(pick('备注'));
    const note = rawNote.slice(0, 255);
    if (rawNote.length > 255) messages.push('备注超过 255 字，已截断');
    const currency = cellText(pick('账户币种'));
    if (currency && currency.toUpperCase() !== 'CNY') {
      messages.push(`账户币种为 ${currency}，已按原数值导入（不换算）`);
    }

    return {
      rowNo,
      sheet,
      type,
      amount: amount.amount,
      recordDate: dt.date,
      recordTime: dt.time,
      categoryId: matched.category?.id ?? null,
      categoryName: matched.category?.name ?? null,
      categoryRaw: [l1, l2].filter(Boolean).join(' / '),
      note,
      messages,
      categoryExact: matched.exact,
      duplicate: false,
      invalid: false,
    };
  }

  /** 字段本身就不合法的行：也要出现在报告里，让用户看得到「为什么少了这几条」 */
  private invalidRow(
    raw: (string | number | null)[],
    headerMap: Map<string, number>,
    rowNo: number,
    sheet: string,
  ): ParsedRow {
    const pick = (name: string): unknown => {
      const idx = headerMap.get(name);
      return idx === undefined ? null : raw[idx];
    };
    const type = parseType(pick('交易类型'));
    const amount = parseAmount(pick('金额'));
    const dt = parseDateTime(pick('日期'));
    const l1 = cellText(pick('一级分类'));
    const l2 = cellText(pick('二级分类'));

    const reasons: string[] = [];
    if (!type)
      reasons.push(`交易类型「${cellText(pick('交易类型'))}」无法识别（只支持 支出 / 收入）`);
    if (!amount) reasons.push(`金额「${cellText(pick('金额'))}」不是大于 0 的数字`);
    if (!dt) reasons.push(`日期「${cellText(pick('日期'))}」格式无法识别`);

    return {
      rowNo,
      sheet,
      type,
      amount: amount?.amount ?? null,
      recordDate: dt?.date ?? null,
      recordTime: dt?.time ?? null,
      categoryId: null,
      categoryName: null,
      categoryRaw: [l1, l2].filter(Boolean).join(' / '),
      note: cellText(pick('备注')).slice(0, 255),
      messages: reasons,
      categoryExact: false,
      duplicate: false,
      invalid: true,
    };
  }

  private toReport(row: ParsedRow, skipDuplicates: boolean): ImportRowReport {
    let status: ImportRowStatus = 'ok';
    if (row.invalid) status = 'invalid';
    else if (row.duplicate) status = 'duplicate';
    else if (!row.categoryExact) status = 'unmatched';

    const willImport = status !== 'invalid' && !(status === 'duplicate' && skipDuplicates);
    return {
      rowNo: row.rowNo,
      sheet: row.sheet,
      type: row.type,
      amount: row.amount,
      recordDate: row.recordDate,
      recordTime: row.recordTime,
      note: row.note,
      categoryRaw: row.categoryRaw,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      status,
      willImport,
      messages: row.messages,
    };
  }

  /**
   * 取该账本已有（未删除）流水的指纹。
   *
   * 只在文件的日期区间内取：指纹里含 recordDate，区间外的记录**不可能**撞上，
   * 因此这样收窄是等价的，但避免把整个账本的流水都读进内存。
   */
  private async loadExistingFingerprints(
    accountId: string,
    start: string | null,
    end: string | null,
  ): Promise<Set<string>> {
    if (!start || !end) return new Set();
    const qb = this.repo
      .createQueryBuilder('t')
      .select(['t.type', 't.amount', 't.recordDate', 't.recordTime', 't.categoryId', 't.note'])
      .where('t.accountId = :accountId', { accountId })
      .andWhere('t.deletedAt IS NULL')
      .andWhere('t.recordDate BETWEEN :start AND :end', { start, end });

    const list = await qb.getMany();
    const set = new Set<string>();
    for (const t of list) {
      set.add(
        fingerprintOf({
          type: t.type,
          amount: t.amount,
          recordDate: t.recordDate,
          recordTime: timeToMinute(t.recordTime),
          categoryId: t.categoryId,
          note: t.note ?? '',
        }),
      );
    }
    return set;
  }
}

/** 供单测直接构造「已存在流水」的查询条件（保持与 service 同口径） */
export const __testing = { fingerprintOf, parseDateTime, parseAmount, normalizeLoose };
