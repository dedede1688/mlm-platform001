import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const createMockChain = () => ({
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  })
  return { prisma: { withdrawalRejectTemplate: createMockChain() } }
})

import { prisma } from '@/lib/prisma'
import { WithdrawalRejectTemplateService } from '@/lib/services/withdrawal-reject-template.service'

describe('WithdrawalRejectTemplateService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should list all templates', async () => {
    const templates = [{ id: '1', title: 'T1', content: 'C1' }]
    prisma.withdrawalRejectTemplate.findMany.mockResolvedValueOnce(templates)
    const result = await WithdrawalRejectTemplateService.list()
    expect(result).toEqual(templates)
  })

  it('should list enabled templates only', async () => {
    const templates = [{ id: '1', title: 'T1', content: 'C1', isEnabled: true }]
    prisma.withdrawalRejectTemplate.findMany.mockResolvedValueOnce(templates)
    const result = await WithdrawalRejectTemplateService.list(true)
    expect(prisma.withdrawalRejectTemplate.findMany).toHaveBeenCalledWith({ where: { isEnabled: true }, orderBy: { sortOrder: 'asc' } })
  })

  it('should create a template', async () => {
    const created = { id: '1', title: 'T', content: 'C', sortOrder: 0, isEnabled: true }
    prisma.withdrawalRejectTemplate.create.mockResolvedValueOnce(created)
    const result = await WithdrawalRejectTemplateService.create({ title: 'T', content: 'C' })
    expect(result).toEqual(created)
  })

  it('should update a template', async () => {
    const updated = { id: '1', title: 'T2', content: 'C' }
    prisma.withdrawalRejectTemplate.update.mockResolvedValueOnce(updated)
    const result = await WithdrawalRejectTemplateService.update('1', { title: 'T2' })
    expect(result).toEqual(updated)
  })

  it('should delete a template', async () => {
    prisma.withdrawalRejectTemplate.delete.mockResolvedValueOnce({})
    await WithdrawalRejectTemplateService.delete('1')
    expect(prisma.withdrawalRejectTemplate.delete).toHaveBeenCalledWith({ where: { id: '1' } })
  })
})