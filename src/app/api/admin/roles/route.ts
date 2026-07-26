import { NextRequest } from 'next/server'
import { SettingsService } from '@/lib/services/settings.service'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { ROLE_MENUS, MENU_ITEMS } from '@/lib/admin-menu'

const STORAGE_KEY = 'role_menus'

function getDefaultConfig() {
  return JSON.parse(JSON.stringify(ROLE_MENUS))
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
    menuItems: MENU_ITEMS.map(item => ({
      id: item.id,
      name: item.name,
      path: item.path,
    })),
  })
}

export async function PUT(request: NextRequest) {
  const { user, error } = await verifyPermission(request, ['super_admin'])
  if (error || !user) return error || errorResponse('权限不足', 403)

  let body: { config: Record<string, string[]> }
  try {
    body = await request.json()
  } catch {
    return errorResponse('请求体格式错误', 400)
  }

  if (!body.config || typeof body.config !== 'object') {
    return errorResponse('config 字段缺失或格式错误', 400)
  }

  const validMenuIds = new Set(MENU_ITEMS.map(m => m.id))
  for (const [role, menuIds] of Object.entries(body.config)) {
    if (!Array.isArray(menuIds)) {
      return errorResponse(`角色 ${role} 的菜单列表必须是数组`, 400)
    }
    for (const menuId of menuIds) {
      if (!validMenuIds.has(menuId)) {
        return errorResponse(`角色 ${role} 包含无效菜单 ID: ${menuId}`, 400)
      }
    }
  }

  try {
    await SettingsService.saveConfig(
      STORAGE_KEY,
      JSON.stringify(body.config),
      '各角色可访问的菜单 ID 列表(super_admin 可视化配置)',
      user.id,
    )
    return successResponse({ config: body.config }, '保存成功')
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : '保存失败', 500)
  }
}
