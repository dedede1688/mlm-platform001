import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  })

  const mockPrisma: any = {
    product: createMockChain(),
  }
  return { prisma: mockPrisma }
})

import { prisma } from '@/lib/prisma'
import { ProductService } from '@/lib/services/product.service'

describe('ProductService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAllProducts', () => {
    it('should return all products ordered by sortOrder', async () => {
      const mockProducts = [
        { id: 'p1', name: 'Product A', sortOrder: 1 },
        { id: 'p2', name: 'Product B', sortOrder: 2 },
      ]
      prisma.product.findMany.mockResolvedValueOnce(mockProducts)

      const result = await ProductService.getAllProducts()

      expect(result).toEqual(mockProducts)
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        orderBy: { sortOrder: 'asc' },
      })
    })
  })

  describe('getProductById', () => {
    it('should return product by id', async () => {
      const mockProduct = { id: 'p1', name: 'Product A' }
      prisma.product.findUnique.mockResolvedValueOnce(mockProduct)

      const result = await ProductService.getProductById('p1')

      expect(result).toEqual(mockProduct)
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
      })
    })

    it('should return null when product not found', async () => {
      prisma.product.findUnique.mockResolvedValueOnce(null)

      const result = await ProductService.getProductById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('createProduct', () => {
    it('should create product with all fields', async () => {
      const productData = {
        name: 'Test Product',
        description: 'A test product',
        retailPrice: 100,
        memberPrice: 80,
        stock: 50,
        isUpgradeProduct: false,
      }
      const mockProduct = { id: 'p1', ...productData }
      prisma.product.create.mockResolvedValueOnce(mockProduct)

      const result = await ProductService.createProduct(productData)

      expect(result).toEqual(mockProduct)
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: productData,
      })
    })

    it('should create product with optional sortOrder', async () => {
      const productData = {
        name: 'Test',
        retailPrice: 100,
        memberPrice: 80,
        stock: 10,
        isUpgradeProduct: true,
        sortOrder: 5,
      }
      prisma.product.create.mockResolvedValueOnce({ id: 'p1', ...productData })

      await ProductService.createProduct(productData)

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: productData,
      })
    })
  })

  describe('updateProduct', () => {
    it('should update product with partial fields', async () => {
      const updateData = { retailPrice: 120, stock: 100 }
      const mockUpdated = { id: 'p1', name: 'Test', ...updateData }
      prisma.product.update.mockResolvedValueOnce(mockUpdated)

      const result = await ProductService.updateProduct('p1', updateData)

      expect(result).toEqual(mockUpdated)
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: updateData,
      })
    })
  })

  describe('deleteProduct', () => {
    it('should delete product by id', async () => {
      const mockDeleted = { id: 'p1', name: 'Test' }
      prisma.product.delete.mockResolvedValueOnce(mockDeleted)

      const result = await ProductService.deleteProduct('p1')

      expect(result).toEqual(mockDeleted)
      expect(prisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      })
    })
  })

  describe('adjustStock', () => {
    it('should increment stock by positive quantity', async () => {
      const mockUpdated = { id: 'p1', stock: 60 }
      prisma.product.update.mockResolvedValueOnce(mockUpdated)

      const result = await ProductService.adjustStock('p1', 10)

      expect(result).toEqual(mockUpdated)
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: 10 } },
      })
    })

    it('should decrement stock by negative quantity', async () => {
      const mockUpdated = { id: 'p1', stock: 40 }
      prisma.product.update.mockResolvedValueOnce(mockUpdated)

      const result = await ProductService.adjustStock('p1', -10)

      expect(result).toEqual(mockUpdated)
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { stock: { increment: -10 } },
      })
    })
  })
})