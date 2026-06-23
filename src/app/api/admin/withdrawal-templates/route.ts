import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { WithdrawalRejectTemplateService } from '@/lib/services/withdrawal-reject-template.service'

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError) return authError

    const templates = await WithdrawalRejectTemplateService.list()
    return NextResponse.json({ success: true, data: templates })
  } catch (error) {
    console.error('Get reject templates error:', error)
    return NextResponse.json({ success: false, message: '获取模板列表失败' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['finance_admin', 'super_admin'])
    if (authError || !admin) return authError

    const body = await request.json()
    const { title, content, sortOrder, isEnabled } = body

    if (!title || !content) {
      return NextResponse.json({ success: false, message: '标题和内容不能为空' }, { status: 400 })
    }

    const template = await WithdrawalRejectTemplateService.create({
      title,
      content,
      sortOrder,
      isEnabled,
    })

    return NextResponse.json({ success: true, data: template, message: '模板创建成功' })
  } catch (error) {
    console.error('Create reject template error:', error)
    return NextResponse.json({ success: false, message: '创建模板失败' }, { status: 500 })
  }
}