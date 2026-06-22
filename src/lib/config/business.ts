import { prisma } from '@/lib/prisma'

let cache: Record<string, string> = {}
let cacheTime = 0
const CACHE_TTL = 60_000

async function loadCache() {
  if (Date.now() - cacheTime < CACHE_TTL) return
  const rows = await prisma.systemConfig.findMany({
    where: {
      OR: [
        { key: { startsWith: 'reward.' } },
        { key: { startsWith: 'dividend.' } },
        { key: { startsWith: 'upgrade.' } },
        { key: { startsWith: 'feature.' } },
        { key: { startsWith: 'points.' } },
      ],
    },
  })
  cache = Object.fromEntries(rows.map(r => [r.key, r.value]))
  cacheTime = Date.now()
}

export async function getBusinessConfig<T>(key: string, defaultValue: T): Promise<T> {
  await loadCache()
  const value = cache[key]
  if (value === undefined) return defaultValue
  try {
    return JSON.parse(value) as T
  } catch {
    if (typeof defaultValue === 'number') return Number(value) as any
    if (typeof defaultValue === 'boolean') return (value === 'true') as any
    return value as any
  }
}

export function invalidateBusinessConfigCache() {
  cacheTime = 0
}