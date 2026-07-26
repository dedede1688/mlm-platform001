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

export type OrderStatusActionInput = z.infer<typeof orderStatusActionSchema>
