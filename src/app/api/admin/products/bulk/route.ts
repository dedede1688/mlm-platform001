import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { logOperation } from '@/lib/utils/operation-log'

// v53.2: 批量上下架 API
// 用途：admin 商品管理页多选后批量改 status
// 设计：
//   - 仅支持批量改 status（active/inactive），不做通用 updateMany
//   - 单次最多 200 个商品（防止超长事务）
//   - 已软删除的商品自动跳过
//   - 记录每条商品的操作日志

export async function PATCH(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['goods_admin', 'super_admin'])
    if (authError || !admin) return authError!

    const body = await request.json()
    const { ids, status } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, message: 'ids 必须为非空数组' },
        { status: 400 }
      )
    }

    if (!['active', 'inactive'].includes(status)) {
      return NextResponse.json(
        { success: false, message: 'status 只能为 active 或 inactive' },
        { status: 400 }
      )
    }

    // 限制批量操作数量，避免超长事务 / 超时
    if (ids.length > 200) {
      return NextResponse.json(
        { success: false, message: '单次最多批量操作 200 个商品' },
        { status: 400 }
      )
    }

    // 查询存在的商品（排除已软删除的）
    const existing = await prisma.product.findMany({
      where: {
        id: { in: ids as string[] },
        status: { not: 'deleted' },
      },
      select: { id: true, name: true, status: true },
    })

    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, message: '没有可操作的商品（可能都已删除）' },
        { status: 404 }
      )
    }

    // 批量更新
    const result = await prisma.product.updateMany({
      where: { id: { in: existing.map(p => p.id) } },
      data: { status },
    })

    // 记录操作日志（每条商品一条日志）
    await Promise.all(
      existing.map(p =>
        logOperation({
          userId: admin.id,
          action: 'UPDATE',
          module: 'product',
          targetId: p.id,
          oldValue: { status: p.status },
          newValue: { status },
          ip: request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
        })
      )
    )

    return NextResponse.json({
      success: true,
      data: {
        updated: result.count,
        requested: ids.length,
        skipped: ids.length - existing.length, // 不存在或已删除的
      },
      message: `已${status === 'active' ? '上架' : '下架'} ${result.count} 个商品${ids.length - existing.length > 0 ? `（${ids.length - existing.length} 个已跳过）` : ''}`,
    })
  } catch (error) {
    console.error('Admin bulk update products error:', error)
    return NextResponse.json(
      { success: false, message: '批量操作失败' },
      { status: 500 }
    )
  }
}
