'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2, User, Phone, Shield } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

interface UserInfo {
  id: string
  phone: string
  nickname: string
  level: number
  role: string
  avatarUrl?: string | null
}

export default function ProfilePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 改密表单
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
    fetchUser(storedToken)
  }, [router])

  const fetchUser = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setUser(data.data)
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (!token) return

    // 前端校验
    if (!oldPassword) {
      toast.error('请输入旧密码')
      return
    }
    if (newPassword.length < 8) {
      toast.error('新密码至少 8 位')
      return
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      toast.error('新密码必须包含字母和数字')
      return
    }
    if (newPassword === oldPassword) {
      toast.error('新密码不能与旧密码相同')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的密码不一致')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()

      if (data.success) {
        toast.success('密码修改成功')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        toast.error(data.error || data.message || '密码修改失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    )
  }

  const levelNames: Record<number, string> = {
    0: '游客', 1: '会员', 2: '经销商', 3: '主任',
    4: '经理', 5: '总监', 6: '总裁', 7: '董事',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* 返回 */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-orange-600 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回 Dashboard
        </Link>

        {/* 个人信息卡片 */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-orange-500" />
            个人信息
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 py-2 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="头像" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-orange-500" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">昵称</p>
                <p className="text-base font-medium text-gray-800">{user?.nickname || '未设置'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Phone className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">手机号</p>
                <p className="text-base font-medium text-gray-800">{user?.phone || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 py-2">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">等级</p>
                <p className="text-base font-medium text-gray-800">
                  {user ? levelNames[user.level] || `Lv.${user.level}` : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 修改密码卡片 */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-orange-500" />
            修改密码
          </h2>

          <div className="space-y-4">
            {/* 旧密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">旧密码</label>
              <div className="relative">
                <input
                  type={showOld ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="请输入旧密码"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 新密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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

            {/* 确认新密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
              onClick={handleChangePassword}
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
              ) : '确认修改'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
