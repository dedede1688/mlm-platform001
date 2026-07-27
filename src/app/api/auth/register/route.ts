import { NextRequest } from "next/server"
import { UserService } from "@/lib/services/user.service"
import { errorResponse, successResponse } from "@/lib/api-response"
import { AppErrorCode } from "@/lib/utils/error-codes"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { parseBody } from "@/lib/validations/helper"
import { checkRateLimit, getClientIP, rateLimitResponse } from "@/lib/utils/rate-limit"
import { handlePrismaError } from "@/lib/utils/prisma-errors"
import { logger } from "@/lib/logger"

const registerSchema = z.object({
  phone: z
    .string()
    .min(1, "手机号不能为空")
    .regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  password: z
    .string()
    .min(1, "密码不能为空")
    .min(8, "密码长度至少8位")
    .regex(/[a-zA-Z]/, "密码必须包含字母")
    .regex(/[0-9]/, "密码必须包含数字"),
  nickname: z
    .string()
    .min(2, "昵称长度必须在2-20个字符之间")
    .max(20, "昵称长度必须在2-20个字符之间")
    .optional()
    .or(z.literal("")),
  referrerCode: z
    .string()
    .optional()
    .or(z.literal("")),
})

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request)
    const ipLimitResult = await checkRateLimit(`register:ip:${clientIP}`, 3, 60 * 1000)
    if (!ipLimitResult.allowed) {
      return rateLimitResponse("注册请求过于频繁，请稍后再试", ipLimitResult.resetIn)
    }

    const body = await request.json()
    const validationResult = registerSchema.safeParse(body)
    if (!validationResult.success) {
      const errors = validationResult.error.issues
      const firstError = errors[0]?.message || "输入参数错误"
      return errorResponse(firstError, 400, { code: AppErrorCode.VALIDATION_ERROR })
    }

    const { phone, password, nickname, referrerCode } = validationResult.data

    const existingUser = await UserService.findByPhone(phone)
    if (existingUser) {
      return errorResponse("该手机号已注册", 400, { code: AppErrorCode.RESOURCE_CONFLICT })
    }

    let referrerId: string | undefined
    if (referrerCode) {
      const referrer = await UserService.findByPhone(referrerCode)
        ?? await UserService.getUserById(referrerCode)
      if (referrer) {
        referrerId = referrer.id
      }
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await UserService.createUser({
      phone,
      passwordHash,
      nickname,
      referrerId,
    })

    return successResponse({
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      level: user.level,
    }, "注册成功")
  } catch (error) {
    const prismaErr = handlePrismaError(error)
    if (prismaErr) {
      return errorResponse(prismaErr.message, prismaErr.status, { code: AppErrorCode.RESOURCE_CONFLICT })
    }
    logger.error("Register error:", error)
    const errMsg = error instanceof Error ? error.message : "未知错误"
    return errorResponse(`注册失败：${errMsg}`, 500, { code: AppErrorCode.INTERNAL_ERROR })
  }
}
