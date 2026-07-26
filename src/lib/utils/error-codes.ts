/**
 * 应用结构化错误码
 *
 * 前端应基于 code 做业务判断，不再依赖 error 字符串匹配。
 * 使用方式: errorResponse("消息", 401, { code: AppErrorCode.AUTH_REQUIRED })
 */
export const AppErrorCode = {
  // ---- 认证 (401) ----
  /** 未登录 / 缺少有效 token */
  AUTH_REQUIRED: "AUTH_REQUIRED",
  /** token 无效或已过期 */
  TOKEN_INVALID: "TOKEN_INVALID",

  // ---- 授权 (403) ----
  /** 已登录但角色/权限不足 */
  FORBIDDEN: "FORBIDDEN",

  // ---- 资源 (404) ----
  /** 请求的资源不存在 */
  NOT_FOUND: "NOT_FOUND",

  // ---- 校验 (400) ----
  /** 请求参数不符合校验规则 */
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // ---- 业务 (400/401/409/423) ----
  /** 余额不足 */
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  /** 需要支付密码 */
  PAYMENT_PASSWORD_REQUIRED: "PAYMENT_PASSWORD_REQUIRED",
  /** 支付密码错误 */
  PAYMENT_PASSWORD_WRONG: "PAYMENT_PASSWORD_WRONG",
  /** 支付密码已锁定 */
  PAYMENT_PASSWORD_LOCKED: "PAYMENT_PASSWORD_LOCKED",
  /** 数据冲突（如唯一键重复） */
  RESOURCE_CONFLICT: "RESOURCE_CONFLICT",
  /** 业务状态不允许当前操作 */
  BUSINESS_STATE_INVALID: "BUSINESS_STATE_INVALID",

  // ---- 限流 (429) ----
  /** 请求过于频繁 */
  RATE_LIMITED: "RATE_LIMITED",

  // ---- 服务端 (500) ----
  /** 服务器内部错误 */
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const

export type AppErrorCodeType = (typeof AppErrorCode)[keyof typeof AppErrorCode]
