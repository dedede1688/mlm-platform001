import { prisma } from '@/lib/prisma'

export class ProductService {
  // 获取所有产品
  static async getAllProducts() {
    return prisma.product.findMany({
      orderBy: { sortOrder: 'asc' },
    })
  }

  // 获取产品详情
  static async getProductById(id: string) {
    return prisma.product.findUnique({
      where: { id },
    })
  }

  // 创建产品
  static async createProduct(data: {
    name: string
    description?: string
    retailPrice: number
    memberPrice: number
    stock: number
    isUpgradeProduct: boolean
    sortOrder?: number
  }) {
    return prisma.product.create({
      data,
    })
  }

  // 更新产品
  static async updateProduct(
    id: string,
    data: {
      name?: string
      description?: string
      retailPrice?: number
      memberPrice?: number
      stock?: number
      isUpgradeProduct?: boolean
      sortOrder?: number
    }
  ) {
    return prisma.product.update({
      where: { id },
      data,
    })
  }

  // 删除产品
  static async deleteProduct(id: string) {
    return prisma.product.delete({
      where: { id },
    })
  }

  // 调整库存
  static async adjustStock(id: string, quantity: number) {
    return prisma.product.update({
      where: { id },
      data: {
        stock: {
          increment: quantity,
        },
      },
    })
  }
}