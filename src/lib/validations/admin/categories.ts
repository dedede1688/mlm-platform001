import { z } from "zod"

export const categoryCreateSchema = z.object({
  name: z.string().min(1, "分类名称必填"),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
})

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>
