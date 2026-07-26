import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { WITHDRAWAL_STATUS } from "@/lib/constants"
import { WithdrawalService } from "@/lib/services/withdrawal.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from '@/lib/api-response'

// GET /api/admin/withdrawals — 获取提现申请列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["finance_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")))
    const status = searchParams.get("status")?.trim() || ""
    const search = searchParams.get("search")?.trim() || ""

    const { data, pagination: svcPagination } = await WithdrawalService.getAdminWithdrawals(page, pageSize, { status, search })

    return successResponse(
      {
        records: data,
        pagination: {
          page,
          pageSize: svcPagination.limit,
          total: svcPagination.total,
          totalPages: svcPagination.totalPages,
        },
      },
      "获取提现列表成功"
    )
  } catch (error) {
    logger.error("Admin get withdrawals error:", error)
    return errorResponse("获取提现列表失败", 500)
  }
}

// PUT /api/admin/withdrawals — 审核提现申请（管理员）
// 请求体：{ id, action: "approve" | "reject", rejectReason?, rejectTemplateId?, remark? }
export async function PUT(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["finance_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { id, action, rejectReason, rejectTemplateId, remark } = await request.json()

    if (!id) {
      return errorResponse("缺少提现记录 ID", 400)
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return errorResponse("action 必须为 approve 或 reject", 400)
    }

    const approved = action === "approve"

    const updated = await WithdrawalService.reviewWithdrawal(id, {
      approved,
      reviewedBy: admin.id,
      rejectReason,
      rejectTemplateId,
      remark,
    })

    await logOperation({
      userId: admin.id,
      action: approved ? "APPROVE" : "REJECT",
      module: "finance",
      targetId: id,
      oldValue: { status: WITHDRAWAL_STATUS.PENDING },
      newValue: {
        status: approved ? WITHDRAWAL_STATUS.APPROVED : WITHDRAWAL_STATUS.REJECTED,
        ...(approved ? {} : { rejectReason: rejectReason || null }),
      },
      ip: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    })

    return successResponse(updated, approved ? "提现已审核通过，等待线下打款" : "提现已拒绝，冻结收益已退回可提现收益")
  } catch (error: unknown) {
    logger.error("Admin review withdrawal error:", error)
    const errMsg = error instanceof Error ? error.message : ""
    const status = errMsg === "提现记录不存在" ? 404
      : errMsg === "提现记录已处理" ? 400
      : 500
    return errorResponse(error instanceof Error ? error.message : "审核提现失败", status)
  }
}
