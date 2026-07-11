import type { InputJsonValue } from '@prisma/client/runtime/library'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

function toJsonValue(value: unknown): InputJsonValue | undefined {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value)) as InputJsonValue
}

export type LogAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'BATCH_APPROVE' | 'BATCH_REJECT' | 'COMPLETE_REFUND' | 'COMPLETE_WITHDRAWAL' | 'TRANSFER'
export type LogModule = 'product' | 'order' | 'user' | 'finance' | 'setting' | 'refund' | 'earnings'

interface LogOperationParams {
  userId: string
  action: LogAction
  module: LogModule
  targetId?: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  ip?: string
  userAgent?: string
}

/**
 * 记录操作日志
 * 使用独立 try-catch，不阻塞主业务流程
 */
export async function logOperation(params: LogOperationParams): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        module: params.module,
        targetId: params.targetId || null,
        oldValue: toJsonValue(params.oldValue),
        newValue: toJsonValue(params.newValue),
        ip: params.ip || null,
        userAgent: params.userAgent || null,
      },
    })
  } catch (error) {
    logger.error('[OperationLog] 记录操作日志失败', { error: error instanceof Error ? error.message : String(error) })
  }
}