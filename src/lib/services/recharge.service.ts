import { prisma } from '@/lib/prisma'
import { RECHARGE_STATUS, RECHARGE_PAYMENT_METHOD, RECHARGE_AUDIT_ACTION } from '@/lib/constants'
import { RechargeSettingsService, RechargeSettings } from '@/lib/services/recharge-settings.service'

export interface CreateRechargeParams {
  amount: number
  paymentProofUrl: string
  remark?: string
}

export class RechargeService {
  /**
   * 创建充值申请（第一包底座）
   * - 新充值申请由服务端统一写入 paymentMethod: QR_CODE（二维码扫码充值）
   * - 服务端校验：充值启用 + 二维码有效 + 金额范围
   * - 用户编号/手机号/支付方式不接受前端传入
   * - 不动 balance / consumeBalance / earningsAvailable / earningsFrozen
   * - 写 RechargeAuditLog（action = submit）
   */
  static async createRechargeRequest(userId: string, params: CreateRechargeParams) {
    const { amount, paymentProofUrl, remark } = params

    // 校验金额（严格类型校验）
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('充值金额必须为有效数字且大于0')
    }

    // 服务端先读设置：充值是否启用、二维码是否有效
    const settings = await RechargeSettingsService.getSettings()
    if (!settings.enabled) {
      throw new Error('充值服务暂时关闭，请联系客服')
    }
    if (!settings.qrCodeUrl || !/^https:\/\//i.test(settings.qrCodeUrl)) {
      throw new Error('充值二维码尚未配置，请联系客服')
    }

    // 校验付款凭证
    if (!paymentProofUrl || !paymentProofUrl.trim()) {
      throw new Error('请上传付款凭证')
    }
    if (!/^https:\/\//i.test(paymentProofUrl.trim())) {
      throw new Error('付款凭证链接必须为 https:// 开头')
    }

    // 金额范围（来自服务端设置）
    if (amount < settings.minAmount) {
      throw new Error(`最低充值金额 ¥${settings.minAmount}`)
    }
    if (amount > settings.maxAmount) {
      throw new Error(`单笔最高充值金额 ¥${settings.maxAmount}`)
    }

    // 校验用户存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new Error('用户不存在')

    // 创建充值申请 + 审核日志（事务）；支付方式由服务端统一写入 QR_CODE
    return await prisma.$transaction(async (tx) => {
      const recharge = await tx.rechargeRequest.create({
        data: {
          userId,
          amount,
          paymentMethod: RECHARGE_PAYMENT_METHOD.QR_CODE,
          paymentProofUrl: paymentProofUrl.trim(),
          status: RECHARGE_STATUS.PENDING,
          remark: remark || null,
        },
      })

      await tx.rechargeAuditLog.create({
        data: {
          requestId: recharge.id,
          action: RECHARGE_AUDIT_ACTION.SUBMIT,
          oldStatus: null,
          newStatus: RECHARGE_STATUS.PENDING,
          operatorId: userId,
          remark: remark || null,
        },
      })

      return recharge
    })
  }

  /**
   * 查询用户充值申请列表
   * 用户只能查看自己的
   */
  static async getUserRechargeRequests(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit

    const [requests, total] = await Promise.all([
      prisma.rechargeRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rechargeRequest.count({
        where: { userId },
      }),
    ])

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * 查询单条充值申请详情
   * 用户只能查看自己的（userId 隔离）
   */
  static async getUserRechargeRequestById(userId: string, requestId: string) {
    const request = await prisma.rechargeRequest.findUnique({
      where: { id: requestId },
    })

    if (!request) return null
    // 用户只能查看自己的充值申请
    if (request.userId !== userId) return null

    return request
  }

  /**
   * 读取充值设置（第一包：委托 RechargeSettingsService）
   * 返回新单二维码结构：enabled / qrCodeUrl / qrCodeLabel / payeeName / minAmount / maxAmount / instruction / contactPhone / serviceTime
   */
  static async getRechargeSettings(): Promise<RechargeSettings> {
    return RechargeSettingsService.getSettings()
  }

  /**
   * 审核通过充值申请（资金底座第三包 v3.2 / 业务规则不变）
   * - pending → approved
   * - user.balance += amount
   * - user.consumeBalance += amount
   * - 写 BalanceRecord（type=recharge, sourceType=recharge_request）
   * - 写 RechargeAuditLog（action=approve）
   * - 绝不修改 earningsAvailable / earningsFrozen / earningsVoided / earningsPending
   * - 关闭充值不影响本方法
   */
  static async approveRecharge(requestId: string, reviewedBy: string, remark?: string) {
    // 先查出充值申请（用于获取 amount / userId）
    const recharge = await prisma.rechargeRequest.findUnique({
      where: { id: requestId },
    })

    if (!recharge) throw new Error('充值申请不存在')
    if (recharge.status !== RECHARGE_STATUS.PENDING) {
      throw new Error('充值申请不存在或已审核')
    }

    return await prisma.$transaction(async (tx) => {
      // 原子更新：防止并发重复审核（where: { id, status: 'pending' }）
      const result = await tx.rechargeRequest.updateMany({
        where: { id: requestId, status: RECHARGE_STATUS.PENDING },
        data: {
          status: RECHARGE_STATUS.APPROVED,
          reviewedBy,
          reviewedAt: new Date(),
          approvedAt: new Date(),
          remark: remark || recharge.remark,
        },
      })

      if (result.count === 0) {
        throw new Error('充值申请不存在或已审核')
      }

      // 查出用户当前资金（用于写 BalanceRecord 的快照）
      const user = await tx.user.findUnique({
        where: { id: recharge.userId },
        select: {
          balance: true,
          frozenBalance: true,
          consumeBalance: true,
          earningsAvailable: true,
          earningsPending: true,
          earningsVoided: true,
          earningsFrozen: true,
        },
      })

      if (!user) throw new Error('用户不存在')

      // 增加余额 + 消费余额（绝不修改 earnings* 字段）
      const updatedUser = await tx.user.update({
        where: { id: recharge.userId },
        data: {
          balance: { increment: recharge.amount },
          consumeBalance: { increment: recharge.amount },
        },
        select: {
          balance: true,
          frozenBalance: true,
        },
      })

      // 用 update 返回的最新值写 BalanceRecord.balance
      await tx.balanceRecord.create({
        data: {
          userId: recharge.userId,
          type: 'recharge',
          amount: recharge.amount,
          balance: updatedUser.balance,
          frozenBalance: updatedUser.frozenBalance,
          sourceType: 'recharge_request',
          sourceId: requestId,
          description: `充值审核通过，余额 +¥${recharge.amount}，充值申请 ID：${requestId}`,
        },
      })

      // 写 RechargeAuditLog
      await tx.rechargeAuditLog.create({
        data: {
          requestId,
          action: RECHARGE_AUDIT_ACTION.APPROVE,
          oldStatus: RECHARGE_STATUS.PENDING,
          newStatus: RECHARGE_STATUS.APPROVED,
          operatorId: reviewedBy,
          remark: remark || null,
        },
      })

      // 返回更新后的充值申请
      const updated = await tx.rechargeRequest.findUnique({
        where: { id: requestId },
      })

      return updated
    })
  }

  /**
   * 审核拒绝充值申请（资金底座第三包 v3.2 / 业务规则不变）
   * - pending → rejected
   * - 不修改 user 表任何资金字段
   * - 不写 BalanceRecord
   * - 写 RechargeAuditLog（action=reject）
   * - 关闭充值不影响本方法
   */
  static async rejectRecharge(
    requestId: string,
    reviewedBy: string,
    rejectReason: string,
    rejectTemplateId?: string,
    remark?: string
  ) {
    // 必须有拒绝原因或拒绝模板（trim 后判断，纯空格不能通过）
    const trimmedReason = rejectReason?.trim() || ''
    if (!trimmedReason && !rejectTemplateId) {
      throw new Error('请填写拒绝原因或选择拒绝模板')
    }

    const recharge = await prisma.rechargeRequest.findUnique({
      where: { id: requestId },
    })

    if (!recharge) throw new Error('充值申请不存在')
    if (recharge.status !== RECHARGE_STATUS.PENDING) {
      throw new Error('充值申请不存在或已审核')
    }

    return await prisma.$transaction(async (tx) => {
      // 原子更新：防止并发重复审核
      const result = await tx.rechargeRequest.updateMany({
        where: { id: requestId, status: RECHARGE_STATUS.PENDING },
        data: {
          status: RECHARGE_STATUS.REJECTED,
          reviewedBy,
          reviewedAt: new Date(),
          rejectReason: trimmedReason || null,
          rejectTemplateId: rejectTemplateId || null,
          remark: remark || recharge.remark,
        },
      })

      if (result.count === 0) {
        throw new Error('充值申请不存在或已审核')
      }

      // 写 RechargeAuditLog
      await tx.rechargeAuditLog.create({
        data: {
          requestId,
          action: RECHARGE_AUDIT_ACTION.REJECT,
          oldStatus: RECHARGE_STATUS.PENDING,
          newStatus: RECHARGE_STATUS.REJECTED,
          operatorId: reviewedBy,
          reason: trimmedReason || null,
          remark: remark || null,
        },
      })

      // 返回更新后的充值申请
      const updated = await tx.rechargeRequest.findUnique({
        where: { id: requestId },
      })

      return updated
    })
  }

  /**
   * 后台充值申请列表查询（管理员）
   * 只读查询，不修改任何数据库数据
   */
  static async listAdminRechargeRequests(filters: {
    page?: number
    pageSize?: number
    status?: string
    paymentMethod?: string
    search?: string
  }) {
    const page = Math.max(1, filters.page || 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20))
    const skip = (page - 1) * pageSize

    const where: Record<string, unknown> = {}

    if (filters.status && filters.status.trim()) {
      where.status = filters.status.trim()
    }

    if (filters.paymentMethod && filters.paymentMethod.trim()) {
      where.paymentMethod = filters.paymentMethod.trim()
    }

    if (filters.search && filters.search.trim()) {
      const search = filters.search.trim()
      where.user = {
        OR: [
          { phone: { contains: search } },
          { nickname: { contains: search } },
        ],
      }
    }

    const [requests, total] = await Promise.all([
      prisma.rechargeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true, level: true },
          },
        },
      }),
      prisma.rechargeRequest.count({ where }),
    ])

    // 补充审核人信息
    const reviewerIds = requests
      .map((r) => r.reviewedBy)
      .filter((id): id is string => !!id)

    const reviewers = reviewerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, phone: true, nickname: true },
        })
      : []

    const reviewerMap = new Map(reviewers.map((r) => [r.id, r]))

    const data = requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      amount: r.amount,
      paymentMethod: r.paymentMethod,
      paymentProofUrl: r.paymentProofUrl,
      status: r.status,
      rejectReason: r.rejectReason,
      rejectTemplateId: r.rejectTemplateId,
      reviewedBy: r.reviewedBy,
      reviewer: r.reviewedBy ? reviewerMap.get(r.reviewedBy) || null : null,
      reviewedAt: r.reviewedAt,
      approvedAt: r.approvedAt,
      remark: r.remark,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  /**
   * 后台充值申请详情查询（管理员）
   * 只读查询，返回充值信息 + 用户信息 + 审核人信息
   * 找不到返回 null
   */
  static async getAdminRechargeRequestById(id: string) {
    const request = await prisma.rechargeRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, phone: true, nickname: true, level: true },
        },
      },
    })

    if (!request) return null

    // 补充审核人信息
    let reviewer: { id: string; phone: string; nickname: string | null } | null = null
    if (request.reviewedBy) {
      reviewer = await prisma.user.findUnique({
        where: { id: request.reviewedBy },
        select: { id: true, phone: true, nickname: true },
      })
    }

    return {
      id: request.id,
      userId: request.userId,
      user: request.user,
      amount: request.amount,
      paymentMethod: request.paymentMethod,
      paymentProofUrl: request.paymentProofUrl,
      status: request.status,
      rejectReason: request.rejectReason,
      rejectTemplateId: request.rejectTemplateId,
      reviewedBy: request.reviewedBy,
      reviewer,
      reviewedAt: request.reviewedAt,
      approvedAt: request.approvedAt,
      remark: request.remark,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    }
  }
}
