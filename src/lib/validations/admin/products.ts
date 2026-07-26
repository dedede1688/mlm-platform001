import { z } from "zod"

export const productsBulkSchema = z.object({
  ids: z.array(z.string()).min(1, "ids 必须为非空数组").max(200, "单次最多批量操作 200 个商品"),
  status: z.enum(["active", "inactive"], { message: "status 只能为 active 或 inactive" }),
})

export type ProductsBulkInput = z.infer<typeof productsBulkSchema>
