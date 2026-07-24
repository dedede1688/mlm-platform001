import { readFileSync } from 'fs'
import { resolve } from 'path'

const schemaPath = resolve(__dirname, '../../prisma/schema.prisma')
const schema = readFileSync(schemaPath, 'utf-8')

function extractModel(name: string): string {
  const re = new RegExp(`model ${name}\\s*\\{([^}]*)\\}`, 's')
  const m = schema.match(re)
  return m ? m[1] : ''
}

describe('Single-path dividend schema contract', () => {
  const orderModel = extractModel('Order')
  const dividendModel = extractModel('Dividend')
  const rewardModel = extractModel('Reward')

  describe('Order reward state fields', () => {
    it('contains rewardStatus', () => {
      expect(orderModel).toContain('rewardStatus')
    })

    it('contains rewardAttempts', () => {
      expect(orderModel).toContain('rewardAttempts')
    })

    it('contains rewardLastError', () => {
      expect(orderModel).toContain('rewardLastError')
    })

    it('contains rewardLastAttemptAt', () => {
      expect(orderModel).toContain('rewardLastAttemptAt')
    })

    it('contains rewardsCompletedAt', () => {
      expect(orderModel).toContain('rewardsCompletedAt')
    })
  })

  describe('Dividend pool identity and refund audit', () => {
    it('contains poolType', () => {
      expect(dividendModel).toContain('poolType')
    })

    it('contains refundedAt', () => {
      expect(dividendModel).toContain('refundedAt')
    })

    it('has unique constraint on [orderId, userId, poolType]', () => {
      expect(dividendModel).toContain('@@unique([orderId, userId, poolType])')
    })
  })

  describe('Reward idempotency key', () => {
    it('contains idempotencyKey as non-null String @unique', () => {
      const line = rewardModel
        .split('\n')
        .map(l => l.trim())
        .find(l => l.startsWith('idempotencyKey'))
      expect(line).toBeDefined()
      expect(line).toContain('String')
      expect(line).toContain('@unique')
      expect(line).not.toContain('?')
    })
  })
})