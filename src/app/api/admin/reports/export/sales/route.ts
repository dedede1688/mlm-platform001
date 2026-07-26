import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { toCsv, csvResponse } from "@/lib/utils/csv-export"
import { logger } from "@/lib/logger"
import { ExportService } from "@/lib/services/export.service"

// GET /api/admin/reports/export/sales?days=30 — 销售数据 CSV 导出（v51.2）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["super_admin", "finance_admin", "goods_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") || "30")))

    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)

    const { topProducts, topMembers } = await ExportService.getSalesExport(days)

    const productsCsv = toCsv(topProducts, [
      { key: "name", label: "商品名称" }, { key: "sales", label: "销售额" },
      { key: "quantity", label: "销量" }, { key: "orderCount", label: "订单数" },
    ])
    const membersCsv = toCsv(topMembers, [
      { key: "nickname", label: "昵称" }, { key: "phone", label: "手机号" },
      { key: "level", label: "等级" }, { key: "sales", label: "消费额" }, { key: "orderCount", label: "订单数" },
    ])
    const combined = `# TOP 商品（近${days}天）\n${productsCsv}\n# TOP 会员（近${days}天）\n${membersCsv}`

    return csvResponse(combined, `销售报表_${days}天_${dateStr}`)
  } catch (error) {
    logger.error("[Sales CSV Export Error]", error)
    return new Response("服务器错误", { status: 500 })
  }
}
