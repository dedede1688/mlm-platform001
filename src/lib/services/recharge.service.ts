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
}
