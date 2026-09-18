import { Rule, RuleType } from '@midwayjs/validate';
import { ApiProperty } from '@midwayjs/swagger';

/**
 * 流水导入的入参（预览与提交**同一个形状**）。
 *
 * 用 JSON + base64 承载文件，而不是 multipart：账单文件只有几十 KB，
 * 为此引入 @midwayjs/upload / busboy 与一个上传中间件不划算。
 *
 * ⚠️ **提交也传文件，不传行**（2026-09-17 方案 B）。
 * 早先的写法是「预览回传逐行数据、提交照单落库」，有两个问题：
 *   ① 预览为控制响应体只回传前 2000 行 → **超过 2000 行的账单只能导入 2000 条**；
 *   ② 预览与提交的口径可能分叉（前者截断、后者照单全收）。
 * 现在两端都走「传文件 → 服务端解析」：行数上限只剩文件体积一条（2MB ≈ 3 万行），
 * 且预览与提交天然同口径。代价只是解析两次（664 行约 30ms，可忽略）。
 */
export class ImportPreviewDTO {
  @ApiProperty({
    description: '原始文件名，只用于回显与报告（不参与解析）',
    example: '随手记默认账本20260915154105.xlsx',
    required: true,
  })
  @Rule(RuleType.string().required().max(255))
  filename: string;

  @ApiProperty({
    description: 'xlsx 文件内容的 base64',
    required: true,
  })
  @Rule(
    RuleType.string()
      .required()
      .max(4 * 1024 * 1024),
  )
  contentBase64: string;

  @ApiProperty({
    description: '导入到哪个账本。不传则落到该用户的默认账本。',
    example: '1',
    required: false,
  })
  @Rule(RuleType.string().optional())
  accountId?: string;

  @ApiProperty({
    description:
      '是否跳过疑似重复（与库内同账本流水指纹相同的行）。默认 true；' +
      '预览页可一键切换为「全部导入」。',
    example: true,
    required: false,
  })
  @Rule(RuleType.boolean().optional().default(true))
  skipDuplicates?: boolean;
}

/**
 * 提交入参 —— **与预览完全相同**（同文件、同账本、同开关）。
 *
 * 服务端会重新解析该文件（分类树也重新读，所以「预览到提交之间分类被改」
 * 会被自然处理：失效分类走降级路径并计入 unmatched），然后在一个事务里落库。
 */
export class ImportCommitDTO extends ImportPreviewDTO {}
