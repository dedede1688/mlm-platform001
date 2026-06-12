/**
 * 格式化工具函数
 */

/**
 * 格式化金额（人民币）
 * @param value 金额数值
 * @returns 格式化后的字符串，如 "1,234.56"
 */
export function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * 格式化日期
 * @param date 日期对象或字符串
 * @returns 格式化后的日期字符串，如 "2024-01-15"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

/**
 * 格式化日期时间
 * @param date 日期对象或字符串
 * @returns 格式化后的日期时间字符串，如 "2024-01-15 14:30"
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
