import { ApiProperty } from '@midwayjs/swagger';

/**
 * Swagger 专用响应模型（不参与运行时逻辑）。
 *
 * 背景：所有 /api 响应都会被 ResponseMiddleware 包装成
 *   { code, data, message }
 * 因此 Swagger 里必须展示"包装后"的结构，否则前端看到的文档
 * 与真实返回值对不上（前端会以为直接用 res.data.token，实际是 res.data.data.token）。
 *
 * 约定：每个具体响应类都显式声明 code / data / message 三个字段，
 * 不依赖继承——Midway Swagger 对继承属性的解析不稳定，显式声明最可靠。
 */

/** 登录 / 注册返回的 user 片段 */
export class UserBriefVO {
  @ApiProperty({ description: '用户 ID（BIGINT，字符串承载）', example: '1' })
  id: string;

  @ApiProperty({ description: '用户名', example: 'alice' })
  username: string;
}

/** 登录 / 注册返回的 data */
export class AuthDataVO {
  @ApiProperty({
    description: 'JWT 令牌，需放入 Authorization 头',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;

  @ApiProperty({ description: '有效期（与服务端 jwt.expiresIn 一致）', example: '7d' })
  expiresIn: string;

  @ApiProperty({ type: UserBriefVO, description: '用户信息' })
  user: UserBriefVO;
}

export class LoginResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: AuthDataVO })
  data: AuthDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class RegisterResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: AuthDataVO })
  data: AuthDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 分类 */
export class CategoryVO {
  @ApiProperty({ description: '分类 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '所属用户 ID', example: '1' })
  userId: string;

  @ApiProperty({ description: '分类名', example: '餐饮' })
  name: string;

  @ApiProperty({ description: '收支类型', example: 'expense', enum: ['income', 'expense'] })
  type: string;

  @ApiProperty({ description: '图标标识', example: 'food' })
  icon: string;

  @ApiProperty({ description: '排序值，升序', example: 0 })
  sort: number;

  @ApiProperty({ description: '父分类 ID；null 表示一级分类', example: null, nullable: true })
  parentId: string | null;

  @ApiProperty({
    description: '是否隐藏。隐藏后不出现在「记一笔」的选择器里，其余场景不受影响',
    example: false,
  })
  isHidden: boolean;
}

export class CategoryListResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: CategoryVO, isArray: true })
  data: CategoryVO[];

  @ApiProperty({ example: 'success' })
  message: string;
}

export class CategoryDetailResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: CategoryVO })
  data: CategoryVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 删除类操作的 data */
export class SuccessFlagVO {
  @ApiProperty({ description: '操作结果', example: true })
  success: boolean;
}

export class DeleteResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: SuccessFlagVO })
  data: SuccessFlagVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 批量删除结果 */
export class BatchDeleteResultVO {
  @ApiProperty({ description: '操作结果', example: true })
  success: boolean;

  @ApiProperty({ description: '实际消失的分类总数（含被级联删除的二级分类）', example: 9 })
  deleted: number;

  @ApiProperty({ description: '其中因删除一级分类而连带删掉的二级分类数量', example: 7 })
  deletedChildren: number;
}

export class BatchDeleteResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: BatchDeleteResultVO })
  data: BatchDeleteResultVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 批量隐藏 / 恢复显示结果 */
export class BatchHideResultVO {
  @ApiProperty({ description: '操作结果', example: true })
  success: boolean;

  @ApiProperty({
    description:
      '实际写入的分类数量。注意可能**小于**传入的 id 数：' +
      '父分类已被选中时，其二级分类不重复写入（由查询侧规则覆盖）',
    example: 1,
  })
  updated: number;

  @ApiProperty({ description: '本次写入的目标状态：true=隐藏，false=恢复显示', example: true })
  hidden: boolean;
}

export class BatchHideResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: BatchHideResultVO })
  data: BatchHideResultVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 账单内的分类快照（未分类时为 null） */
export class TransactionCategoryVO {
  @ApiProperty({ description: '分类 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '分类名', example: '餐饮' })
  name: string;

  @ApiProperty({ description: '图标标识', example: 'food' })
  icon: string;

  @ApiProperty({ description: '收支类型', example: 'expense' })
  type: string;
}

/** 账单 */
export class TransactionVO {
  @ApiProperty({ description: '账单 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '所属用户 ID', example: '1' })
  userId: string;

  @ApiProperty({ description: '收支类型', example: 'expense', enum: ['income', 'expense'] })
  type: string;

  @ApiProperty({
    description: '金额，字符串承载以避免浮点精度丢失',
    example: '35.50',
  })
  amount: string;

  @ApiProperty({ description: '分类 ID，未分类为 null', example: '1', nullable: true })
  categoryId: string | null;

  @ApiProperty({ description: '记账日期 YYYY-MM-DD', example: '2026-09-11' })
  recordDate: string;

  @ApiProperty({ description: '备注', example: '午饭' })
  note: string;

  @ApiProperty({ description: '创建时间', example: '2026-09-11T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({
    type: TransactionCategoryVO,
    description: '关联分类，未分类为 null',
    nullable: true,
  })
  category: TransactionCategoryVO | null;
}

/** 分页外壳 */
export class TransactionPageDataVO {
  @ApiProperty({ type: TransactionVO, isArray: true })
  list: TransactionVO[];

  @ApiProperty({ description: '符合条件的总条数', example: 128 })
  total: number;

  @ApiProperty({ description: '当前页码', example: 1 })
  page: number;

  @ApiProperty({ description: '每页条数', example: 20 })
  size: number;
}

export class TransactionPageResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: TransactionPageDataVO })
  data: TransactionPageDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class TransactionDetailResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: TransactionVO })
  data: TransactionVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 月度汇总 */
export class MonthlyStatVO {
  @ApiProperty({ description: '统计月份 YYYY-MM', example: '2026-09' })
  month: string;

  @ApiProperty({ description: '收入合计，两位小数字符串', example: '8000.00' })
  income: string;

  @ApiProperty({ description: '支出合计，两位小数字符串', example: '3250.50' })
  expense: string;

  @ApiProperty({ description: '结余 = 收入 - 支出', example: '4749.50' })
  balance: string;
}

export class MonthlyStatResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: MonthlyStatVO })
  data: MonthlyStatVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 分类占比单项 */
export class CategoryStatItemVO {
  @ApiProperty({ description: '分类 ID，未分类为 null', example: '1', nullable: true })
  categoryId: string | null;

  @ApiProperty({ description: '分类名，未分类记为"未分类"', example: '餐饮' })
  name: string;

  @ApiProperty({ description: '图标标识', example: 'food' })
  icon: string;

  @ApiProperty({ description: '收支类型', example: 'expense', enum: ['income', 'expense'] })
  type: string;

  @ApiProperty({ description: '该分类金额合计', example: '1200.00' })
  sum: string;

  @ApiProperty({ description: '占当前筛选总额的百分比', example: '36.92' })
  ratio: number;

  @ApiProperty({ description: '该分类下的记账笔数', example: 12 })
  count: number;
}

export class CategoryStatResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: CategoryStatItemVO, isArray: true })
  data: CategoryStatItemVO[];

  @ApiProperty({ example: 'success' })
  message: string;
}

/** 业务失败响应（HTTP 状态码通常与业务码段对应） */
export class ErrorResponseVO {
  @ApiProperty({
    description:
      '业务错误码：40000 参数无效 / 40100 未认证 / 40101 登录失败 / 40401 分类不存在 / 40402 账单不存在 / 40901 用户名已存在 / 40902 分类名已存在 / 50000 服务异常',
    example: 40901,
  })
  code: number;

  @ApiProperty({ description: '失败时恒为 null', example: null, nullable: true })
  data: any;

  @ApiProperty({ example: '用户名已存在' })
  message: string;
}
