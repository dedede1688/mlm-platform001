import { prisma } from '@/lib/prisma'

export class CategoryService {
  static async listAll() {
    return prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    })
  }

  static async findById(id: string) {
    return prisma.category.findUnique({ where: { id } })
  }

  static async create(data: { name: string; parentId?: string | null; sortOrder?: number }) {
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } })
      if (!parent) throw new Error('父分类不存在')
    }
    return prisma.category.create({
      data: {
        name: data.name.trim(),
        parentId: data.parentId || null,
        sortOrder: data.sortOrder ?? 0,
      },
    })
  }

  static async update(id: string, data: { name?: string; parentId?: string | null; sortOrder?: number }) {
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) throw new Error('分类不存在')
    if (data.parentId === id) throw new Error('不能将自身设为父分类')
    if (data.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: data.parentId } })
      if (!parent) throw new Error('父分类不存在')
    }
    return prisma.category.update({
      where: { id },
      data: {
        name: data.name?.trim() ?? undefined,
        parentId: data.parentId !== undefined ? (data.parentId || null) : undefined,
        sortOrder: data.sortOrder ?? undefined,
      },
    })
  }

  static async delete(id: string) {
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) throw new Error('分类不存在')
    const childCount = await prisma.category.count({ where: { parentId: id } })
    if (childCount > 0) throw new Error(`该分类下有 ${childCount} 个子分类，无法删除`)
    const productCount = await prisma.product.count({ where: { categoryId: id } })
    if (productCount > 0) throw new Error(`该分类下有 ${productCount} 个商品，无法删除`)
    return prisma.category.delete({ where: { id } })
  }
}
