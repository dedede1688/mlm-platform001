'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

// ---- 类型 ----

interface _UserInfo {
  hasPaymentPassword: boolean
}

// ---- 主组件 ----

export default function PaymentPasswordPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 表单字段
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchStatus(storedToken)
  }, [router])

  // 查询是否已设置支付密码
  const fetchStatus = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setHasPassword(!!data.data.hasPaymentPassword)
        }
      }
    } catch (error) {
      console.error('获取支付密码状态失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 前端校验：6 位数字
  const isValidPwd = (v: string) => /^\d{6}$/.test(v)

  const handleSubmit = async () => {
    if (!token) return

    // 设置模式校验
    if (!hasPassword) {
      if (!isValidPwd(newPassword)) {
        toast.error('支付密码必须为 6 位数字')
        return
      }
      if (newPassword !== confirmPassword) {
        toast.error('两次输入的密码不一致')
        return
      }
    }

    // 修改模式校验
    if (hasPassword) {
      if (!isValidPwd(oldPassword)) {
        toast.error('旧密码必须为 6 位数字')
        return
      }
      if (!isValidPwd(newPassword)) {
        toast.error('新密码必须为 6 位数字')
        return
      }
      if (newPassword !== confirmPassword) {
        toast.error('两次输入的新密码不一致')
        return
      }
      if (oldPassword === newPassword) {
        toast.error('新密码不能与旧密码相同')
        return
      }
    }

    setSubmitting(true)
    try {
      let res: Response
      if (!hasPassword) {
        // 设置模式
        res = await fetch('/api/user/payment-password/set', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password: newPassword }),
        })
      } else {
        // 修改模式
        res = await fetch('/api/user/payment-password/update', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ oldPassword, newPassword }),
        })
      }

      const data = await res.json()
      if (res.ok && data.success !== false) {
        toast.success(hasPassword ? '支付密码修改成功' : '支付密码设置成功')
        // 刷新页面状态（重新查询 hasPassword）
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        fetchStatus(token)
      } else {
        toast.error(data.error || '操作失败')
      }
    } catch (_error) {
      toast.error('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 加载态 ----
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
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">
            {hasPassword ? '修改支付密码' : '设置支付密码'}
          </h1>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* 安全提示卡片 */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-800 leading-relaxed">
            <p className="font-medium mb-1">安全提示</p>
            <p className="text-xs text-orange-700">
              支付密码用于确认订单支付，请勿与他人分享。
              密码为 <strong>6 位数字</strong>，请牢记。
            </p>
          </div>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
          {/* 修改模式：旧密码 */}
          {hasPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                当前密码
              </label>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="请输入当前支付密码"
                  maxLength={6}
                  className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-center tracking-[0.5em]
                    text-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                    transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* 新密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {hasPassword ? '新密码' : '支付密码'}
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="请输入 6 位数字密码"
                maxLength={6}
                className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-center tracking-[0.5em]
                  text-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 确认密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              确认密码
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="再次输入密码"
                maxLength={6}
                className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg text-center tracking-[0.5em]
                  text-lg font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full py-3 rounded-xl text-white font-semibold text-base transition-all shadow-sm
              ${submitting
                ? 'bg-orange-400 cursor-not-allowed'
                : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-md shadow-orange-500/25'
              }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                处理中...
              </span>
            ) : (
              hasPassword ? '确认修改' : '设置密码'
            )}
          </button>
        </div>

        {/* 返回按钮 */}
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
