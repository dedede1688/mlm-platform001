import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { DEFAULT_ROLE_PERMISSIONS, ACTIONS, Action } from '@/lib/admin-permissions'

// v68:角色操作权限管理 API
// GET  拿当前 role_permissions 配置(优先 DB,fallback 默认)
// PUT  super_admin 更新 role_permissions(写 DB)

const STORAGE_KEY = 'role_permissions'

type RolePermissionsConfig = Record<string, Action[]>

function getDefaultConfig(): RolePermissionsConfig {
  return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS))
}

async function loadFromDb(): Promise<RolePermissionsConfig | null> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: STORAGE_KEY },
    })
    if (!row) return null
    const parsed = JSON.parse(row.value)
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed as RolePermissionsConfig
  } catch {
    return null
  }
}

async function saveToDb(config: RolePermissionsConfig, userId: string): Promise<void> {
  const value = JSON.stringify(config)
  await prisma.systemConfig.upsert({
    where: { key: STORAGE_KEY },
    create: {
      key: STORAGE_KEY,
      value,
      description: '各角色可执行的操作权限(super_admin 可视化配置)',
    },
    update: {
      value,
      description: '各角色可执行的操作权限(super_admin 可视化配置)',
    },
  })
  const { logOperation } = await import('@/lib/utils/operation-log')
  await logOperation({
    userId,
    action: 'UPDATE',
    module: 'setting',
    targetId: STORAGE_KEY,
  })
}

export async function GET(request: NextRequest) {
  const { user, error } = await verifyPermission(request, [
    'super_admin', 'goods_admin', 'finance_admin', 'support_admin', 'auditor',
  ])
  if (error || !user) return error || errorResponse('未授权', 401)

  const config = (await loadFromDb()) || getDefaultConfig()
  return successResponse({
    config,
    isCustomized: !!(await loadFromDb()),
    actions: ACTIONS,
  })
}

export async function PUT(request: NextRequest) {
  const { user, error } = await verifyPermission(request, ['super_admin'])
  if (error || !user) return error || errorResponse('权限不足', 403)

  let body: { config: RolePermissionsConfig }
  try {
    body = await request.json()
  } catch {
    return errorResponse('请求体格式错误', 400)
  }

  if (!body.config || typeof body.config !== 'object') {
    return errorResponse('config 字段缺失', 400)
  }

  for (const [role, actions] of Object.entries(body.config)) {
    if (!Array.isArray(actions)) {
      return errorResponse(`角色 ${role} 的权限列表必须是数组`, 400)
    }
    for (const action of actions) {
      if (!ACTIONS.includes(action as Action)) {
        return errorResponse(`角色 ${role} 包含无效操作: ${action}`, 400)
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
