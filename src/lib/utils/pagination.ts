/**
 * 统一分页计算工具
 * 杜绝 Math.ceil(total / pageSize) 与 Math.ceil(total / limit) 变量名混乱导致的隐性 bug
 */

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function paginate(total: number, page: number, limit: number): PaginationMeta {
  const safeLimit = Math.max(1, limit)
  return {
    page,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit),
  }
}

/**
 * 构造带分页元信息的标准响应
 */
export function withPagination<T>(data: T, total: number, page: number, limit: number) {
  return {
    data,
    pagination: paginate(total, page, limit),
  }
}
