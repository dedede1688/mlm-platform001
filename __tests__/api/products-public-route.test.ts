import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'

function getRequest() {
  return new Request('http://localhost/api/products/product-1', {
    method: 'GET',
  })
}

describe('public product detail route - Batch 5A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps public GET available for storefront product detail', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValueOnce({
      id: 'product-1',
      name: '公开商品',
      status: 'active',
    } as any)

    const { GET } = await import('@/app/api/products/[id]/route')
    const response = await GET(getRequest() as any, {
      params: Promise.resolve({ id: 'product-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: {
        id: 'product-1',
        name: '公开商品',
        status: 'active',
      },
    })
    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'product-1' },
    })
  })

  it('does not export public PUT for product mutation', async () => {
    const routeModule = await import('@/app/api/products/[id]/route')

    expect(Object.prototype.hasOwnProperty.call(routeModule, 'PUT')).toBe(false)
    expect(prisma.product.update).not.toHaveBeenCalled()
  })

  it('does not export public DELETE for product deletion', async () => {
    const routeModule = await import('@/app/api/products/[id]/route')

    expect(Object.prototype.hasOwnProperty.call(routeModule, 'DELETE')).toBe(false)
    expect(prisma.product.delete).not.toHaveBeenCalled()
  })
})