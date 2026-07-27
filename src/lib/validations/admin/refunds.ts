import { z } from "zod"

export const refundReviewSchema = z.object({
  action: z.enum(["approve", "reject"], { message: "action 必须为 approve 或 reject" }),
  adminComment: z.string().optional(),
})

export const refundCompleteSchema = z.object({
  remark: z.string().optional(),
})

export type RefundReviewInput = z.infer<typeof refundReviewSchema>
export type RefundCompleteInput = z.infer<typeof refundCompleteSchema>
