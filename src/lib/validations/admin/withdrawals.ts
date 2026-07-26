import { z } from "zod"

export const withdrawalReviewSchema = z.object({
  id: z.string().min(1, "缺少提现记录 ID"),
  action: z.enum(["approve", "reject"], { message: "action 必须为 approve 或 reject" }),
  rejectReason: z.string().optional(),
  rejectTemplateId: z.string().optional(),
  remark: z.string().optional(),
})

export const withdrawalsBatchReviewSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "至少需要一条提现记录 ID"),
  action: z.enum(["approve", "reject"], { message: "action 必须为 approve 或 reject" }),
  rejectReason: z.string().optional(),
  rejectTemplateId: z.string().optional(),
  remark: z.string().optional(),
})

export type WithdrawalReviewInput = z.infer<typeof withdrawalReviewSchema>
export type WithdrawalsBatchReviewInput = z.infer<typeof withdrawalsBatchReviewSchema>
