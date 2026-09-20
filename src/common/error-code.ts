/**
 * 业务错误码
 * 约定：
 *   0         成功
 *   400xx     参数/校验
 *   401xx     认证
 *   403xx     权限
 *   404xx     资源不存在
 *   409xx     冲突
 *   500xx     服务端
 * HTTP 状态码与业务码分离：业务异常默认返回 200，仅认证失败返回 401。
 */
export enum ErrorCode {
  SUCCESS = 0,

  // 参数
  PARAM_INVALID = 40000,

  // 认证
  UNAUTHORIZED = 40100,
  LOGIN_FAILED = 40101,
  /** 登录时：账号审核中（中台审批制，D18） */
  USER_PENDING = 40102,
  /** 登录时：账号已被停用 */
  USER_DISABLED = 40103,

  // 权限
  FORBIDDEN = 40300,
  /** 管理员登录失败（不暴露账号是否存在，D17） */
  ADMIN_LOGIN_FAILED = 40301,
  /** 管理员账号已被停用 */
  ADMIN_DISABLED = 40302,

  // 资源不存在
  NOT_FOUND = 40400,
  CATEGORY_NOT_FOUND = 40401,
  TRANSACTION_NOT_FOUND = 40402,
  ACCOUNT_NOT_FOUND = 40403,
  /** 中台管理接口的目标用户不存在 */
  USER_NOT_FOUND = 40404,

  // 冲突
  CONFLICT = 40900,
  USERNAME_EXISTS = 40901,
  CATEGORY_NAME_EXISTS = 40902,
  ACCOUNT_NAME_EXISTS = 40903,

  // 账本业务规则（400xx 段）
  /** 删除账本时输入的确认名称与账本名不一致 */
  ACCOUNT_CONFIRM_MISMATCH = 40001,
  /** 不允许删除最后一个账本 */
  ACCOUNT_LAST_ONE = 40002,
  /** 不能把账本合并到它自己 */
  ACCOUNT_MERGE_SELF = 40003,
  /** 分类下已有交易，不能移除（账本级分类，设计 D10） */
  CATEGORY_HAS_TRANSACTIONS = 40004,
  /** 分类与交易不属于同一账本（账本级分类） */
  CATEGORY_ACCOUNT_MISMATCH = 40005,
  /** 默认账本（分类母本）的分类不允许删除（设计 D16） */
  CATEGORY_DEFAULT_PROTECTED = 40006,

  // 流水导入（400xx 段）
  /** 导入文件不是可解析的 xlsx（格式不支持 / 已损坏 / 加密） */
  IMPORT_FILE_INVALID = 40007,
  /** 导入文件超过体积上限 */
  IMPORT_FILE_TOO_LARGE = 40008,
  /** 导入文件缺少必要列 */
  IMPORT_HEADER_MISSING = 40009,
  /** 导入文件里没有一条可导入的数据 */
  IMPORT_NO_VALID_ROWS = 40010,

  // 分类排序（400xx 段）
  /**
   * 排序列表里有重复的分类 ID。
   * 单列一个码而不并进「不完整」：重复与漏传是两种不同的客户端 bug，
   * 修法不同（去重 vs 补全），混在一个码里排查时还得再猜。
   */
  CATEGORY_REORDER_DUPLICATE = 40011,
  /** 排序列表里混入了其他层级或其他收支类型的分类（跨级拖动） */
  CATEGORY_REORDER_LEVEL_MISMATCH = 40012,
  /** 排序列表不是该层级的全集 —— 归一化会漏掉未列出的分类 */
  CATEGORY_REORDER_INCOMPLETE = 40013,

  // 用户状态管理（中台，400xx 段）
  /** approve/reject 只对 pending 用户生效 */
  USER_NOT_PENDING = 40014,

  // 服务端
  INTERNAL = 50000,
}
