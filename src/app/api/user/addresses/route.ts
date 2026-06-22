import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'

// 限制：每个用户最多 20 个地址
const MAX_ADDRESSES_PER_USER = 20

// 字段校验
function validateAddressInput(body: any): { ok: true; data: Required<{ recipientName: string; phone: string; province: string; city: string; district: string; detailAddress: string; isDefault: boolean }> } | { ok: false; error: string } {
  const { recipientName, phone, province, city, district, detailAddress, isDefault } = body || {}

  if (!recipientName || typeof recipientName !== 'string' || recipientName.trim().length < 2 || recipientName.length > 20) {
    return { ok: false, error: '收件人姓名长度必须为 2-20 字' }
  }
  if (!phone || !/^1\d{10}$/.test(phone)) {
    return { ok: false, error: '手机号格式错误' }
  }
  if (!province || !city || !district) {
    return { ok: false, error: '省/市/区不能为空' }
  }
  if (!detailAddress || detailAddress.trim().length < 5 || detailAddress.length > 100) {
    return { ok: false, error: '详细地址长度必须为 5-100 字' }
  }
  return {
    ok: true,
    data: {
      recipientName: recipientName.trim(),
      phone,
      province: province.trim(),
      city: city.trim(),
      district: district.trim(),
      detailAddress: detailAddress.trim(),
      isDefault: isDefault === true,
    },
  }
}

// GET /api/user/addresses — 列出当前用户所有地址
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const addresses = await prisma.address.findMany({
      where: { userId: user.userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })

    return successResponse(addresses)
  } catch (error) {
    console.error('获取地址列表失败:', error)
    return errorResponse('获取地址列表失败', 500)
  }
}

// POST /api/user/addresses — 新建地址
// isDefault=true 时用事务保证默认地址唯一
export async function POST(request: NextRequest) {
  try {
    const user = await verifyToken(request)
    if (!user) {
      return errorResponse('未登录', 401)
    }

    const body = await request.json()
    const validation = validateAddressInput(body)
    if (!validation.ok) {
      return errorResponse(validation.error, 400)
    }
    const data = validation.data

    // 检查数量限制
    const count = await prisma.address.count({ where: { userId: user.userId } })
    if (count >= MAX_ADDRESSES_PER_USER) {
      return errorResponse(`每个用户最多 ${MAX_ADDRESSES_PER_USER} 个地址`, 400)
    }

    // 事务：如果 isDefault，先把这个用户的其他地址都设为非默认
    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({
          where: { userId: user.userId, isDefault: true },
          data: { isDefault: false },
        })
      }

      // 如果是第一个地址，自动设为默认
      let isDefault = data.isDefault
      if (count === 0) {
        isDefault = true
      }

      return await tx.address.create({
        data: {
          userId: user.userId,
          recipientName: data.recipientName,
          phone: data.phone,
          province: data.province,
          city: data.city,
          district: data.district,
          detailAddress: data.detailAddress,
          isDefault,
        },
      })
    })

    await logOperation({
      userId: user.userId,
      action: 'CREATE',
      module: 'user',
      targetId: address.id,
      newValue: { recipientName: address.recipientName, phone: address.phone, province: address.province, isDefault: address.isDefault },
      ip: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    return successResponse(address, '地址添加成功')
  } catch (error) {
    console.error('新建地址失败:', error)
    return errorResponse('新建地址失败', 500)
  }
}