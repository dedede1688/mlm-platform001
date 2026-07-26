import { NextRequest } from 'next/server'
import { AddressService } from '@/lib/services/address.service'
import { verifyToken } from '@/lib/utils/auth'
import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'

// 字段校验
function validateAddressInput(body: Record<string, unknown>): { ok: true; data: Required<{ recipientName: string; phone: string; province: string; city: string; district: string; detailAddress: string; isDefault: boolean }> } | { ok: false; error: string } {
  const { recipientName, phone, province, city, district, detailAddress, isDefault } = body || {}

  if (!recipientName || typeof recipientName !== 'string' || recipientName.trim().length < 2 || recipientName.length > 20) {
    return { ok: false, error: '收件人姓名长度必须为 2-20 字' }
  }
  if (typeof phone !== 'string' || !/^1\d{10}$/.test(phone)) {
    return { ok: false, error: '手机号格式错误' }
  }
  if (typeof province !== 'string' || !province || typeof city !== 'string' || !city || typeof district !== 'string' || !district) {
    return { ok: false, error: '省/市/区不能为空' }
  }
  if (typeof detailAddress !== 'string' || detailAddress.trim().length < 5 || detailAddress.length > 100) {
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

    const addresses = await AddressService.getAddresses(user.userId)

    return successResponse(addresses)
  } catch (error) {
    logger.error('获取地址列表失败:', error)
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

    const address = await AddressService.createAddress(user.userId, data)

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
    logger.error('新建地址失败:', error)
    const message = error instanceof Error ? error.message : '新建地址失败'
    return errorResponse(message, 500)
  }
}
