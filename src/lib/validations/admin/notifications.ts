import { z } from "zod"

export const sendNotificationSchema = z.object({
  type: z.enum(["general", "announcement"], { message: "类型必须为 general 或 announcement" }),
  content: z.string().min(1, "内容不能为空"),
  userIds: z.array(z.string()).optional(),
  subject: z.string().optional(),
})


export const notificationTemplateCreateSchema = z.object({
  type: z.string().min(1, "类型不能为空"),
  channel: z.enum(["email", "sms", "in_app"], { message: "渠道必须是 email、sms 或 in_app" }),
  subject: z.string().optional(),
  content: z.string().min(1, "内容不能为空"),
  enabled: z.boolean().optional(),
})

export const notificationTemplateUpdateSchema = z.object({
  type: z.string().optional(),
  channel: z.enum(["email", "sms", "in_app"]).optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
  enabled: z.boolean().optional(),
})

export type NotificationTemplateCreateInput = z.infer<typeof notificationTemplateCreateSchema>
export type NotificationTemplateUpdateInput = z.infer<typeof notificationTemplateUpdateSchema>

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>
