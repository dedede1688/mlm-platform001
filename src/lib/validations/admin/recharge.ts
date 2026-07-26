import { z } from "zod"

export const rechargeReviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    remark: z.string().optional(),
    rejectReason: z.string().optional(),
    rejectTemplateId: z.string().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    remark: z.string().optional(),
    rejectReason: z.string().optional(),
    rejectTemplateId: z.string().optional(),
  }),
])

export type RechargeReviewInput = z.infer<typeof rechargeReviewSchema>
