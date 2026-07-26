import { z } from "zod"

export const rolePermissionsConfigSchema = z.object({
  config: z.record(z.string(), z.array(z.string()), { message: "config 字段缺失" }),
})

export type RolePermissionsConfigInput = z.infer<typeof rolePermissionsConfigSchema>
