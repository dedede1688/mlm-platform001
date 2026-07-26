import { z } from "zod"

export const productsBulkSchema = z.object({
  ids: z.array(z.string()).min(1, "ids ???????").max(200, "???????? 200 ???"),
  status: z.enum(["active", "inactive"], { message: "status ??? active ? inactive" }),
})

export const productCreateSchema = z.object({
  name: z.string().min(1, "????????"),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  retailPrice: z.number().positive("???????0"),
  memberPrice: z.number().positive("???????0"),
  stock: z.number().int().min(0).default(0),
  isUpgradeProduct: z.boolean().default(false),
  maxPointsRatio: z.number().min(0).max(1).default(0),
  benefits: z.array(z.string(), { message: "benefits ????????" }).optional().nullable(),
  status: z.enum(["active", "inactive"], { message: "status ??? active ? inactive" }).default("inactive"),
  sortOrder: z.number().int().min(0).default(0),
  categoryId: z.string().optional().nullable(),
  specs: z.array(z.any(), { message: "specs ???????" }).optional().nullable(),
  research: z.any().optional().nullable(),
  images: z.array(z.string(), { message: "images ????????" }).optional().nullable(),
  videoUrl: z.string().optional().nullable(),
}).refine(data => data.memberPrice <= data.retailPrice, {
  message: "??????????",
  path: ["memberPrice"],
})

// PUT ????????????? memberPrice <= retailPrice ????????? existing ??
export const productUpdateSchema = z.object({
  name: z.string().min(1, "????????").optional(),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  retailPrice: z.number().positive("???????0").optional(),
  memberPrice: z.number().positive("???????0").optional(),
  stock: z.number().int().min(0).optional(),
  isUpgradeProduct: z.boolean().optional(),
  maxPointsRatio: z.number().min(0).optional(),
  benefits: z.array(z.string(), { message: "benefits ????????" }).optional().nullable(),
  status: z.enum(["active", "inactive"], { message: "status ??? active ? inactive" }).optional(),
  sortOrder: z.number().int().min(0).optional(),
  categoryId: z.string().optional().nullable(),
  specs: z.array(z.any(), { message: "specs ???????" }).optional().nullable(),
  research: z.any().optional().nullable(),
  images: z.array(z.string(), { message: "images ????????" }).optional().nullable(),
  videoUrl: z.string().optional().nullable(),
})

export type ProductsBulkInput = z.infer<typeof productsBulkSchema>
export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>
