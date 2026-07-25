import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utils/admin-auth', () => ({
  verifyPermission: vi.fn(),
}))

vi.mock('@/lib/utils/operation-log', () => ({
  logOperation: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { logOperation } from '@/lib/utils/operation-log'

function jsonRequest(url: string, method: string, body: unknown = {}) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deniedAuth() {
  return {
    user: null,
    error: Response.json(
      { success: false, message: '权限不足' },
      { status: 403 }
    ),
  } as any
}

describe('admin product write auth - Batch 5A-1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('denies admin product create before database write', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce(deniedAuth())

    const { POST } = await import('@/app/api/admin/products/route')
    const response = await POST(jsonRequest('http://localhost/api/admin/products', 'POST') as any)

    expect(response.status).toBe(403)
    expect(verifyPermission).toHaveBeenCalledWith(
      expect.anything(),
      ['goods_admin', 'super_admin']
    )
    expect(prisma.product.create).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })

  it('denies admin product update before database write', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce(deniedAuth())

    const { PUT } = await import('@/app/api/admin/products/[id]/route')
    const response = await PUT(
      jsonRequest('http://localhost/api/admin/products/product-1', 'PUT') as any,
      { params: Promise.resolve({ id: 'product-1' }) }
    )

    expect(response.status).toBe(403)
    expect(verifyPermission).toHaveBeenCalledWith(
      expect.anything(),
      ['goods_admin', 'super_admin']
    )
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })

  it('denies admin product delete before database write', async () => {
    vi.mocked(verifyPermission).mockResolvedValueOnce(deniedAuth())

    const { DELETE } = await import('@/app/api/admin/products/[id]/route')
    const response = await DELETE(
      jsonRequest('http://localhost/api/admin/products/product-1', 'DELETE') as any,
      { params: Promise.resolve({ id: 'product-1' }) }
    )

    expect(response.status).toBe(403)
    expect(verifyPermission).toHaveBeenCalledWith(
      expect.anything(),
      ['goods_admin', 'super_admin']
    )
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(prisma.product.delete).not.toHaveBeenCalled()
    expect(logOperation).not.toHaveBeenCalled()
  })
})