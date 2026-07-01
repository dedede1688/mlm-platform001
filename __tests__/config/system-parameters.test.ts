import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  // 用对象存数据,可以每个测试前清空
  data: new Map<string, { value: string } | null>(),
  upsertCalls: [] as any[],
  logCalls: [] as any[],
}))

// 统一的 systemConfig mock:用动态实现
vi.mock('@/lib/prisma', () => ({
  prisma: {
    systemConfig: {
      findUnique: vi.fn(async ({ where }: any) => {
        return mocks.data.get(where.key) ?? null
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        mocks.upsertCalls.push({ where, create, update })
        return { key: where.key, value: create?.value ?? update?.value }
      }),
    },
    operationLog: {
      create: vi.fn(async ({ data }: any) => {
        mocks.logCalls.push(data)
        return data
      }),
    },
    $transaction: vi.fn(async (cb: any) => cb({
      systemConfig: {
        findUnique: vi.fn(async ({ where }: any) => mocks.data.get(where.key) ?? null),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          mocks.upsertCalls.push({ where, create, update })
          return { key: where.key, value: create?.value ?? update?.value }
        }),
      },
      operationLog: {
        create: vi.fn(async ({ data }: any) => {
          mocks.logCalls.push(data)
          return data
        }),
      },
    })),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('system-parameters', () => {
  let mod: typeof import('@/lib/config/system-parameters')

  beforeEach(async () => {
    // v60.3: 重置 module + 数据 + 调用历史
    vi.resetModules()
    mocks.data.clear()
    mocks.upsertCalls.length = 0
    mocks.logCalls.length = 0
    mod = await import('@/lib/config/system-parameters')
  })

  describe('getSystemParameter', () => {
    it('returns cached value on second call (within TTL)', async () => {
      mocks.data.set('auto_confirm_days', { value: '7' })

      const first = await mod.getSystemParameter('auto_confirm_days')
      expect(first).toBe(7)

      // 改 mock 数据,但缓存优先
      mocks.data.set('auto_confirm_days', { value: '999' })

      const second = await mod.getSystemParameter('auto_confirm_days')
      expect(second).toBe(7)
    })

    it('returns default value when no row in DB', async () => {
      // 不设数据,默认 null
      const result = await mod.getSystemParameter('refund_window_days')
      expect(result).toBe(7)
    })

    it('returns true when row.value is "true"', async () => {
      mocks.data.set('feature.points_transfer_enabled', { value: 'true' })

      const result = await mod.getSystemParameter('feature.points_transfer_enabled')
      expect(result).toBe(true)
    })

    it('returns false when row.value is "false"', async () => {
      mocks.data.set('feature.points_transfer_enabled', { value: 'false' })

      const result = await mod.getSystemParameter('feature.points_transfer_enabled')
      expect(result).toBe(false)
    })

    it('converts string number to number type', async () => {
      mocks.data.set('upgrade.points_per_box', { value: '600' })

      const result = await mod.getSystemParameter('upgrade.points_per_box')
      expect(result).toBe(600)
      expect(typeof result).toBe('number')
    })

    it('falls back to defaultValue when NaN conversion', async () => {
      mocks.data.set('upgrade.points_per_box', { value: 'not-a-number' })

      const result = await mod.getSystemParameter('upgrade.points_per_box')
      expect(result).toBe(500)
    })
  })

  describe('setSystemParameter - number', () => {
    it('throws when value below min', async () => {
      await expect(
        mod.setSystemParameter('auto_confirm_days', -1, 'admin-1')
      ).rejects.toThrow('必须在')
    })

    it('throws when value above max', async () => {
      await expect(
        mod.setSystemParameter('auto_confirm_days', 100, 'admin-1')
      ).rejects.toThrow('必须在')
    })

    it('upserts when value in valid range', async () => {
      await mod.setSystemParameter('auto_confirm_days', 10, 'admin-1')

      expect(mocks.upsertCalls.length).toBeGreaterThan(0)
      const call = mocks.upsertCalls[0]
      expect(call.where).toEqual({ key: 'auto_confirm_days' })
      expect(call.create).toMatchObject({ key: 'auto_confirm_days', value: '10' })
      expect(call.update).toMatchObject({ value: '10' })
    })

    it('writes operation log', async () => {
      await mod.setSystemParameter('auto_confirm_days', 10, 'admin-1')

      expect(mocks.logCalls.length).toBeGreaterThan(0)
      const log = mocks.logCalls[0]
      expect(log.userId).toBe('admin-1')
      expect(log.action).toBe('UPDATE')
      expect(log.module).toBe('system_config')
      expect(log.targetId).toBe('auto_confirm_days')
    })
  })

  describe('setSystemParameter - boolean', () => {
    it('upserts boolean true', async () => {
      await mod.setSystemParameter('feature.points_transfer_enabled', true, 'admin-1')

      expect(mocks.upsertCalls.length).toBeGreaterThan(0)
      expect(mocks.upsertCalls[0].create).toMatchObject({ value: 'true' })
      expect(mocks.upsertCalls[0].update).toMatchObject({ value: 'true' })
    })

    it('upserts boolean false', async () => {
      await mod.setSystemParameter('feature.points_transfer_enabled', false, 'admin-1')

      expect(mocks.upsertCalls[0].create).toMatchObject({ value: 'false' })
      expect(mocks.upsertCalls[0].update).toMatchObject({ value: 'false' })
    })
  })

  describe('setSystemParameter - cache invalidation', () => {
    it('invalidates cache after successful update', async () => {
      mocks.data.set('auto_confirm_days', { value: '7' })
      await mod.getSystemParameter('auto_confirm_days')

      await mod.setSystemParameter('auto_confirm_days', 10, 'admin-1')

      // 模拟 DB 现在返回 10
      mocks.data.set('auto_confirm_days', { value: '10' })

      const result = await mod.getSystemParameter('auto_confirm_days')
      expect(result).toBe(10)
    })
  })

  describe('getAllSystemParameters', () => {
    it('returns 30 system parameters', async () => {
      const result = await mod.getAllSystemParameters()

      expect(result.length).toBe(30)
      expect(result[0]).toHaveProperty('key')
      expect(result[0]).toHaveProperty('value')
      expect(result[0]).toHaveProperty('def')
    })

    it('covers all 7 groups', async () => {
      const result = await mod.getAllSystemParameters()

      const groups = new Set(result.map(p => p.def.group))
      expect(groups.size).toBe(7)
      expect(groups).toContain('time')
      expect(groups).toContain('reward')
      expect(groups).toContain('dividend')
      expect(groups).toContain('upgrade')
      expect(groups).toContain('feature')
      expect(groups).toContain('points')
      expect(groups).toContain('withdrawal')
    })

    it('uses default values when DB is empty', async () => {
      const result = await mod.getAllSystemParameters()

      // 没有数据时,应该返回默认值
      expect(result.find(p => p.key === 'auto_confirm_days')?.value).toBe(7)
      expect(result.find(p => p.key === 'reward.referral_rate')?.value).toBe(0.20)
      expect(result.find(p => p.key === 'feature.points_transfer_enabled')?.value).toBe(true)
    })
  })

  describe('SYSTEM_PARAMETERS self-check', () => {
    it('all number params have min/max', () => {
      for (const [key, def] of Object.entries(mod.SYSTEM_PARAMETERS)) {
        if (def.type === 'number') {
          expect(def.min, `${key} should have min`).toBeDefined()
          expect(def.max, `${key} should have max`).toBeDefined()
        }
      }
    })

    it('all boolean params have no min/max', () => {
      for (const [key, def] of Object.entries(mod.SYSTEM_PARAMETERS)) {
        if (def.type === 'boolean') {
          expect(def.min, `${key} should not have min`).toBeUndefined()
          expect(def.max, `${key} should not have max`).toBeUndefined()
        }
      }
    })

    it('all groups are valid', () => {
      const validGroups = ['time', 'reward', 'dividend', 'upgrade', 'feature', 'points', 'withdrawal']
      for (const [key, def] of Object.entries(mod.SYSTEM_PARAMETERS)) {
        expect(validGroups, `${key} has invalid group ${def.group}`).toContain(def.group)
      }
    })
  })
})