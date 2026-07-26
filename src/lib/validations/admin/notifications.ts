import { z } from "zod"

export const sendNotificationSchema = z.object({
  type: z.enum(["general", "announcement"], { message: "类型必须为 general 或 announcement" }),
  content: z.string().min(1, "内容不能为空"),
  userIds: z.array(z.string()).optional(),
  subject: z.string().optional(),
})

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>
