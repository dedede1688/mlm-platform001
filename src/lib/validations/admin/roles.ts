import { z } from "zod"

export const roleMenusConfigSchema = z.object({
  config: z.record(z.string(), z.array(z.string()), { message: "config 字段缺失或格式错误" }),
})

export type RoleMenusConfigInput = z.infer<typeof roleMenusConfigSchema>
