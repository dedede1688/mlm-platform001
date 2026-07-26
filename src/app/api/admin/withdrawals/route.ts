import { NextRequest } from "next/server"
import { verifyPermission } from "@/lib/utils/admin-auth"
import { logOperation } from "@/lib/utils/operation-log"
import { WITHDRAWAL_STATUS } from "@/lib/constants"
import { WithdrawalService } from "@/lib/services/withdrawal.service"
import { logger } from "@/lib/logger"
import { errorResponse, successResponse } from "@/lib/api-response"
import { parseBody } from "@/lib/validations/helper"
import { withdrawalReviewSchema } from "@/lib/validations/admin/withdrawals"

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
      data,
      "获取提现列表成功",
      { page, pageSize: svcPagination.limit, total: svcPagination.total, totalPages: svcPagination.totalPages }
    )
  } catch (error) {
    logger.error("Admin get withdrawals error:", error)
    return errorResponse("获取提现列表失败", 500)
  }
}

// PUT /api/admin/withdrawals — 审核提现申请（管理员）
export async function PUT(request: NextRequest) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ["finance_admin", "super_admin"])
    if (authError || !admin) return authError!

    const { data: body, error: parseError } = await parseBody(withdrawalReviewSchema, request)
    if (parseError) return parseError

    const approved = body.action === "approve"

    const updated = await WithdrawalService.reviewWithdrawal(body.id, {
      approved,
      reviewedBy: admin.id,
      rejectReason: body.rejectReason,
      rejectTemplateId: body.rejectTemplateId,
      remark: body.remark,
    })

    await logOperation({
      userId: admin.id,
      action: approved ? "APPROVE" : "REJECT",
      module: "finance",
      targetId: body.id,
      oldValue: { status: WITHDRAWAL_STATUS.PENDING },
      newValue: {
        status: approved ? WITHDRAWAL_STATUS.APPROVED : WITHDRAWAL_STATUS.REJECTED,
        ...(approved ? {} : { rejectReason: body.rejectReason || null }),
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
