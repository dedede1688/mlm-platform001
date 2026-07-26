// Shared constants for finance page and modals

export const LARGE_WITHDRAWAL_THRESHOLD = 5000

export const RECHARGE_PAYMENT_METHOD_MAP: Record<string, string> = {
  qr_code: '二维码扫码充值',
  alipay: '支付宝',
  wechat: '微信',
  bank_card: '银行卡',
  other: '其他',
}

export const RECHARGE_AUDIT_ACTION_MAP: Record<string, string> = {
  submit:  '提交申请',
  approve: '审核通过',
  reject:  '审核拒绝',
}

export const RECHARGE_AUDIT_STATUS_MAP: Record<string, string> = {
  pending:  '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}
