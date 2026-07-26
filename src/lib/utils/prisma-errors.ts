import { logger } from "@/lib/logger"

/** Prisma 已知错误码 */
export const PrismaErrorCode = {
  UNIQUE_CONSTRAINT: "P2002",
  RECORD_NOT_FOUND: "P2025",
  FOREIGN_KEY_CONSTRAINT: "P2003",
  REQUIRED_RELATION: "P2014",
  VALUE_TOO_LONG: "P2000",
} as const

export type PrismaErrorCodeType = (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode]

/** 标准化 Prisma 错误结构 */
export interface PrismaErrorInfo {
  code: PrismaErrorCodeType | string
  message: string
  status: number
  target?: string
}

/** 类型守卫：判断是否为 Prisma 已知错误 */
export function isPrismaError(
  err: unknown,
  code?: PrismaErrorCodeType
): err is Error & { code: string; meta?: Record<string, unknown> } {
  if (!(err instanceof Error)) return false
  const hasCode =
    "code" in err && typeof (err as Record<string, unknown>).code === "string"
  if (!hasCode) return false
  if (code !== undefined) {
    return (err as Record<string, unknown>).code === code
  }
  return true
}

/** 将 Prisma 错误格式化为统一结构 */
export function formatPrismaError(err: unknown): PrismaErrorInfo | null {
  if (!isPrismaError(err)) return null

  const meta = (err as unknown as Record<string, unknown>).meta as
    | Record<string, unknown>
    | undefined

  switch (err.code) {
    case PrismaErrorCode.UNIQUE_CONSTRAINT: {
      const target = Array.isArray(meta?.target)
        ? (meta!.target as string[]).join(", ")
        : String(meta?.target ?? "unknown")
      return {
        code: PrismaErrorCode.UNIQUE_CONSTRAINT,
        message: `数据重复：${target} 已存在`,
        status: 409,
        target,
      }
    }
    case PrismaErrorCode.RECORD_NOT_FOUND: {
      const modelName = meta?.modelName ? String(meta.modelName) : "记录"
      return {
        code: PrismaErrorCode.RECORD_NOT_FOUND,
        message: `${modelName} 不存在`,
        status: 404,
      }
    }
    case PrismaErrorCode.FOREIGN_KEY_CONSTRAINT: {
      const field = meta?.field_name ? String(meta.field_name) : "关联记录"
      return {
        code: PrismaErrorCode.FOREIGN_KEY_CONSTRAINT,
        message: `${field} 关联的记录不存在`,
        status: 400,
        target: String(meta?.field_name ?? ""),
      }
    }
    case PrismaErrorCode.VALUE_TOO_LONG: {
      return {
        code: PrismaErrorCode.VALUE_TOO_LONG,
        message: "输入值超出字段长度限制",
        status: 400,
      }
    }
    default:
      return {
        code: err.code,
        message: `数据库错误 [${err.code}]: ${err.message}`,
        status: 500,
      }
  }
}

/**
 * 统一处理 Prisma 错误，返回可路由使用的 info。
 * 用法: const pe = handlePrismaError(error)
 *       if (pe) return errorResponse(pe.message, pe.status)
 */
export function handlePrismaError(err: unknown): PrismaErrorInfo | null {
  const info = formatPrismaError(err)
  if (info) {
    logger.warn("[PrismaError]", {
      code: info.code,
      message: info.message,
      target: info.target,
    })
    return info
  }
  return null
}
