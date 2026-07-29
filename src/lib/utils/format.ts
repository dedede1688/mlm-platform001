export const formatMoney = (n: number | null | undefined) =>
  n != null ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
