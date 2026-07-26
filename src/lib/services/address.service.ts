import { prisma } from '@/lib/prisma'

const MAX_ADDRESSES_PER_USER = 20

export class AddressService {
  /**
   * D-6.3: 获取用户地址列表
   */
  static async getAddresses(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  }

  /**
   * D-6.3: 创建地址（含数量限制 + isDefault 事务）
   */
  static async createAddress(userId: string, data: {
    recipientName: string
    phone: string
    province: string
    city: string
    district: string
    detailAddress: string
    isDefault: boolean
  }) {
    const count = await prisma.address.count({ where: { userId } })
    if (count >= MAX_ADDRESSES_PER_USER) {
      throw Object.assign(new Error(`每个用户最多${MAX_ADDRESSES_PER_USER} 个地址`), { statusCode: 400 })
    }

    return prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        })
      }

      let isDefault = data.isDefault
      if (count === 0) {
        isDefault = true
      }

      return tx.address.create({
        data: {
          userId,
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
  }

  /**
   * D-6.4: 更新地址（含 isDefault 事务）
   */
  static async updateAddress(userId: string, id: string, data: Record<string, unknown>) {
    const existing = await prisma.address.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      throw Object.assign(new Error('地址不存在'), { statusCode: 404 })
    }

    return prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }
      return tx.address.update({ where: { id }, data })
    })
  }

  /**
   * D-6.4: 删除地址（含默认地址自动提升）
   */
  static async deleteAddress(userId: string, id: string) {
    const existing = await prisma.address.findUnique({ where: { id } })
    if (!existing || existing.userId !== userId) {
      throw Object.assign(new Error('地址不存在'), { statusCode: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } })
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        })
        if (next) {
          await tx.address.update({ where: { id: next.id }, data: { isDefault: true } })
        }
      }
    })
  }

}
