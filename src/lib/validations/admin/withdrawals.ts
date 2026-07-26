import { z } from "zod"

export const withdrawalsBatchReviewSchema = z.object({
  ids: z.array(z.string()).min(1, "缺少提现记录 ID 列表"),
  action: z.enum(["approve", "reject"], { message: "action 必须为 approve 或 reject" }),
  rejectReason: z.string().optional(),
  rejectTemplateId: z.string().optional(),
  remark: z.string().optional(),
})

export type WithdrawalsBatchReviewInput = z.infer<typeof withdrawalsBatchReviewSchema>
