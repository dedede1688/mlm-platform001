import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import {
  getAllSystemParameters, setSystemParameter,
  SYSTEM_PARAMETERS, SystemParameterKey,
} from '@/lib/config/system-parameters'

export async function GET(request: NextRequest) {
  const { error } = await verifyPermission(request, ['super_admin'])
  if (error) return error
  const params = await getAllSystemParameters()
  return successResponse({ parameters: params })
}

export async function PUT(request: NextRequest) {
  const { user, error } = await verifyPermission(request, ['super_admin'])
  if (error || !user) return error || errorResponse('权限不足', 403)
  const { key, value } = await request.json() as { key: SystemParameterKey; value: number }
  if (!key || !SYSTEM_PARAMETERS[key]) return errorResponse('无效的 key', 400)
  if (typeof value !== 'number' || isNaN(value)) return errorResponse('value 必须是数字', 400)
  try {
    await setSystemParameter(key, value, user.id)
    return successResponse({ key, value }, '更新成功')
  } catch (err: any) {
    return errorResponse(err.message || '更新失败', 400)
  }
}