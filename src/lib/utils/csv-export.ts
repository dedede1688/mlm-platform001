/**
 * v51.2: CSV 导出工具
 *
 * 功能：
 * - toCsv(): 对象数组 → CSV 字符串（自动处理引号/逗号/换行）
 * - csvResponse(): NextResponse 返回 text/csv + Content-Disposition: attachment
 */

/**
 * 转义 CSV 字段值（处理逗号、引号、换行）
 * RFC 4180: 包含逗号/引号/换行的字段必须用双引号包裹，内部双引号 → 两个双引号
 */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * 对象数组转 CSV 字符串
 * @param rows 数据行
 * @param headers 列定义 [{ key, label }]，label 是 CSV 表头
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers: { key: keyof T; label: string }[]
): string {
  const lines: string[] = []

  // 表头
  lines.push(headers.map(h => escapeField(h.label)).join(','))

  // 数据行
  for (const row of rows) {
    lines.push(headers.map(h => escapeField(row[h.key])).join(','))
  }

  // CSV 末尾加换行（部分工具要求）
  return lines.join('\n') + '\n'
}

/**
 * 返回 CSV 下载响应
 * @param csv CSV 字符串
 * @param filename 下载文件名（不含 .csv 后缀）
 */
export function csvResponse(csv: string, filename: string): Response {
  // BOM 让 Excel 正确识别 UTF-8 中文
  const bom = '\uFEFF'
  return new Response(bom + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
