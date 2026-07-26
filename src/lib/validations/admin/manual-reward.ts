import { z } from "zod"

export const manualRewardSchema = z.object({
  userId: z.string().min(1, "缺少用户ID"),
  amount: z.number().positive("金额必须大于0"),
  type: z.string().optional(),
  reason: z.string().min(1, "发放原因不能为空"),
})

export type ManualRewardInput = z.infer<typeof manualRewardSchema>
