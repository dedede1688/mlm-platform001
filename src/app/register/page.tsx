'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface FieldErrors {
  phone?: string
  nickname?: string
  password?: string
  confirmPassword?: string
}

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
    confirmPassword: '',
    nickname: '',
    referrerCode: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 实时校验每个字段
  const fieldErrors = useMemo<FieldErrors>(() => {
    const errs: FieldErrors = {}

    // 手机号校验
    if (formData.phone) {
      if (!/^1[3-9]\d{9}$/.test(formData.phone)) {
        errs.phone = '请输入正确的11位手机号'
      }
    }

    // 昵称校验
    if (formData.nickname) {
      if (formData.nickname.length < 2 || formData.nickname.length > 20) {
        errs.nickname = '昵称长度需在 2-20 个字符之间'
      }
    }

    // 密码校验
    if (formData.password) {
      if (formData.password.length < 8) {
        errs.password = '密码长度至少 8 位'
      } else if (!/[a-zA-Z]/.test(formData.password)) {
        errs.password = '密码必须包含字母'
      } else if (!/[0-9]/.test(formData.password)) {
        errs.password = '密码必须包含数字'
      }
    }

    // 确认密码校验
    if (formData.confirmPassword) {
      if (formData.confirmPassword !== formData.password) {
        errs.confirmPassword = '两次输入的密码不一致'
      }
    }

    return errs
  }, [formData])

  const hasErrors = Object.values(fieldErrors).some(e => e)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (hasErrors) {
      const firstError = Object.values(fieldErrors).find(e => e) || '请检查输入'
      setError(firstError)
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone,
          password: formData.password,
          nickname: formData.nickname,
          referrerCode: formData.referrerCode,
        }),
      })

      const data = await res.json()

      if (data.success) {
        router.push('/login')
      } else {
        setError(data.message || data.error || '注册失败')
      }
    } catch (_err) {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">创建账户</h1>
            <p className="text-gray-600 mt-2">加入我们的平台，开启收益之旅</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 手机号 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                手机号 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  fieldErrors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="请输入11位手机号"
              />
              {fieldErrors.phone && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.phone}</p>
              )}
            </div>

            {/* 昵称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                昵称
              </label>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  fieldErrors.nickname ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="请输入昵称（2-20字符，可选）"
              />
              {fieldErrors.nickname && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.nickname}</p>
              )}
            </div>

            {/* 推荐码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                推荐码
              </label>
              <input
                type="text"
                value={formData.referrerCode}
                onChange={(e) => setFormData({ ...formData, referrerCode: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入推荐人手机号（可选）"
              />
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  fieldErrors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="至少8位，包含字母和数字"
              />
              {fieldErrors.password ? (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.password}</p>
              ) : (
                <p className="text-gray-400 text-xs mt-1">提示：至少 8 位，需同时包含字母和数字</p>
              )}
            </div>

            {/* 确认密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                确认密码 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  fieldErrors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="请再次输入密码"
              />
              {fieldErrors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || hasErrors}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '注册中...' : '注册'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              已有账号？{' '}
              <Link href="/login" className="text-blue-600 hover:underline font-medium">
                立即登录
              </Link>
            </p>
            <div className="mt-4">
              <Link href="/" className="text-gray-500 hover:text-blue-600 transition-colors text-sm">
                返回首页
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
