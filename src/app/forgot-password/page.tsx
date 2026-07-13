'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Phone, ShieldCheck, KeyRound } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

type Step = 'phone' | 'code' | 'reset' | 'success'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // 发送验证码
  const handleSendCode = async () => {
    if (!phone) {
      toast.error('请输入手机号')
      return
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('手机号格式不正确')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()

      if (data.success) {
        toast.success('验证码已发送')
        setStep('code')
        // 倒计时 60s
        setCountdown(60)
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        toast.error(data.error || data.message || '发送失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setLoading(false)
    }
  }

  // 校验验证码
  const handleVerifyCode = async () => {
    if (!code || code.length !== 6) {
      toast.error('请输入 6 位验证码')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })
      const data = await res.json()

      if (data.success) {
        setStep('reset')
      } else {
        toast.error(data.error || data.message || '验证码错误')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setLoading(false)
    }
  }

  // 重置密码
  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('新密码必须包含字母和数字')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, newPassword }),
      })
      const data = await res.json()

      if (data.success) {
        setStep('success')
        toast.success('密码重置成功')
      } else {
        toast.error(data.error || data.message || '重置失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        {/* 标题 */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">找回密码</h1>
          <p className="text-gray-600 mt-2">
            {step === 'phone' && '请输入注册手机号'}
            {step === 'code' && '请输入收到的验证码'}
            {step === 'reset' && '请设置新密码'}
            {step === 'success' && '密码重置成功'}
          </p>
        </div>

        {/* Step 1: 输入手机号 */}
        {step === 'phone' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="请输入手机号"
                  maxLength={11}
                />
              </div>
            </div>

            <button
              onClick={handleSendCode}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '发送中...' : '发送验证码'}
            </button>
          </div>
        )}

        {/* Step 2: 输入验证码 */}
        {step === 'code' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">验证码已发送至 {phone}</p>
            </div>

            <button
              onClick={handleVerifyCode}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '验证中...' : '验证'}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setStep('phone')}
                className="text-gray-500 hover:text-gray-700"
              >
                ← 修改手机号
              </button>
              {countdown > 0 ? (
                <span className="text-gray-400">{countdown}s 后可重新发送</span>
              ) : (
                <button
                  onClick={handleSendCode}
                  className="text-orange-600 hover:text-orange-800"
                >
                  重新发送
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: 设置新密码 */}
        {step === 'reset' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="至少 8 位，包含字母和数字"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="再次输入新密码"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '重置中...' : '确认重置'}
            </button>
          </div>
        )}

        {/* Step 4: 成功 */}
        {step === 'success' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-gray-700">您的密码已成功重置，请使用新密码登录</p>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700 transition-colors"
            >
              去登录
            </button>
          </div>
        )}

        {/* 底部链接 */}
        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1 text-gray-500 hover:text-orange-600 transition-colors text-sm">
            <ArrowLeft className="w-3 h-3" />
            返回登录
          </Link>
        </div>
      </div>
    </div>
  )
}
