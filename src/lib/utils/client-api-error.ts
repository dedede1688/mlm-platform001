export function getClientApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback

  const response = payload as { error?: unknown; message?: unknown }
  if (typeof response.error === 'string' && response.error.trim()) {
    return response.error.trim()
  }
  if (typeof response.message === 'string' && response.message.trim()) {
    return response.message.trim()
  }
  return fallback
}
