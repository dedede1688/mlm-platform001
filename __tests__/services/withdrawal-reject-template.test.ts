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

  describe('list', () => {
    it('should list all templates (default enabledOnly=false)', async () => {
      const templates = [{ id: '1', title: 'T1', content: 'C1' }]
      prisma.withdrawalRejectTemplate.findMany.mockResolvedValueOnce(templates)
      const result = await WithdrawalRejectTemplateService.list()
      expect(result).toEqual(templates)
      // 当 enabledOnly=false,where 应该是 undefined
      expect(prisma.withdrawalRejectTemplate.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { sortOrder: 'asc' },
      })
    })

    it('should list enabled templates only when enabledOnly=true', async () => {
      const templates = [{ id: '1', title: 'T1', content: 'C1', isEnabled: true }]
      prisma.withdrawalRejectTemplate.findMany.mockResolvedValueOnce(templates)
      const result = await WithdrawalRejectTemplateService.list(true)
      expect(prisma.withdrawalRejectTemplate.findMany).toHaveBeenCalledWith({
        where: { isEnabled: true },
        orderBy: { sortOrder: 'asc' },
      })
      expect(result).toEqual(templates)
    })
  })

  describe('create', () => {
    it('should create with default sortOrder=0 and isEnabled=true', async () => {
      const created = { id: '1', title: 'T', content: 'C', sortOrder: 0, isEnabled: true }
      prisma.withdrawalRejectTemplate.create.mockResolvedValueOnce(created)
      const result = await WithdrawalRejectTemplateService.create({ title: 'T', content: 'C' })
      expect(result).toEqual(created)
      expect(prisma.withdrawalRejectTemplate.create).toHaveBeenCalledWith({
        data: {
          title: 'T',
          content: 'C',
          sortOrder: 0, // default
          isEnabled: true, // default
        },
      })
    })

    it('should create with explicit sortOrder and isEnabled=false', async () => {
      const created = { id: '2', title: 'T2', content: 'C2', sortOrder: 10, isEnabled: false }
      prisma.withdrawalRejectTemplate.create.mockResolvedValueOnce(created)
      const result = await WithdrawalRejectTemplateService.create({
        title: 'T2',
        content: 'C2',
        sortOrder: 10,
        isEnabled: false,
      })
      expect(result).toEqual(created)
      expect(prisma.withdrawalRejectTemplate.create).toHaveBeenCalledWith({
        data: {
          title: 'T2',
          content: 'C2',
          sortOrder: 10,
          isEnabled: false,
        },
      })
    })

    it('should create with only sortOrder specified', async () => {
      prisma.withdrawalRejectTemplate.create.mockResolvedValueOnce({ id: '3' } as any)
      await WithdrawalRejectTemplateService.create({
        title: 'T3',
        content: 'C3',
        sortOrder: 5,
      })
      expect(prisma.withdrawalRejectTemplate.create).toHaveBeenCalledWith({
        data: {
          title: 'T3',
          content: 'C3',
          sortOrder: 5,
          isEnabled: true, // 默认值
        },
      })
    })

    it('should create with only isEnabled specified', async () => {
      prisma.withdrawalRejectTemplate.create.mockResolvedValueOnce({ id: '4' } as any)
      await WithdrawalRejectTemplateService.create({
        title: 'T4',
        content: 'C4',
        isEnabled: false,
      })
      expect(prisma.withdrawalRejectTemplate.create).toHaveBeenCalledWith({
        data: {
          title: 'T4',
          content: 'C4',
          sortOrder: 0, // 默认值
          isEnabled: false,
        },
      })
    })
  })

  describe('update', () => {
    it('should update with title only', async () => {
      const updated = { id: '1', title: 'T2' }
      prisma.withdrawalRejectTemplate.update.mockResolvedValueOnce(updated)
      const result = await WithdrawalRejectTemplateService.update('1', { title: 'T2' })
      expect(result).toEqual(updated)
      expect(prisma.withdrawalRejectTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { title: 'T2' },
      })
    })

    it('should update with all fields', async () => {
      prisma.withdrawalRejectTemplate.update.mockResolvedValueOnce({ id: '1' } as any)
      await WithdrawalRejectTemplateService.update('1', {
        title: 'T',
        content: 'C',
        sortOrder: 20,
        isEnabled: false,
      })
      expect(prisma.withdrawalRejectTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { title: 'T', content: 'C', sortOrder: 20, isEnabled: false },
      })
    })
  })

  describe('delete', () => {
    it('should delete by id', async () => {
      prisma.withdrawalRejectTemplate.delete.mockResolvedValueOnce({})
      await WithdrawalRejectTemplateService.delete('1')
      expect(prisma.withdrawalRejectTemplate.delete).toHaveBeenCalledWith({ where: { id: '1' } })
    })
  })
})