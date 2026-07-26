import { z } from "zod"

export const userStatusSchema = z.object({
  status: z.enum(["active", "frozen"], { message: "status 必须为 active 或 frozen" }),
  reason: z.string().min(5, "原因至少 5 个字"),
})

export const userPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(1, "新密码不能为空")
    .min(8, "密码长度必须在 8-20 位之间")
    .max(20, "密码长度必须在 8-20 位之间")
    .regex(/[a-zA-Z]/, "密码必须包含字母")
    .regex(/[0-9]/, "密码必须包含数字"),
  reason: z.string().min(5, "原因至少 5 个字"),
})

export const userPointsAdjustSchema = z.object({
  type: z.enum(["totalPoints", "unlockedPoints", "lockedPoints"], {
    message: "积分类型无效，必须为 totalPoints、unlockedPoints 或 lockedPoints",
  }),
  amount: z.number().refine(v => v !== 0, "积分调整量必须为非零数字"),
  reason: z.string().min(5, "调整原因不少于5字"),
})

export type UserStatusInput = z.infer<typeof userStatusSchema>
export type UserPasswordInput = z.infer<typeof userPasswordSchema>
export type UserPointsAdjustInput = z.infer<typeof userPointsAdjustSchema>


export const userLevelSchema = z.object({
  level: z.number().int().min(0, "等级最小为0").max(7, "等级最大为7"),
})

export type UserLevelInput = z.infer<typeof userLevelSchema>