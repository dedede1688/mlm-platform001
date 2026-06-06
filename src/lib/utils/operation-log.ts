import { prisma } from '@/lib/prisma'

export type LogAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT'
export type LogModule = 'product' | 'order' | 'user' | 'finance' | 'setting'

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
        oldValue: params.oldValue || undefined,
        newValue: params.newValue || undefined,
        ip: params.ip || null,
        userAgent: params.userAgent || null,
      },
    })
  } catch (error) {
    console.error('[OperationLog] 记录操作日志失败:', error)
  }
}