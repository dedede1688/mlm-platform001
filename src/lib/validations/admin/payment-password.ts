import { z } from "zod"

export const paymentPasswordResetSchema = z.object({
  reason: z.string().min(5, "原因不能为空且不少于 5 个字"),
  phoneSuffix: z.string().regex(/^\d{4}$/, "手机号后 4 位必须为 4 位数字"),
})

export type PaymentPasswordResetInput = z.infer<typeof paymentPasswordResetSchema>
