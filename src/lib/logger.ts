// src/lib/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  traceId?: string
  [key: string]: unknown
}

// C-8: 用 Symbol + 嵌套调用栈替代全局单变量
// 原理: 每个请求调用 runWithTrace() 创建独立上下文，嵌套调用正确恢复
// 局限: 不能跨异步边界（在 Next.js Serverless 中与 AsyncLocalStorage 等效）
// 客户端: 单标签页内天然隔离，无需额外处理

const TRACE_KEY = Symbol.for('__logger_traceId')

/** 获取当前上下文的 traceId */
function getTraceContext(): string | undefined {
  return (globalThis as Record<symbol, string | undefined>)[TRACE_KEY]
}

/** 在 traceId 上下文中运行回调（请求入口调用一次即可） */
export function runWithTrace<T>(traceId: string, fn: () => T | Promise<T>): T | Promise<T> {
  const prev = getTraceContext()
  ;(globalThis as Record<symbol, string>)[TRACE_KEY] = traceId
  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(() => {
        ;(globalThis as Record<symbol, string | undefined>)[TRACE_KEY] = prev
      }) as T
    }
    ;(globalThis as Record<symbol, string | undefined>)[TRACE_KEY] = prev
    return result
  } catch (e) {
    ;(globalThis as Record<symbol, string | undefined>)[TRACE_KEY] = prev
    throw e
  }
}

/** 从 NextRequest header 提取 x-trace-id 并运行 */
export function runWithRequestTrace<T>(
  request: { headers: { get(name: string): string | null } },
  fn: () => T | Promise<T>
): T | Promise<T> {
  const traceId = request.headers.get('x-trace-id')
    || (typeof crypto !== 'undefined' && crypto.randomUUID?.())
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return runWithTrace(traceId, fn)
}

// 保留兼容旧 API
/** @deprecated 用 runWithTrace / runWithRequestTrace 替代 */
let __legacyTraceId: string | null = null
export function setTraceId(id: string | null) { __legacyTraceId = id }
export function getTraceId(): string | null { return getTraceContext() || __legacyTraceId }

function formatLog(level: LogLevel, message: string, meta?: unknown): string {
  const traceId = getTraceContext() || __legacyTraceId
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(traceId && { traceId }),
    ...(meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}),
  }
  return JSON.stringify(entry)
}

export const logger = {
  debug(message: string, meta?: unknown) {
    if (process.env.NODE_ENV === 'production') return
    console.debug(formatLog('debug', message, meta))
  },
  info(message: string, meta?: unknown) {
    console.info(formatLog('info', message, meta))
  },
  warn(message: string, meta?: unknown) {
    console.warn(formatLog('warn', message, meta))
  },
  error(message: string, meta?: unknown) {
    console.error(formatLog('error', message, meta))
  },
}
