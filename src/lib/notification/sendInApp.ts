import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

interface SendInAppParams {
  userId: string
  templateType: string
  variables: Record<string, string>
  batchId?: string
  senderId?: string
  /** 通知来源类型（如 'recharge_request'），不传则默认从 templateType 拆分 */
  sourceType?: string
  /** 通知来源 ID（如充值申请 ID），不传则保持 null */
  sourceId?: string
}

export async function sendInApp({ userId, templateType, variables, batchId, senderId, sourceType, sourceId }: SendInAppParams): Promise<boolean> {
  try {
    const template = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type: templateType, channel: 'in_app' } },
    })

    if (!template) {
      logger.info(`[Notification] 站内信模板 "${templateType}" 不存在，跳过`)
      return false
    }

    if (!template.enabled) {
      logger.info(`[Notification] 站内信模板 "${templateType}" 已禁用，跳过`)
      return false
    }

    const subject = replaceVariables(template.subject ?? '', variables)
    const content = replaceVariables(template.content, variables)

    await prisma.notification.create({
      data: {
        userId,
        type: templateType,
        title: subject,
        content,
        sourceType: sourceType ?? templateType.split('_')[0],
        sourceId: sourceId ?? null,
        batchId: batchId ?? null,
        senderId: senderId ?? null,
      },
    })

    logger.info('[Notification] 站内信已发送', { userId, type: templateType, title: subject })
    return true
  } catch (error) {
    logger.error('[Notification] 站内信发送失败', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}