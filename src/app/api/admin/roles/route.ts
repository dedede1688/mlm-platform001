import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { ROLE_MENUS, MENU_ITEMS } from '@/lib/admin-menu'

// v66:角色与权限管理 API
// GET  拿当前 role_menus 配置(优先 DB,fallback 默认)
// PUT  super_admin 更新 role_menus(写 DB)

const STORAGE_KEY = 'role_menus'

interface RoleMenuConfig {
  [role: string]: string[]  // role -> menuIds
}

function getDefaultConfig(): RoleMenuConfig {
  // 拷贝默认 ROLE_MENUS 作为兜底
  return JSON.parse(JSON.stringify(ROLE_MENUS))
}

async function loadFromDb(): Promise<RoleMenuConfig | null> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: STORAGE_KEY },
    })
    if (!row) return null
    const parsed = JSON.parse(row.value)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as RoleMenuConfig
  } catch {
    return null
  }
}

async function saveToDb(config: RoleMenuConfig, userId: string): Promise<void> {
  const value = JSON.stringify(config)
  await prisma.systemConfig.upsert({
    where: { key: STORAGE_KEY },
    create: {
      key: STORAGE_KEY,
      value,
      description: '各角色可访问的菜单 ID 列表(super_admin 可视化配置)',
    },
    update: {
      value,
      description: '各角色可访问的菜单 ID 列表(super_admin 可视化配置)',
    },
  })
  // 记录操作日志
  const { logOperation } = await import('@/lib/utils/operation-log')
  await logOperation({
    userId,
    action: 'UPDATE',
    module: 'setting',  // 角色权限归"系统设置"类
    targetId: STORAGE_KEY,
  })
}

export async function GET(request: NextRequest) {
  // 所有登录的 admin 都能读(因为 layout 要用)
  const { user, error } = await verifyPermission(request, [
    'super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor',
  ])
  if (error || !user) return error || errorResponse('未授权', 401)

  // 优先 DB,fallback 默认
  const config = (await loadFromDb()) || getDefaultConfig()
  return successResponse({
    config,
    isCustomized: !!(await loadFromDb()),
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

  let body: { config: RoleMenuConfig }
  try {
    body = await request.json()
  } catch {
    return errorResponse('请求体格式错误', 400)
  }

  if (!body.config || typeof body.config !== 'object') {
    return errorResponse('config 字段缺失或格式错误', 400)
  }

  // 校验:每个 role 必须是字符串数组,且每个 menuId 必须在 MENU_ITEMS 里
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
    await saveToDb(body.config, user.id)
    return successResponse({ config: body.config }, '保存成功')
  } catch (err: any) {
    return errorResponse(err.message || '保存失败', 500)
  }
}
