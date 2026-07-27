import { z } from "zod"

export const withdrawalTemplateCreateSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  content: z.string().min(1, "内容不能为空"),
  sortOrder: z.number().optional(),
  isEnabled: z.boolean().optional(),
})

export const withdrawalTemplateUpdateSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  sortOrder: z.number().optional(),
  isEnabled: z.boolean().optional(),
})

export type WithdrawalTemplateCreateInput = z.infer<typeof withdrawalTemplateCreateSchema>
export type WithdrawalTemplateUpdateInput = z.infer<typeof withdrawalTemplateUpdateSchema>
