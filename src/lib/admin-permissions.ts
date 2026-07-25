// v68:操作级权限字典 + 工具函数
// 5 档权限:view / create / update / delete / approve

export const ACTIONS = ['view', 'create', 'update', 'delete', 'approve'] as const
export type Action = typeof ACTIONS[number]

export const ACTION_LABELS: Record<Action, string> = {
  view: '查看',
  create: '创建',
  update: '更新',
  delete: '删除',
  approve: '审批',
}

export const ACTION_DESCRIPTIONS: Record<Action, string> = {
  view: '看数据,不能改',
  create: '能新建(订单/商品/退款申请)',
  update: '能修改(改价/改状态)',
  delete: '能删除(危险!)',
  approve: '能审批通过/拒绝(退款/提现/发货)',
}

// v68:角色默认操作权限(轻量版,后续 super_admin 可在页面调整)
// 财务管理员:view + approve(看数据 + 审核,但不能删数据)
// 客服管理员:view only(只能看,不能改)
// 审计员:view only
// 超级管理员:全部
// 商品管理员:view + create + update + delete(完整商品管理)
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Action[]> = {
  super_admin: ['view', 'create', 'update', 'delete', 'approve'],
  goods_admin: ['view', 'create', 'update', 'delete'],
  finance_admin: ['view', 'approve'],
  support_admin: ['view'],
  auditor: ['view'],
}

/** 检查角色是否有某个操作权限 */
export function hasPermission(role: string | null | undefined, action: Action): boolean {
  if (!role) return false
  // v68.10:super_admin 永远 ALL(防自锁 — DB 配 [] / ['view'] 等任意值都不会影响超管)
  if (role === 'super_admin') return true
  // v68:支持从 DB 覆盖(由 layout 注入)
  const perms = (window as any).__ROLE_PERMISSIONS__?.[role] || DEFAULT_ROLE_PERMISSIONS[role] || []
  return perms.includes(action)
}

/** 检查角色是否有任一操作权限(用于条件渲染按钮) */
export function hasAnyPermission(role: string | null | undefined, actions: Action[]): boolean {
  if (!role) return false
  return actions.some(a => hasPermission(role, a))
}

/** 获取角色的所有操作权限 */
export function getAllowedActions(role: string | null | undefined): Action[] {
  if (!role) return []
  // v68.10:super_admin 永远返回完整 5 档
  if (role === 'super_admin') return ['view', 'create', 'update', 'delete', 'approve']
  return (window as any).__ROLE_PERMISSIONS__?.[role] || DEFAULT_ROLE_PERMISSIONS[role] || []
}
