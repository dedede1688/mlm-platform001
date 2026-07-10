export const MIN_PROOF_SCALE = 0.5
export const MAX_PROOF_SCALE = 4

export function clampProofScale(scale: number) {
  return Math.min(MAX_PROOF_SCALE, Math.max(MIN_PROOF_SCALE, scale))
}
