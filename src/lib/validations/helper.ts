import { ZodSchema, ZodError } from "zod"
import { NextResponse } from "next/server"
import { errorResponse } from "@/lib/api-response"

/**
 * 格式化 ZodError 为人类可读的错误消息
 * 优先返回中文 path 描述
 */
function formatZodError(error: ZodError): string {
  const issue = error.issues[0]
  const path = issue.path.length > 0 ? issue.path.join(".") : ""
  if (path) {
    return `${path}: ${issue.message}`
  }
  return issue.message
}

/**
 * parseBody —— 用 Zod schema 校验 request body
 * @returns { data, error } —— data 是类型安全的解析结果，error 是可直接 return 的 NextResponse
 *
 * 用法：
 *   const { data, error } = await parseBody(schema, request)
 *   if (error) return error
 */
export async function parseBody<T>(
  schema: ZodSchema<T>,
  request: Request
): Promise<
  | { data: T; error?: undefined }
  | { data?: undefined; error: NextResponse }
> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { error: errorResponse("请求体格式错误，需要有效的 JSON", 400) }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    return { error: errorResponse(formatZodError(result.error), 400) }
  }

  return { data: result.data }
}

/**
 * parseQuery —— 用 Zod schema 校验 URL searchParams
 * @returns { data, error } —— data 是类型安全的解析结果，error 是可直接 return 的 NextResponse
 */
export function parseQuery<T>(
  schema: ZodSchema<T>,
  searchParams: URLSearchParams
): { data: T; error?: undefined } | { data?: undefined; error: NextResponse } {
  // 将 searchParams 转换为普通对象
  const raw: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    raw[key] = value
  })

  // 用 preprocess 将字符串转为预期类型（由 schema 内部处理）
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { error: errorResponse(formatZodError(result.error), 400) }
  }

  return { data: result.data }
}

/**
 * parseParams —— 用 Zod schema 校验路由动态参数（如 [id]）
 */
export function parseParams<T>(
  schema: ZodSchema<T>,
  params: Record<string, string | string[] | undefined>
): { data: T; error?: undefined } | { data?: undefined; error: NextResponse } {
  const result = schema.safeParse(params)
  if (!result.success) {
    return { error: errorResponse(formatZodError(result.error), 400) }
  }
  return { data: result.data }
}
