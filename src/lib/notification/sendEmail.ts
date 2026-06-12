import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

interface SendEmailParams {
  to: string
  templateType: string
  variables: Record<string, string>
}

/**
 * 发送邮件通知（预留接口）
 *
 * 当前仅打印日志，不实际发送。
 * 后续可对接第三方邮件服务，如：
 * - Resend (https://resend.com)
 * - SendGrid (https://sendgrid.com)
 * - 阿里云邮件推送
 * - 腾讯云 SES
 *
 * 环境变量预留：
 * - EMAIL_SERVICE_API_KEY
 * - EMAIL_FROM_ADDRESS
 * - EMAIL_FROM_NAME
 */
export async function sendEmail({ to, templateType, variables }: SendEmailParams): Promise<boolean> {
  try {
    // 查找模板
    const template = await prisma.notificationTemplate.findUnique({
      where: { type_channel: { type: templateType, channel: 'email' } },
    })

    if (!template) {
      logger.info(`[Notification] 邮件模板 "${templateType}" 不存在，跳过发送`)
      return false
    }

    if (!template.enabled) {
      logger.info(`[Notification] 邮件模板 "${templateType}" 已禁用，跳过发送`)
      return false
    }

    // 替换变量占位符
    const subject = replaceVariables(template.subject ?? '', variables)
    const content = replaceVariables(template.content, variables)

    // TODO: 对接真实邮件发送服务
    // const result = await emailClient.send({
    //   from: process.env.EMAIL_FROM_ADDRESS,
    //   to,
    //   subject,
    //   html: content,
    // })

    logger.info('[Notification] 邮件发送（模拟）', {
      to,
      subject,
      contentPreview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      templateType,
    })

    return true
  } catch (error) {
    logger.error('[Notification] 邮件发送失败', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

/**
 * 替换模板中的变量占位符
 * 如：将 {{orderNo}} 替换为实际值
 */
function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}