'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Wallet, Eye, EyeOff, Loader2,
  CreditCard, User, Building2, AlertCircle
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'

interface UserInfo {
  id: string
  phone: string
  nickname: string | null
  balance: number
  frozenBalance: number
  hasPaymentPassword: boolean
}

interface WithdrawalRecord {
  id: string
  amount: number
  status: string
  paymentMethod: string | null
  createdAt: string
  rejectReason: string | null
}

const PAYMENT_METHODS = [
  { value: 'alipay', label: '支付宝' },
  { value: 'wechat', label: '微信' },
  { value: 'bank_card', label: '银行卡' },
]

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '审核中', color: 'text-yellow-600 bg-yellow-50' },
  approved: { label: '已通过', color: 'text-green-600 bg-green-50' },
  rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50' },
}

export default function WithdrawalsPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [paymentPassword, setPaymentPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  const [records, setRecords] = useState<WithdrawalRecord[]>([])
  const [_recordsLoading, setRecordsLoading] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchUser(storedToken)
    fetchRecords(storedToken)
  }, [router])

  const fetchUser = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setUser(data.data)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecords = async (authToken: string) => {
    setRecordsLoading(true)
    try {
      const res = await fetch('/api/withdrawals?page=1&limit=5', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.withdrawals) {
          setRecords(data.data.withdrawals)
        }
      }
    } catch (error) {
      console.error('获取提现记录失败:', error)
    } finally {
      setRecordsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!token) return

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('请输入有效的提现金额')
      return
    }
    if (!paymentMethod) {
      toast.error('请选择收款方式')
      return
    }
    if (!accountNumber.trim()) {
      toast.error('请输入收款账号')
      return
    }
    if (!accountName.trim()) {
      toast.error('请输入收款人姓名')
      return
    }
    if (paymentMethod === 'bank_card' && !bankName.trim()) {
      toast.error('请输入开户银行')
      return
    }
    if (!paymentPassword) {
      toast.error('请输入支付密码')
      return
    }
    if (!/^\d{6}$/.test(paymentPassword)) {
      toast.error('支付密码为6位数字')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: numAmount,
          paymentMethod,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
          bankName: paymentMethod === 'bank_card' ? bankName.trim() : undefined,
          paymentPassword,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('提现申请已提交，等待审核')
        setAmount('')
        setPaymentMethod('')
        setAccountNumber('')
        setAccountName('')
        setBankName('')
        setPaymentPassword('')
        fetchUser(token)
        fetchRecords(token)
      } else {
        toast.error(data.error || '提交失败')
      }
    } catch (_error) {
      toast.error('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-lg mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">提现申请</h1>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {user && !user.hasPaymentPassword && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-medium mb-1">请先设置支付密码</p>
              <Link href="/dashboard/payment-password" className="text-red-600 underline font-medium">
                去设置 →
              </Link>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-500">可提现余额</span>
            <span className="text-2xl font-bold text-primary">¥{user?.balance.toFixed(2) || '0.00'}</span>
          </div>
          <div className="text-xs text-gray-400">
            冻结余额：¥{user?.frozenBalance.toFixed(2) || '0.00'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              提现金额 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">¥</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="请输入提现金额"
                min="0.01"
                step="0.01"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  transition-colors text-gray-900 placeholder-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              收款方式 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                    paymentMethod === m.value
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {m.value === 'alipay' && <CreditCard className="w-4 h-4 inline mr-1" />}
                  {m.value === 'wechat' && <Wallet className="w-4 h-4 inline mr-1" />}
                  {m.value === 'bank_card' && <Building2 className="w-4 h-4 inline mr-1" />}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              收款账号 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder={paymentMethod === 'bank_card' ? '银行卡号' : paymentMethod === 'alipay' ? '支付宝账号' : '微信号'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                transition-colors text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              收款人姓名 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="请输入真实姓名"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  transition-colors text-gray-900 placeholder-gray-400"
              />
            </div>
          </div>

          {paymentMethod === 'bank_card' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                开户银行 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="如：中国工商银行深圳分行"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                    transition-colors text-gray-900 placeholder-gray-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              支付密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={paymentPassword}
                onChange={(e) => setPaymentPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="请输入6位数字支付密码"
                maxLength={6}
                className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-center tracking-[0.5em]
                  text-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !user?.hasPaymentPassword}
            className={`w-full py-3 rounded-xl text-white font-semibold text-base transition-all shadow-sm
              ${submitting || !user?.hasPaymentPassword
                ? 'bg-orange-400 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-md shadow-orange-500/25'
              }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                提交中...
              </span>
            ) : (
              '提交提现申请'
            )}
          </button>
        </div>

        {records.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">最近提现记录</h3>
            <div className="space-y-3">
              {records.map((r) => {
                const statusInfo = STATUS_MAP[r.status] || { label: r.status, color: 'text-gray-600 bg-gray-50' }
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">¥{r.amount.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">{formatTime(r.createdAt)}</p>
                      {r.status === 'rejected' && r.rejectReason && (
                        <p className="text-xs text-red-400 mt-0.5">原因：{r.rejectReason}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Link
          href="/dashboard"
          className="block w-full py-3 rounded-xl text-center text-gray-500 font-medium text-base
            border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          返回 Dashboard
        </Link>
      </main>
    </div>
  )
}