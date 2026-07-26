import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { ProductService } from '@/lib/services/product.service'

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

    const result = await ProductService.bulkUpdateStatus(ids as string[], status as 'active' | 'inactive')

    if (result.updated === 0) {
      return NextResponse.json(
        { success: false, message: '没有可操作的商品（可能都已删除）' },
        { status: 404 }
      )
    }

    // 记录操作日志（每条商品一条日志）
    await Promise.all(
      result.products.map(p =>
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
        updated: result.updated,
        requested: result.requested,
        skipped: result.skipped,
      },
      message: `${status === 'active' ? '上架' : '下架'} ${result.updated} 个商品${result.skipped > 0 ? `，${result.skipped} 个已跳过` : ''}`,
    })
  } catch (error) {
    logger.error('Admin bulk update products error:', error)
    return NextResponse.json(
      { success: false, message: '批量操作失败' },
      { status: 500 }
    )
  }
}
