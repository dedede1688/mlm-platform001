export const REFUND_REASONS_REQUIRING_IMAGES = new Set(['质量问题', '商品损坏'])

export interface RefundApplicationInput {
  reason: unknown
  description?: unknown
  images?: unknown
}

export interface NormalizedRefundApplication {
  reason: string
  description: string | null
  images: string[]
}

export type RefundApplicationValidationResult =
  | { success: true; data: NormalizedRefundApplication }
  | { success: false; error: string }

export function refundReasonRequiresImages(reason: string): boolean {
  return REFUND_REASONS_REQUIRING_IMAGES.has(reason)
}

export function refundReasonRequiresDescription(reason: string): boolean {
  return reason === '其他'
}

export function validateRefundApplication(
  input: RefundApplicationInput
): RefundApplicationValidationResult {
  if (typeof input.reason !== 'string' || !input.reason.trim()) {
    return { success: false, error: '退款原因不能为空' }
  }

  if (input.description !== undefined && typeof input.description !== 'string') {
    return { success: false, error: '补充说明格式不正确' }
  }

  if (input.images !== undefined && !Array.isArray(input.images)) {
    return { success: false, error: '凭证图片格式不正确' }
  }

  const images = input.images === undefined ? [] : input.images
  if (!images.every((image): image is string => typeof image === 'string')) {
    return { success: false, error: '凭证图片格式不正确' }
  }
  if (images.some((image) => !image.trim())) {
    return { success: false, error: '凭证图片不能为空' }
  }
  if (images.length > 5) {
    return { success: false, error: '凭证图片最多上传5张' }
  }

  const reason = input.reason.trim()
  const description =
    typeof input.description === 'string' ? input.description.trim() : ''

  if (refundReasonRequiresImages(reason) && images.length === 0) {
    return { success: false, error: '该退款原因至少需要上传1张凭证图片' }
  }
  if (refundReasonRequiresDescription(reason) && !description) {
    return { success: false, error: '选择其他原因时请填写补充说明' }
  }

  return {
    success: true,
    data: {
      reason,
      description: description || null,
      images: images.map((image) => image.trim()),
    },
  }
}