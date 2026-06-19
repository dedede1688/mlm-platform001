'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User, Copy, Check, ShoppingBag, Wallet, Users, Coins,
  TrendingUp, Award, Clock, MapPin
} from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

// ---- 类型 ----

interface UserInfo {
  id: string
  phone: string
  nickname: string | null
  level: number
  balance: number
  frozenBalance: number
  totalPoints: number
  unlockedPoints: number
  lockedPoints: number
  directDistributorCount: number
}

// ---- 等级配置 ----

const LEVEL_CONFIG: Record<number, { name: string; color: string; bg: string }> = {
  0: { name: '游客', color: 'text-gray-600', bg: 'bg-gray-100' },
  1: { name: '会员', color: 'text-blue-600', bg: 'bg-blue-100' },
  2: { name: '经销商', color: 'text-green-600', bg: 'bg-green-100' },
  3: { name: '主任', color: 'text-purple-600', bg: 'bg-purple-100' },
  4: { name: '经理', color: 'text-orange-600', bg: 'bg-orange-100' },
  5: { name: '总监', color: 'text-pink-600', bg: 'bg-pink-100' },
  6: { name: '总裁', color: 'text-red-600', bg: 'bg-red-100' },
  7: { name: '董事', color: 'text-amber-600', bg: 'bg-amber-100' },
}

// ---- 主组件 ----

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [totalRewards, setTotalRewards] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [pendingOrders, setPendingOrders] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }
    fetchAllData(token)
  }, [router])

  const fetchAllData = async (token: string) => {
    try {
      const [userRes, rewardsRes, teamRes, ordersRes] = await Promise.allSettled([
        fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/rewards', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/users/team', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      // 用户信息
      if (userRes.status === 'fulfilled' && userRes.value.ok) {
        const data = await userRes.value.json()
        if (data.success) {
          setUser(data.data)
        } else {
          localStorage.removeItem('token')
          router.push('/login')
          return
        }
      }

      // 累计收益
      if (rewardsRes.status === 'fulfilled' && rewardsRes.value.ok) {
        const data = await rewardsRes.value.json()
        if (data.success && Array.isArray(data.data)) {
          const sum = data.data
            .filter((r: { status: string }) => r.status === 'paid')
            .reduce((acc: number, r: { amount: number }) => acc + r.amount, 0)
          setTotalRewards(Math.round(sum * 100) / 100)
        }
      }

      // 团队人数
      if (teamRes.status === 'fulfilled' && teamRes.value.ok) {
        const data = await teamRes.value.json()
        if (data.success && Array.isArray(data.data)) {
          setTeamCount(data.data.length)
        }
      }

      // 待处理订单
      if (ordersRes.status === 'fulfilled' && ordersRes.value.ok) {
        const data = await ordersRes.value.json()
        if (data.success && Array.isArray(data.data)) {
          setPendingOrders(data.data.filter((o: { status: string }) => o.status === 'pending').length)
        }
      }
    } catch (error) {
      console.error('Fetch data error:', error)
    } finally {
      setLoading(false)
    }
  }

  const _handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  const handleCopyReferralCode = () => {
    if (user) {
      navigator.clipboard.writeText(user.phone)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // 问候语
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 12) return '早上好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }

  // 加载状态
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-80 bg-white rounded-xl shadow-md animate-pulse" />
            <div className="md:col-span-2 space-y-6">
              <div className="h-24 bg-white rounded-xl shadow-md animate-pulse" />
              <div className="h-40 bg-white rounded-xl shadow-md animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!user) return null

  const levelConf = LEVEL_CONFIG[user.level] || LEVEL_CONFIG[1]

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
      {/* ====== Main ====== */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">

          {/* ====== 侧边栏 ====== */}
          <div className="md:col-span-1 space-y-4 sm:space-y-6">
            {/* 用户信息卡片 */}
            <div className="card-base p-4 sm:p-6 text-center">
              {/* 头像 */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <User className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
              </div>
              {/* 昵称 + 等级 */}
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1.5 sm:mb-2">
                {user.nickname || user.phone}
              </h2>
              <span className={`inline-block px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium ${levelConf.bg} ${levelConf.color}`}>
                {levelConf.name}
              </span>

              {/* 分割线 */}
              <div className="border-t border-gray-100 my-3 sm:my-4" />

              {/* 推荐码 */}
              <div className="text-left">
                <p className="text-[10px] sm:text-xs text-gray-400 mb-1">我的推荐码</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary text-base sm:text-lg flex-1 truncate">{user.phone}</span>
                  <button
                    onClick={handleCopyReferralCode}
                    className={`w-8 h-8 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      copied
                        ? 'bg-green-100 text-green-600'
                        : 'bg-primary-50 text-primary hover:bg-primary-100'
                    }`}
                    title="复制推荐码"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">分享给好友注册，可获得推荐奖励</p>
              </div>
            </div>

            {/* 余额 & 积分 */}
            <div className="card-base p-4 sm:p-6">
              <div className="grid grid-cols-3 gap-2 sm:gap-0 sm:space-y-0 sm:block sm:space-y-4">
                <div className="text-center sm:text-left">
                  <p className="text-[10px] sm:text-sm text-gray-400 mb-0.5 sm:mb-1">可用余额</p>
                  <p className="text-base sm:text-2xl font-bold text-primary">¥{formatMoney(user.balance)}</p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-[10px] sm:text-sm text-gray-400 mb-0.5 sm:mb-1">冻结余额</p>
                  <p className="text-sm sm:text-lg font-semibold text-gray-500">¥{formatMoney(user.frozenBalance)}</p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-[10px] sm:text-sm text-gray-400 mb-0.5 sm:mb-1">可用积分</p>
                  <p className="text-base sm:text-2xl font-bold text-secondary">{user.unlockedPoints}</p>
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="border-t border-gray-100 my-4" />
                <div className="border-t border-gray-100 my-4" />
              </div>
              <div className="sm:hidden border-t border-gray-100 mt-3 pt-2">
                <p className="text-[10px] text-gray-400 text-center">锁定积分: {user.lockedPoints}</p>
              </div>
              <div className="hidden sm:flex items-center justify-between mt-4">
                <div>
                  <p className="text-xs text-gray-400">锁定积分: {user.lockedPoints}</p>
                </div>
                <Coins className="w-8 h-8 text-secondary/30" />
              </div>
            </div>
          </div>

          {/* ====== 主内容区 ====== */}
          <div className="md:col-span-2 space-y-4 sm:space-y-6">
            {/* 欢迎语 */}
            <div className="card-base p-4 sm:p-6 bg-gradient-to-r from-primary to-primary-600 text-white">
              <h1 className="text-lg sm:text-2xl font-bold mb-0.5 sm:mb-1">
                {getGreeting()}，{user.nickname || user.phone}
              </h1>
              <p className="text-primary-100 text-xs sm:text-sm">欢迎回来，祝您今天收获满满</p>
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatCard
                icon={<Users className="w-5 h-5" />}
                label="直推经销商"
                value={String(user.directDistributorCount)}
                color="text-purple-600 bg-purple-50"
              />
              <StatCard
                icon={<User className="w-5 h-5" />}
                label="团队总人数"
                value={String(teamCount)}
                color="text-blue-600 bg-blue-50"
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5" />}
                label="累计收益"
                value={`¥${totalRewards.toFixed(2)}`}
                color="text-green-600 bg-green-50"
              />
              <StatCard
                icon={<Clock className="w-5 h-5" />}
                label="待处理订单"
                value={String(pendingOrders)}
                color="text-orange-600 bg-orange-50"
              />
            </div>

            {/* 快捷入口 */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">快捷入口</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                <QuickLink
                  href="/dashboard/orders"
                  icon={<ShoppingBag className="w-6 h-6" />}
                  label="我的订单"
                  desc="查看订单记录"
                  color="text-blue-600 bg-blue-50"
                />
                <QuickLink
                  href="/dashboard/addresses"
                  icon={<MapPin className="w-6 h-6" />}
                  label="收货地址"
                  desc="管理收货地址"
                  color="text-rose-600 bg-rose-50"
                />
                <QuickLink
                  href="/dashboard/rewards"
                  icon={<Wallet className="w-6 h-6" />}
                  label="收益明细"
                  desc="查看奖励记录"
                  color="text-green-600 bg-green-50"
                />
                <QuickLink
                  href="/dashboard/team"
                  icon={<Users className="w-6 h-6" />}
                  label="我的团队"
                  desc="查看推荐关系"
                  color="text-purple-600 bg-purple-50"
                />
                <QuickLink
                  href="/dashboard/points"
                  icon={<Coins className="w-6 h-6" />}
                  label="积分管理"
                  desc="查看积分记录"
                  color="text-secondary bg-amber-50"
                />
              </div>
            </div>

            {/* 等级信息 */}
            <div className="card-base p-4 sm:p-6">
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Award className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">会员等级</h3>
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[280px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 sm:px-0 text-gray-400 font-medium">等级</th>
                      <th className="text-left py-2 px-2 sm:px-0 text-gray-400 font-medium">身份</th>
                      <th className="text-left py-2 px-2 sm:px-0 text-gray-400 font-medium">核心权益</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      { lv: 1, name: '会员', desc: '会员价购物、推荐奖20%' },
                      { lv: 2, name: '经销商', desc: '+品牌管理奖20%、购物积分' },
                      { lv: 3, name: '主任', desc: '+分红奖5%资格' },
                      { lv: 7, name: '董事', desc: '最高等级、全部权益' },
                    ].map((row) => (
                      <tr key={row.lv} className={`${user.level >= row.lv ? 'text-gray-900' : 'text-gray-400'}`}>
                        <td className="py-2 px-2 sm:px-0 sm:py-2.5">
                          <span className={`inline-block w-5 h-5 sm:w-6 sm:h-6 rounded-full text-center text-[10px] sm:text-xs leading-5 sm:leading-6 font-bold ${
                            user.level >= row.lv ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {row.lv}
                          </span>
                        </td>
                        <td className="py-2 px-2 sm:px-0 sm:py-2.5 font-medium">{row.name}</td>
                        <td className="py-2 px-2 sm:px-0 sm:py-2.5">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}

// ---- 统计卡片 ----

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  const [textColor, bgColor] = color.split(' ')
  return (
    <div className="card-base p-3 sm:p-4">
      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg ${bgColor} ${textColor} flex items-center justify-center mb-1.5 sm:mb-2`}>
        {icon}
      </div>
      <p className="text-sm sm:text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] sm:text-xs text-gray-400">{label}</p>
    </div>
  )
}

// ---- 快捷入口 ----

function QuickLink({
  href,
  icon,
  label,
  desc,
  color,
}: {
  href: string
  icon: React.ReactNode
  label: string
  desc: string
  color: string
}) {
  const [textColor, bgColor] = color.split(' ')
  return (
    <Link href={href} className="card-base p-3 sm:p-5 group">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${bgColor} ${textColor} flex items-center justify-center mb-2 sm:mb-3 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-0.5">{label}</h4>
      <p className="text-[10px] sm:text-xs text-gray-400">{desc}</p>
    </Link>
  )
}