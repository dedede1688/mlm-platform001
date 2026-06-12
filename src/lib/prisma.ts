import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 构建 datasources URL：在 DATABASE_URL 基础上追加连接池兼容参数
function buildDatasourceUrl(): string {
  const baseUrl = process.env.DATABASE_URL || ''
  if (!baseUrl) return baseUrl

  const params = 'prepared_statements=false&pgbouncer=true&statement_cache_size=0'
  // 如果 URL 已有查询参数，用 & 连接；否则用 ?
  const separator = baseUrl.includes('?') ? '&' : '?'
  return baseUrl + separator + params
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: buildDatasourceUrl(),
    },
  },
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
