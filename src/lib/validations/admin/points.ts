import { z } from "zod"

export const voidPointsSchema = z.object({
  userId: z.string().min(1, "userId 必填"),
  amount: z.number().int().positive("amount 必须为正整数"),
  reason: z.string().min(1, "作废原因必填"),
})

export type VoidPointsInput = z.infer<typeof voidPointsSchema>
