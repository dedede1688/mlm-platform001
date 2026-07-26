import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/logger'
import { UserService } from '@/lib/services/user.service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['support_admin', 'super_admin'])
    if (authError || !admin) return authError!
    const { id } = await params
    const user = await UserService.getUserById(id)
    if (!user || user.status === 'deleted') {
      return NextResponse.json({ success: false, message: '用户不存在' }, { status: 404 })
    }
    const tree = await UserService.buildReferralTree(id, 0, 3)
    return NextResponse.json({ success: true, data: tree, message: '获取推荐关系树成功' })
  } catch (error) {
    logger.error('Admin get referral tree error:', error)
    return NextResponse.json({ success: false, message: '获取推荐关系树失败' }, { status: 500 })
  }
}
