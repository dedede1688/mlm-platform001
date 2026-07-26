import { NextRequest } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import {
  getAllSystemParameters, setSystemParameter,
  SYSTEM_PARAMETERS, SystemParameterKey,
} from '@/lib/config/system-parameters'
import { parseBody } from '@/lib/validations/helper'
import { systemParameterSchema } from '@/lib/validations/admin/system-config'

export async function GET(request: NextRequest) {
  const { error } = await verifyPermission(request, ['super_admin'])
  if (error) return error
  const params = await getAllSystemParameters()
  return successResponse({ parameters: params })
}

export async function PUT(request: NextRequest) {
  const { user, error } = await verifyPermission(request, ['super_admin'])
  if (error || !user) return error || errorResponse('权限不足', 403)

  const { data: body, error: parseError } = await parseBody(systemParameterSchema, request)
  if (parseError) return parseError

  // 额外业务校验：key 是否在 SYSTEM_PARAMETERS 注册表中
  if (!SYSTEM_PARAMETERS[body.key as SystemParameterKey]) {
    return errorResponse('无效的 key', 400)
  }

  const def = SYSTEM_PARAMETERS[body.key as SystemParameterKey]

  // v50 C: 类型校验（支持 number + boolean）
  if (def.type === 'number') {
    if (typeof body.value !== 'number' || isNaN(body.value)) {
      return errorResponse('value 必须是数字', 400)
    }
  } else if (def.type === 'boolean') {
    if (typeof body.value !== 'boolean') {
      return errorResponse('value 必须是 boolean', 400)
    }
  }

  try {
    await setSystemParameter(body.key as SystemParameterKey, body.value, user.id)
    return successResponse({ key: body.key, value: body.value }, '更新成功')
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : '更新失败', 400)
  }
}
