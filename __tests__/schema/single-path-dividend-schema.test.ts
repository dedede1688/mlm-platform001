import { readFileSync } from 'fs'
import { resolve } from 'path'

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma')
const schema = readFileSync(schemaPath, 'utf-8')

const migrationPath = resolve(__dirname, '../../prisma/migrations/20260725040000_single_path_dividend_foundation/migration.sql')
const migration = readFileSync(migrationPath, 'utf-8')

function extractModel(name: string): string {
  const re = new RegExp(`model ${name}\\s*\\{([^}]*)\\}`, 's')
  const m = schema.match(re)
  return m ? m[1] : ''
}

function extractField(model: string, fieldName: string): string | undefined {
  const lines = model.split('\n').map(l => l.trim())
  return lines.find(l => l.startsWith(fieldName))
}

describe('Single-path dividend schema contract', () => {
  const orderModel = extractModel('Order')
  const dividendModel = extractModel('Dividend')
  const rewardModel = extractModel('Reward')

  describe('Order reward state fields', () => {
    it('contains rewardStatus String @default("completed") @map("reward_status")', () => {
      const field = extractField(orderModel, 'rewardStatus')
      expect(field).toBeDefined()
      expect(field).toContain('String')
      expect(field).toContain('@default("completed")')
      expect(field).toContain('@map("reward_status")')
    })

    it('contains rewardAttempts Int @default(0) @map("reward_attempts")', () => {
      const field = extractField(orderModel, 'rewardAttempts')
      expect(field).toBeDefined()
      expect(field).toContain('Int')
      expect(field).toContain('@default(0)')
      expect(field).toContain('@map("reward_attempts")')
    })

    it('contains rewardLastError String? @map("reward_last_error")', () => {
      const field = extractField(orderModel, 'rewardLastError')
      expect(field).toBeDefined()
      expect(field).toContain('String?')
      expect(field).toContain('@map("reward_last_error")')
    })

    it('contains rewardLastAttemptAt DateTime? @map("reward_last_attempt_at")', () => {
      const field = extractField(orderModel, 'rewardLastAttemptAt')
      expect(field).toBeDefined()
      expect(field).toContain('DateTime?')
      expect(field).toContain('@map("reward_last_attempt_at")')
    })

    it('contains rewardsCompletedAt DateTime? @map("rewards_completed_at")', () => {
      const field = extractField(orderModel, 'rewardsCompletedAt')
      expect(field).toBeDefined()
      expect(field).toContain('DateTime?')
      expect(field).toContain('@map("rewards_completed_at")')
    })
  })

  describe('Dividend pool identity and refund audit', () => {
    it('contains poolType String @map("pool_type")', () => {
      const field = extractField(dividendModel, 'poolType')
      expect(field).toBeDefined()
      expect(field).toContain('String')
      expect(field).toContain('@map("pool_type")')
      expect(field).not.toContain('?')
    })

    it('contains refundedAt DateTime? @map("refunded_at")', () => {
      const field = extractField(dividendModel, 'refundedAt')
      expect(field).toBeDefined()
      expect(field).toContain('DateTime?')
      expect(field).toContain('@map("refunded_at")')
    })

    it('has unique constraint on [orderId, userId, poolType]', () => {
      expect(dividendModel).toContain('@@unique([orderId, userId, poolType])')
    })
  })

  describe('Reward idempotency key', () => {
    it('contains idempotencyKey String @unique @map("idempotency_key")', () => {
      const field = extractField(rewardModel, 'idempotencyKey')
      expect(field).toBeDefined()
      expect(field).toContain('String')
      expect(field).toContain('@unique')
      expect(field).toContain('@map("idempotency_key")')
      expect(field).not.toContain('?')
    })
  })
})

describe('Migration safety contract', () => {
  it('adds 5 reward state columns to orders', () => {
    expect(migration).toContain('"reward_status"')
    expect(migration).toContain('"reward_attempts"')
    expect(migration).toContain('"reward_last_error"')
    expect(migration).toContain('"reward_last_attempt_at"')
    expect(migration).toContain('"rewards_completed_at"')
  })

  it('adds pool_type to dividends', () => {
    expect(migration).toContain('"pool_type"')
  })

  it('backfills pool_type using user_level CASE 3-7', () => {
    expect(migration).toContain('WHEN 3 THEN')
    expect(migration).toContain('WHEN 4 THEN')
    expect(migration).toContain('WHEN 5 THEN')
    expect(migration).toContain('WHEN 6 THEN')
    expect(migration).toContain('WHEN 7 THEN')
    expect(migration).toContain("'director'")
    expect(migration).toContain("'manager'")
    expect(migration).toContain("'supervisor'")
    expect(migration).toContain("'president'")
    expect(migration).toContain("'board'")
  })

  it('includes pool_type NULL safety check', () => {
    expect(migration).toContain('pool_type')
    expect(migration).toMatch(/IS NULL|pool_type.*NULL/)
  })

  it('sets settled=true for historical dividends', () => {
    expect(migration).toMatch(/SET "settled" = true/)
  })

  it('adds refunded_at to dividends', () => {
    expect(migration).toContain('"refunded_at"')
  })

  it('creates dividends business unique index', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX.*dividends.*order_id.*user_id.*pool_type/i)
  })

  it('adds rewards.idempotency_key', () => {
    expect(migration).toContain('"idempotency_key"')
  })

  it('backfills historical idempotency_key with legacy:reward: prefix', () => {
    expect(migration).toContain("'legacy:reward:'")
  })

  it('sets idempotency_key NOT NULL', () => {
    expect(migration).toMatch(/"idempotency_key".*SET NOT NULL/)
  })

  it('creates idempotency_key unique index', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX.*idempotency_key/i)
  })

  it('does not UPDATE users', () => {
    expect(migration).not.toMatch(/UPDATE\s+"users"/i)
  })

  it('does not INSERT INTO balance_records', () => {
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"balance_records"/i)
  })

  it('does not UPDATE balance_records', () => {
    expect(migration).not.toMatch(/UPDATE\s+"balance_records"/i)
  })

  it('does not contain DELETE FROM', () => {
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
  })

  it('does not modify rewards.amount', () => {
    expect(migration).not.toMatch(/rewards.*amount.*=|SET.*amount/)
  })

  it('does not modify dividends.amount', () => {
    expect(migration).not.toMatch(/dividends.*amount.*=.*[^0]/)
  })

  it('does not contain $queryRaw or $queryRawUnsafe', () => {
    expect(migration).not.toContain('$queryRaw')
    expect(migration).not.toContain('$queryRawUnsafe')
  })
})
