import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { AuthUser } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

const JWT_SECRET = process.env.JWT_SECRET!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('未提供认证令牌', 401)
    }

    const token = authHeader.substring(7)
    let payload: AuthUser
    try {
      payload = jwt.verify(token, JWT_SECRET) as AuthUser
    } catch {
      return errorResponse('令牌无效或已过期', 401)
    }

    const user = await UserService.getUserById(payload.userId)

    if (!user) {
      return errorResponse('用户不存在', 404)
    }

    return successResponse(user)
  } catch (error) {
    logger.error('Get current user error:', error)
    return errorResponse('获取用户信息失败', 500)
  }
}
