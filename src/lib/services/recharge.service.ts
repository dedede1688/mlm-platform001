import { prisma } from '@/lib/prisma'
import { RECHARGE_STATUS, RECHARGE_PAYMENT_METHOD, RECHARGE_AUDIT_ACTION } from '@/lib/constants'
import { getBusinessConfig } from '@/lib/config/business'

export interface CreateRechargeParams {
  amount: number
  paymentMethod: string
  paymentProofUrl: string
  remark?: string
}

export interface RechargeSettings {
  minAmount: number
  maxAmount: number
  paymentMethods: { value: string; label: string }[]
  instruction: string
  alipayAccount?: string
  wechatAccount?: string
  bankCardAccount?: string
  bankCardName?: string
  bankName?: string
  contactPhone?: string
  serviceTime?: string
}

const VALID_PAYMENT_METHODS = [
  RECHARGE_PAYMENT_METHOD.ALIPAY,
  RECHARGE_PAYMENT_METHOD.WECHAT,
  RECHARGE_PAYMENT_METHOD.BANK_CARD,
] as const

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [RECHARGE_PAYMENT_METHOD.ALIPAY]: '支付宝',
  [RECHARGE_PAYMENT_METHOD.WECHAT]: '微信',
  [RECHARGE_PAYMENT_METHOD.BANK_CARD]: '银行卡',
}

export class RechargeService {
  /**
   * 创建充值申请
   * 资金底座第 3 包 v3.1：
   * - 只生成 pending 状态的 RechargeRequest
   * - 不动 balance / consumeBalance / earningsAvailable / earningsFrozen
   * - 不写 BalanceRecord
   * - 写 RechargeAuditLog（action = submit）
   */
  static async createRechargeRequest(userId: string, params: CreateRechargeParams) {
    const { amount, paymentMethod, paymentProofUrl, remark } = params

    // 校验金额（严格类型校验）
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('充值金额必须为有效数字且大于0')
    }

    // 校验支付方式
    if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod as any)) {
      throw new Error('请选择有效的支付方式（支付宝/微信/银行卡）')
    }

    // 校验付款凭证
    if (!paymentProofUrl || !paymentProofUrl.trim()) {
      throw new Error('请上传付款凭证')
    }
    if (!/^https:\/\//i.test(paymentProofUrl.trim())) {
      throw new Error('付款凭证链接必须为 https:// 开头')
    }

    // 金额范围校验（从 SystemConfig 读取，默认 min=1, max=50000）
    const minAmount = await getBusinessConfig('recharge.min_amount', 1)
    const maxAmount = await getBusinessConfig('recharge.max_amount', 50000)
    if (amount < minAmount) {
      throw new Error(`最低充值金额 ¥${minAmount}`)
    }
    if (amount > maxAmount) {
      throw new Error(`单笔最高充值金额 ¥${maxAmount}`)
    }

    // 校验用户存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) throw new Error('用户不存在')

    // 创建充值申请 + 审核日志（事务）
    return await prisma.$transaction(async (tx) => {
      const recharge = await tx.rechargeRequest.create({
        data: {
          userId,
          amount,
          paymentMethod,
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
   * 获取充值设置（本包返回默认值 + SystemConfig 已有配置）
   * v3.3 会完善后台配置表单
   */
  static async getRechargeSettings(): Promise<RechargeSettings> {
    const minAmount = await getBusinessConfig('recharge.min_amount', 1)
    const maxAmount = await getBusinessConfig('recharge.max_amount', 50000)
    const instruction = await getBusinessConfig('recharge.instruction', '请向以下收款账户转账后上传付款凭证，等待后台审核入账。')
    const alipayAccount = await getBusinessConfig<string | undefined>('recharge.alipay_account', undefined)
    const wechatAccount = await getBusinessConfig<string | undefined>('recharge.wechat_account', undefined)
    const bankCardAccount = await getBusinessConfig<string | undefined>('recharge.bank_card_account', undefined)
    const bankCardName = await getBusinessConfig<string | undefined>('recharge.bank_card_name', undefined)
    const bankName = await getBusinessConfig<string | undefined>('recharge.bank_name', undefined)
    const contactPhone = await getBusinessConfig<string | undefined>('recharge.contact_phone', undefined)
    const serviceTime = await getBusinessConfig<string | undefined>('recharge.service_time', undefined)

    return {
      minAmount,
      maxAmount,
      paymentMethods: VALID_PAYMENT_METHODS.map((m) => ({
        value: m,
        label: PAYMENT_METHOD_LABELS[m],
      })),
      instruction,
      alipayAccount,
      wechatAccount,
      bankCardAccount,
      bankCardName,
      bankName,
      contactPhone,
      serviceTime,
    }
  }

  /**
   * 审核通过充值申请
   * 资金底座第 3 包 v3.2：
   * - pending → approved
   * - user.balance += amount
   * - user.consumeBalance += amount
   * - 写 BalanceRecord（type=recharge, sourceType=recharge_request）
   * - 写 RechargeAuditLog（action=approve）
   * - 绝不修改 earningsAvailable / earningsFrozen / earningsVoided / earningsPending
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
   * 审核拒绝充值申请
   * 资金底座第 3 包 v3.2：
   * - pending → rejected
   * - 不修改 user 表任何资金字段
   * - 不写 BalanceRecord
   * - 写 RechargeAuditLog（action=reject）
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
}
