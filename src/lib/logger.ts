// src/lib/logger.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  traceId?: string
  [key: string]: unknown
}

let currentTraceId: string | null = null

export function setTraceId(id: string | null) {
  currentTraceId = id
}

export function getTraceId(): string | null {
  return currentTraceId
}

function formatLog(level: LogLevel, message: string, meta?: unknown): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(currentTraceId && { traceId: currentTraceId }),
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