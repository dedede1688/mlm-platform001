import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalRejectTemplateService } from '@/lib/services/withdrawal-reject-template.service'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    const body = await request.json()
    const { title, content, sortOrder, isEnabled } = body

    const template = await WithdrawalRejectTemplateService.update(id, {
      title,
      content,
      sortOrder,
      isEnabled,
    })

    return NextResponse.json({ success: true, data: template, message: '模板更新成功' })
  } catch (error: any) {
    console.error('Update reject template error:', error)
    return NextResponse.json({ success: false, message: error.message || '更新模板失败' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const { id } = await params
    await WithdrawalRejectTemplateService.delete(id)

    return NextResponse.json({ success: true, message: '模板删除成功' })
  } catch (error: any) {
    console.error('Delete reject template error:', error)
    return NextResponse.json({ success: false, message: error.message || '删除模板失败' }, { status: 500 })
  }
}