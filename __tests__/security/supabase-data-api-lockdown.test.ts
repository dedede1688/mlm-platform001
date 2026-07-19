import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const tables = [
  '_prisma_migrations',
  'addresses',
  'balance_records',
  'banners',
  'carts',
  'categories',
  'dividends',
  'level_snapshots',
  'manual_rewards',
  'notification_batches',
  'notification_templates',
  'notifications',
  'operation_logs',
  'order_items',
  'orders',
  'points_records',
  'points_unlock_schedules',
  'products',
  'recharge_audit_logs',
  'recharge_reject_templates',
  'recharge_requests',
  'refund_requests',
  'rewards',
  'system_configs',
  'users',
  'withdrawal_audit_logs',
  'withdrawal_reject_templates',
  'withdrawals',
] as const

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20260719_lock_down_supabase_data_api/migration.sql',
)
const auditPath = resolve(
  process.cwd(),
  'scripts/audit-supabase-data-api.sql',
)

function migrationSql(): string {
  return readFileSync(migrationPath, 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function auditSql(): string {
  return readFileSync(auditPath, 'utf8')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

describe('Supabase 数据接口权限封锁迁移', () => {
  it('撤销每张已批准表的 anon 和 authenticated 权限', () => {
    const sql = migrationSql()
    for (const table of tables) {
      expect(sql).toContain(
        `revoke all privileges on table public.${table} from anon, authenticated;`,
      )
    }
  })

  it('为每张已批准表启用 RLS', () => {
    const sql = migrationSql()
    for (const table of tables) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security;`,
      )
    }
  })

  it('不放宽权限且不修改业务数据', () => {
    const sql = migrationSql()
    expect(sql).not.toMatch(/\bgrant\b/)
    expect(sql).not.toContain('disable row level security')
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|drop)\b/)
    expect(sql).not.toContain('password_reset_codes')
  })
})

describe('Supabase 数据接口只读审计脚本', () => {
  it('只包含查询，不包含数据库修改语句', () => {
    const sql = auditSql()
    expect(sql).not.toMatch(
      /\b(insert|update|delete|truncate|drop|alter|grant|revoke)\b/,
    )
    expect(sql).toMatch(/\bselect\b/)
  })
})
