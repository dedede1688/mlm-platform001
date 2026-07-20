import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

interface SendSmsParams {
  to: string
  templateType: string
  variables: Record<string, string>
}

/**
 * 发送短信通知（预留接口）
 *
 * 当前仅打印日志，不实际发送。
 *
 * 【产品决策】本平台仅使用站内信（in-app）通知，短信通道为有意保留的占位接口，
 * 不接入任何外部短信服务。此 mock 为终态，非待办项。
 */
export async function sendSms({ to, templateType, variables }: SendSmsParams): Promise<boolean> {
  try {
    // 查找模板
    const template = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type: templateType, channel: 'sms' } },
    })

    if (!template) {
      logger.info(`[Notification] 短信模板 "${templateType}" 不存在，跳过发送`)
      return false
    }

    if (!template.enabled) {
      logger.info(`[Notification] 短信模板 "${templateType}" 已禁用，跳过发送`)
      return false
    }

    // 替换变量占位符
    const content = replaceVariables(template.content, variables)

    // 按产品决策，平台仅使用站内信（in-app），短信通道不接入外部服务。
    // 以下为预留对接示例（当前不启用）：
    // const result = await smsClient.send({
    //   phoneNumbers: to,
    //   signName: process.env.SMS_SIGN_NAME,
    //   templateCode: process.env.SMS_TEMPLATE_CODE,
    //   templateParams: variables,
    // })

    logger.info('[Notification] 短信发送（模拟）', {
      to,
      content,
      templateType,
    })

    return true
  } catch (error) {
    logger.error('[Notification] 短信发送失败', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

/**
 * 替换模板中的变量占位符
 */
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}