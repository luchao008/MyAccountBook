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

  // 权限
  FORBIDDEN = 40300,

  // 资源不存在
  NOT_FOUND = 40400,
  CATEGORY_NOT_FOUND = 40401,
  TRANSACTION_NOT_FOUND = 40402,
  ACCOUNT_NOT_FOUND = 40403,

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

  // 服务端
  INTERNAL = 50000,
}
