import { z } from "zod"

export const orderStatusActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ship"),
    trackingNumber: z.string().min(3, "物流单号至少 3 字符"),
  }),
  z.object({
    action: z.literal("cancel"),
    trackingNumber: z.string().optional(),
  }),
])

export const orderStatusTransitionSchema = z.object({
  status: z.enum(["paid", "shipped", "completed", "cancelled"], {
    message: "status 必须为 paid/shipped/completed/cancelled",
  }),
  trackingNumber: z.string().optional(),
  reason: z.string().optional(),
})

export type OrderStatusActionInput = z.infer<typeof orderStatusActionSchema>
export type OrderStatusTransitionInput = z.infer<typeof orderStatusTransitionSchema>
