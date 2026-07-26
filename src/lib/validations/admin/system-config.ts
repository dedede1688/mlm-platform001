import { z } from "zod"

export const systemParameterSchema = z.object({
  key: z.string().min(1, "key 不能为空"),
  value: z.union([z.number(), z.boolean()]),
})

export type SystemParameterInput = z.infer<typeof systemParameterSchema>
