import { NextRequest } from 'next/server'
import { SettingsService } from '@/lib/services/settings.service'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { DEFAULT_ROLE_PERMISSIONS, ACTIONS, Action } from '@/lib/admin-permissions'
import { parseBody } from '@/lib/validations/helper'
import { rolePermissionsConfigSchema } from '@/lib/validations/admin/role-permissions'

const STORAGE_KEY = 'role_permissions'

function getDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS))
}

export async function GET(request: NextRequest) {
  const { user, error } = await verifyPermission(request, [
    'super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor',
  ])
  if (error || !user) return error || errorResponse('未授权', 401)

  const dbConfig = await SettingsService.getConfig(STORAGE_KEY)
  const config = dbConfig || getDefaultConfig()
  return successResponse({
    config,
    isCustomized: !!dbConfig,
    actions: ACTIONS,
  })
}

export async function PUT(request: NextRequest) {
  const { user, error } = await verifyPermission(request, ['super_admin'])
  if (error || !user) return error || errorResponse('权限不足', 403)

  const { data: body, error: parseError } = await parseBody(rolePermissionsConfigSchema, request)
  if (parseError) return parseError

  // 额外业务校验：操作合法性（Zod 无法表达的业务规则）
  for (const [role, actions] of Object.entries(body.config)) {
    for (const action of actions) {
      if (!ACTIONS.includes(action as Action)) {
        return errorResponse(`角色 ${role} 包含无效操作: ${action}`, 400)
      }
    }
  }

  try {
    await SettingsService.saveConfig(
      STORAGE_KEY,
      JSON.stringify(body.config),
      '各角色可执行的操作权限(super_admin 可视化配置)',
      user.id,
    )
    return successResponse({ config: body.config }, '保存成功')
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : '保存失败', 500)
  }
}
