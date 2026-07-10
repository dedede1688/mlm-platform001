import fs from 'node:fs'
import path from 'node:path'
import { clampProofScale } from '@/lib/utils/proof-viewer'

describe('ProofViewerModal', () => {
  it('uses the proof viewer modal for user recharge records', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/dashboard/recharge/page.tsx'),
      'utf8'
    )

    expect(pageSource).toContain("import ProofViewerModal from '@/components/ProofViewerModal'")
    expect(pageSource).toContain('setProofViewerUrl(record.paymentProofUrl)')
    expect(pageSource).not.toContain('href={record.paymentProofUrl}')
    expect(pageSource).not.toContain('target="_blank"')
  })

  it('clamps proof image scale from 50% to 400%', () => {
    expect(clampProofScale(0.1)).toBe(0.5)
    expect(clampProofScale(2)).toBe(2)
    expect(clampProofScale(8)).toBe(4)
  })
})
