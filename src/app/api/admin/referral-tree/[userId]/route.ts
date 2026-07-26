import { NextRequest, NextResponse } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logger } from "@/lib/logger"
import { UserService } from "@/lib/services/user.service"

// ---- v38: 内存缓存 (30s TTL) ----

const apiCache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 30 * 1000

function getCacheKey(userId: string, maxLevel: number, mode: string, boundaryDown: number): string {
  return `${userId}:${maxLevel}:${mode}:${boundaryDown}`
}

function getCached(key: string): unknown | null {
  const entry = apiCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) { apiCache.delete(key); return null }
  return entry.data
}

// ---- GET /api/admin/referral-tree/[userId] ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "support_admin"])
  if (authError || !admin) return authError!

  const { userId } = await params
  const { searchParams } = new URL(request.url)
  const maxLevel = Math.min(Math.max(Number(searchParams.get("maxLevel")) || 3, 1), 5)
  const mode = searchParams.get("mode") || "root"
  const boundaryDownLevel = Number(searchParams.get("boundaryDown")) || 2

  // v38: cache check
  const cacheKey = getCacheKey(userId, maxLevel, mode, boundaryDownLevel)
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const response = await UserService.getAdminReferralTree(userId, maxLevel, mode, boundaryDownLevel)
    if (!response) return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 })

    // v38: cache write
    apiCache.set(cacheKey, { data: response, timestamp: Date.now() })
    return NextResponse.json(response)
  } catch (error) {
    logger.error("获取推荐树失败", error)
    return NextResponse.json({ success: false, error: "获取推荐树失败" }, { status: 500 })
  }
}
