'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectUrl = searchParams.get('redirect') || ''
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
    rememberMe: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasSavedPhone, setHasSavedPhone] = useState(false)

  useEffect(() => {
    // 页面加载时检查是否有保存的手机号
    const savedPhone = localStorage.getItem('savedPhone')
    if (savedPhone) {
      setFormData(prev => ({ ...prev, phone: savedPhone, rememberMe: true }))
      setHasSavedPhone(true)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone,
          password: formData.password,
        }),
      })

      const data = await res.json()

      if (data.success) {
        localStorage.setItem('token', data.data.token)
        localStorage.setItem('user', JSON.stringify(data.data.user))
        
        // 通知 Header 更新登录状态
        window.dispatchEvent(new Event('auth-change'))
        
        // 记住我功能
        if (formData.rememberMe) {
          localStorage.setItem('savedPhone', formData.phone)
        } else {
          localStorage.removeItem('savedPhone')
        }
        
        // 跳转：优先 redirect 参数，否则管理员跳 /admin，普通用户跳 /dashboard
        const userRole = data.data.user?.role || ''
        const adminRoles = ['super_admin', 'admin', 'goods_manager', 'order_manager', 'user_manager', 'finance_viewer']
        if (redirectUrl) {
          router.push(redirectUrl)
        } else if (adminRoles.includes(userRole)) {
          router.push('/admin')
        } else {
          router.push('/dashboard')
        }
      } else {
        setError(data.error || '登录失败')
      }
    } catch (_err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleClearSavedPhone = () => {
    localStorage.removeItem('savedPhone')
    setFormData(prev => ({ ...prev, phone: '', rememberMe: false }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">欢迎回来</h1>
            <p className="text-gray-600 mt-2">登录您的账户以继续</p>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                手机号
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="请输入手机号"
                  required
                />
                {hasSavedPhone && (
                  <button
                    type="button"
                    onClick={handleClearSavedPhone}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                    title="清除保存的手机号"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="请输入密码"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700">
                  记住我
                </label>
              </div>
              <button
                type="button"
                onClick={handleClearSavedPhone}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                清除记录
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              还没有账号？{' '}
              <Link href="/register" className="text-blue-600 hover:underline font-medium">
                立即注册
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-500">加载中...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}