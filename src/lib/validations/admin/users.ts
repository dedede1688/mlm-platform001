import { z } from "zod"

export const userStatusSchema = z.object({
  status: z.enum(["active", "frozen"], { message: "status ??? active ? frozen" }),
  reason: z.string().min(5, "???? 5 ??"),
})

export const userPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(1, "???????")
    .min(8, "??????? 8-20 ???")
    .max(20, "??????? 8-20 ???")
    .regex(/[a-zA-Z]/, "????????")
    .regex(/[0-9]/, "????????"),
  reason: z.string().min(5, "???? 5 ??"),
})

export const userPointsAdjustSchema = z.object({
  type: z.enum(["totalPoints", "unlockedPoints", "lockedPoints"], {
    message: "?????????? totalPoints?unlockedPoints ? lockedPoints",
  }),
  amount: z.number().refine(v => v !== 0, "????????????"),
  reason: z.string().min(5, "???????5?"),
})

export const userLevelSchema = z.object({
  level: z.number().int().min(0, "?????0").max(7, "?????7"),
})

// PUT /admin/users/[id]/profile: ???/????? & ?????? ???
export const userProfileUpdateSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, "????????").optional().or(z.literal("")),
  nickname: z.string().min(1, "??????").max(20, "??????? 1-20 ?????").optional().or(z.literal("")),
  email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "???????").optional().or(z.literal("")),
  avatarUrl: z.string().optional().or(z.literal("")),
  role: z.enum(["user", "auditor", "support_admin", "goods_admin", "finance_admin", "super_admin"], {
    message: "?????"
  }).optional().or(z.literal("")),
  reason: z.string().optional(),
})

export type UserStatusInput = z.infer<typeof userStatusSchema>
export type UserPasswordInput = z.infer<typeof userPasswordSchema>
export type UserPointsAdjustInput = z.infer<typeof userPointsAdjustSchema>
export type UserLevelInput = z.infer<typeof userLevelSchema>
export type UserProfileUpdateInput = z.infer<typeof userProfileUpdateSchema>
