import { describe, expect, it } from 'vitest'
import {
  validateRefundApplication,
  refundReasonRequiresImages,
  refundReasonRequiresDescription,
  REFUND_REASONS_REQUIRING_IMAGES,
} from '@/lib/refunds/refund-validation'

describe('validateRefundApplication', () => {
  it.each(['质量问题', '商品损坏'])('%s 无图时拒绝', (reason) => {
    expect(validateRefundApplication({ reason, description: '', images: [] })).toEqual({
      success: false,
      error: '该退款原因至少需要上传1张凭证图片',
    })
  })

  it('质量问题有1张图片时通过并保留图片', () => {
    expect(
      validateRefundApplication({
        reason: '质量问题',
        description: '  瓶身破损  ',
        images: ['https://example.com/evidence.jpg'],
      })
    ).toEqual({
      success: true,
      data: {
        reason: '质量问题',
        description: '瓶身破损',
        images: ['https://example.com/evidence.jpg'],
      },
    })
  })

  it('商品损坏有1张图片时通过', () => {
    expect(
      validateRefundApplication({
        reason: '商品损坏',
        images: ['https://example.com/damage.jpg'],
      })
    ).toEqual({
      success: true,
      data: {
        reason: '商品损坏',
        description: null,
        images: ['https://example.com/damage.jpg'],
      },
    })
  })

  it('其他原因无补充说明时拒绝', () => {
    expect(validateRefundApplication({ reason: '其他', description: '   ', images: [] })).toEqual({
      success: false,
      error: '选择其他原因时请填写补充说明',
    })
  })

  it('其他原因只有空格说明时拒绝', () => {
    expect(validateRefundApplication({ reason: '其他', description: '\t \n', images: [] })).toEqual({
      success: false,
      error: '选择其他原因时请填写补充说明',
    })
  })

  it('其他原因无说明字段时拒绝', () => {
    expect(validateRefundApplication({ reason: '其他', images: [] })).toEqual({
      success: false,
      error: '选择其他原因时请填写补充说明',
    })
  })

  it('其他原因有合法说明时通过并 trim', () => {
    expect(
      validateRefundApplication({
        reason: '其他',
        description: '  不符合预期  ',
        images: [],
      })
    ).toEqual({
      success: true,
      data: {
        reason: '其他',
        description: '不符合预期',
        images: [],
      },
    })
  })

  it('未按约定时间发货无图无说明时通过', () => {
    expect(
      validateRefundApplication({
        reason: '未按约定时间发货',
        description: undefined,
        images: undefined,
      })
    ).toEqual({
      success: true,
      data: {
        reason: '未按约定时间发货',
        description: null,
        images: [],
      },
    })
  })

  it('合法说明被 trim', () => {
    expect(
      validateRefundApplication({
        reason: '质量问题',
        description: '  有划痕  ',
        images: ['https://example.com/a.jpg'],
      })
    ).toEqual({
      success: true,
      data: {
        reason: '质量问题',
        description: '有划痕',
        images: ['https://example.com/a.jpg'],
      },
    })
  })

  it.each([
    { images: 'url', error: '凭证图片格式不正确' },
    { images: [123], error: '凭证图片格式不正确' },
    { images: [''], error: '凭证图片不能为空' },
    { images: ['1', '2', '3', '4', '5', '6'], error: '凭证图片最多上传5张' },
  ])('拒绝非法图片输入 %#', ({ images, error }) => {
    expect(validateRefundApplication({ reason: '未按约定时间发货', images })).toEqual({
      success: false,
      error,
    })
  })

  it('合法1张图片成功', () => {
    expect(
      validateRefundApplication({
        reason: '未按约定时间发货',
        images: ['https://example.com/1.jpg'],
      })
    ).toEqual({
      success: true,
      data: {
        reason: '未按约定时间发货',
        description: null,
        images: ['https://example.com/1.jpg'],
      },
    })
  })

  it('合法5张图片成功', () => {
    const images = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg']
    expect(
      validateRefundApplication({
        reason: '未按约定时间发货',
        images,
      })
    ).toEqual({
      success: true,
      data: {
        reason: '未按约定时间发货',
        description: null,
        images,
      },
    })
  })

  it('reason 为空时拒绝', () => {
    expect(validateRefundApplication({ reason: '', images: [] })).toEqual({
      success: false,
      error: '退款原因不能为空',
    })
  })

  it('reason 为非字符串时拒绝', () => {
    expect(validateRefundApplication({ reason: 123, images: [] })).toEqual({
      success: false,
      error: '退款原因不能为空',
    })
  })
})

describe('refundReasonRequiresImages', () => {
  it('质量问题需要图片', () => {
    expect(refundReasonRequiresImages('质量问题')).toBe(true)
  })

  it('商品损坏需要图片', () => {
    expect(refundReasonRequiresImages('商品损坏')).toBe(true)
  })

  it('未按约定时间发货不需要图片', () => {
    expect(refundReasonRequiresImages('未按约定时间发货')).toBe(false)
  })

  it('其他不需要图片', () => {
    expect(refundReasonRequiresImages('其他')).toBe(false)
  })
})

describe('refundReasonRequiresDescription', () => {
  it('其他需要说明', () => {
    expect(refundReasonRequiresDescription('其他')).toBe(true)
  })

  it('质量问题不需要说明', () => {
    expect(refundReasonRequiresDescription('质量问题')).toBe(false)
  })
})

describe('REFUND_REASONS_REQUIRING_IMAGES', () => {
  it('包含质量问题和商品损坏', () => {
    expect(REFUND_REASONS_REQUIRING_IMAGES.has('质量问题')).toBe(true)
    expect(REFUND_REASONS_REQUIRING_IMAGES.has('商品损坏')).toBe(true)
    expect(REFUND_REASONS_REQUIRING_IMAGES.size).toBe(2)
  })
})