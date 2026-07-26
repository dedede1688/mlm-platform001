import { z } from "zod"

export const bannerCreateSchema = z.object({
  imageUrl: z.string().min(1, "imageUrl 必填"),
  link: z.string().optional(),
  title: z.string().optional(),
  alt: z.string().optional(),
  order: z.number().optional(),
})

export const bannerItemSchema = z.object({
  imageUrl: z.string().min(1, "每条轮播图必须有 imageUrl"),
  link: z.string().optional(),
  title: z.string().optional(),
  alt: z.string().optional(),
  order: z.number().optional(),
})

export const bannerReplaceSchema = z.object({
  banners: z.array(bannerItemSchema),
})

export type BannerCreateInput = z.infer<typeof bannerCreateSchema>
export type BannerReplaceInput = z.infer<typeof bannerReplaceSchema>
