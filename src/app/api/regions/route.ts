import { NextRequest } from 'next/server'
import { getAllRegions } from '@/lib/data/china-regions'
import { errorResponse, successResponse } from '@/lib/api-response'

// GET /api/regions — 返回完整省市区三级数据
// 数据源：src/lib/data/pca-code.json (~120KB)
// 客户端调用一次后缓存在内存，无需重复请求
export async function GET(_request: NextRequest) {
  try {
    const data = await getAllRegions()
    return successResponse(data)
  } catch (error) {
    console.error('获取省市区数据失败:', error)
    return errorResponse('获取省市区数据失败', 500)
  }
}