import { z } from "zod"

const VALID_TYPES = ["balance", "frozenBalance", "recharge", "consume_void", "earnings_add", "earnings_void"] as const

export const balanceAdjustSchema = z.object({
  type: z.enum(VALID_TYPES, { message: `type 必须为 ${VALID_TYPES.join(" / ")}` }),
  amount: z.number().refine(v => Number.isFinite(v) && v !== 0, "amount 必须为非零有限数字"),
  reason: z.string().min(5, "原因至少 5 个字"),
}).refine(
  data => data.type !== "earnings_void" || data.amount > 0,
  { message: "作废收益金额必须为正数", path: ["amount"] }
)

export type BalanceAdjustInput = z.infer<typeof balanceAdjustSchema>
