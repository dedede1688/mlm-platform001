import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'

// 字段校验（部分字段可选更新）
function validatePartialAddressInput(body: any): { ok: true; data: Partial<{ recipientName: string; phone: string; province: string; city: string; district: string; detailAddress: string; isDefault: boolean }> } | { ok: false; error: string } {
  const data: any = {}

  if (body.recipientName !== undefined) {
    if (typeof body.recipientName !== 'string' || body.recipientName.trim().length < 2 || body.recipientName.length > 20) {
      return { ok: false, error: '收件人姓名长度必须为 2-20 字' }
    }
    data.recipientName = body.recipientName.trim()
  }
  if (body.phone !== undefined) {
    if (!/^1\d{10}$/.test(body.phone)) {
      return { ok: false, error: '手机号格式错误' }
    }
    data.phone = body.phone
  }
  if (body.province !== undefined) {
    if (!body.province) return { ok: false, error: '省不能为空' }
    data.province = body.province
  }
  if (body.city !== undefined) {
    if (!body.city) return { ok: false, error: '市不能为空' }
    data.city = body.city
  }
  if (body.district !== undefined) {
    if (!body.district) return { ok: false, error: '区不能为空' }
    data.district = body.district
  }
  if (body.detailAddress !== undefined) {
    if (typeof body.detailAddress !== 'string' || body.detailAddress.trim().length < 5 || body.detailAddress.length > 100) {
      return { ok: false, error: '详细地址长度必须为 5-100 字' }
    }
    data.detailAddress = body.detailAddress.trim()
  }
  if (body.isDefault !== undefined) {
    data.isDefault = body.isDefault === true
  }

  return { ok: true, data }
}

// PUT /api/user/addresses/[id] — 更新地址
// isDefault=true 时用事务保证默认地址唯一
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const { id } = await params

    // 验证地址所有权
    const existing = await prisma.address.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.userId) {
      return errorResponse('地址不存在', 404)
    }

    const body = await request.json()
    const validation = validatePartialAddressInput(body)
    if (!validation.ok) {
      return errorResponse(validation.error, 400)
    }
    const data = validation.data

    // 事务
    const address = await prisma.$transaction(async (tx) => {
      // 如果要设为默认，先把这个用户的其他地址都设为非默认
      if (data.isDefault === true) {
        await tx.address.updateMany({
          where: { userId: user.userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }

      return await tx.address.update({
        where: { id },
        data,
      })
    })

    await logOperation({
      userId: user.userId,
      action: 'UPDATE',
      module: 'user',
      targetId: address.id,
      oldValue: { recipientName: existing.recipientName, phone: existing.phone, isDefault: existing.isDefault },
      newValue: { recipientName: address.recipientName, phone: address.phone, isDefault: address.isDefault },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(address, '地址更新成功')
  } catch (error) {
    console.error('更新地址失败:', error)
    return errorResponse('更新地址失败', 500)
  }
}

// DELETE /api/user/addresses/[id] — 删除地址
// 如果删除的是默认地址，自动把最早创建的非默认地址提升为默认
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const { id } = await params

    const existing = await prisma.address.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.userId) {
      return errorResponse('地址不存在', 404)
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } })

      // 如果删除的是默认地址，提升最早创建的非默认地址
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId: user.userId },
          orderBy: { createdAt: 'asc' },
        })
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          })
        }
      }
    })

    await logOperation({
      userId: user.userId,
      action: 'DELETE',
      module: 'user',
      targetId: id,
      oldValue: { recipientName: existing.recipientName, isDefault: existing.isDefault },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(null, '地址删除成功')
  } catch (error) {
    console.error('删除地址失败:', error)
    return errorResponse('删除地址失败', 500)
  }
}