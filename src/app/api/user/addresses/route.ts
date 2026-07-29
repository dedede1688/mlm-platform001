import { NextRequest } from 'next/server'
import { AddressService } from '@/lib/services/address.service'
import { verifyToken } from '@/lib/utils/auth'

import { errorResponse, successResponse } from '@/lib/api-response'
import { logOperation } from '@/lib/utils/operation-log'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { parseBody } from '@/lib/validations/helper'

const addressSchema = z.object({
  recipientName: z.string().min(2, '?????????? 2-20 ?').max(20, '?????????? 2-20 ?'),
  phone: z.string().regex(/^1\d{10}$/, '???????'),
  province: z.string().min(1, '?????'),
  city: z.string().min(1, '?????'),
  district: z.string().min(1, '?????'),
  detailAddress: z.string().min(5, '????????? 5-100 ?').max(100, '????????? 5-100 ?'),
  isDefault: z.boolean().optional().default(false),
})


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

    const { data, error } = await parseBody(addressSchema, request)
    if (error) return error

    const address = await AddressService.createAddress(user.userId, {
      recipientName: data.recipientName,
      phone: data.phone,
      province: data.province,
      city: data.city,
      district: data.district,
      detailAddress: data.detailAddress,
      isDefault: data.isDefault,
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
    logger.error('新建地址失败:', error)
    const message = error instanceof Error ? error.message : '新建地址失败'
    return errorResponse(message, 500)
  }
}
