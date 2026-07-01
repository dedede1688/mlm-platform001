'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  User, Copy, Check, ShoppingBag, Wallet, Users, Coins,
  TrendingUp, Award, Clock, MapPin, ShieldCheck,
  CheckCircle2, Lock, Camera, BarChart3, PieChart as PieIcon
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { formatMoney } from '@/lib/utils/format'
import AvatarUploadModal from '@/components/dashboard/AvatarUploadModal'

// ---- 类型 ----

// v62 P2-B: 大盘聚合数据
interface DashboardData {
  kpi: {
    monthEarnings: number
    monthOrders: number
    pendingLockedAmount: number
    availableAmount: number
    pendingAmount: number
  }
  categoryBreakdown: Array<{
    type: string
    label: string
    amount: number
    color: string
  }>
  trend: Array<{ month: string; amount: number }>
  timeline: Array<{
    id: string
    date: string
    amount: number
    type: string
    label: string
    orderNo: string | null
  }>
}

interface UserInfo {
  id: string
  phone: string
  nickname: string | null
  avatarUrl: string | null
  level: number
  balance: number
  frozenBalance: number
  consumeBalance: number
  earningsPending: number
  earningsAvailable: number
  earningsVoided: number
  totalPoints: number
  unlockedPoints: number
  lockedPoints: number
  directDistributorCount: number
  upgradeProductCount: number
  hasUpgradeProduct: boolean
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
  const [referralRate, setReferralRate] = useState(0.20)
  const [brandBonusRate, setBrandBonusRate] = useState(0.20)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  // v62 P2-B: 大盘聚合数据
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

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
          // v50 G: 动态百分比
          if (data.data.referralRate !== undefined) setReferralRate(data.data.referralRate)
          if (data.data.brandBonusRate !== undefined) setBrandBonusRate(data.data.brandBonusRate)
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

    // v62 P2-B: 并行拉取大盘聚合数据(用户不阻塞主流程)
    try {
      const dashRes = await fetch('/api/user/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (dashRes.ok) {
        const json = await dashRes.json()
        if (json.success) setDashboard(json.data)
      }
    } catch {
      // 大盘数据加载失败不致命
    }
  }

  const handleSaveAvatar = async (avatarUrl: string) => {
    const token = localStorage.getItem('token') || ''
    const res = await fetch('/api/users/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ avatarUrl }),
    })
    const data = await res.json()
    if (data.success) {
      setUser((prev) => (prev ? { ...prev, avatarUrl: data.data.avatarUrl ?? avatarUrl } : prev))
    } else {
      const msg = data.error || '头像保存失败'
      alert(msg)
      throw new Error(msg)
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

        {/* ====== v62 P2-B: 用户可视化大盘 ====== */}
        {dashboard && <DashboardSection data={dashboard} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">

          {/* ====== 侧边栏 ====== */}
          <div className="md:col-span-1 space-y-4 sm:space-y-6">
            {/* 用户信息卡片 */}
            <div className="card-base p-4 sm:p-6 text-center">
              {/* 头像 */}
              <button
                type="button"
                onClick={() => setAvatarModalOpen(true)}
                className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center mx-auto mb-3 sm:mb-4 group border-2 border-transparent hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label="更换头像"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt="头像"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <User className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </button>
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
                  <div className="flex items-center justify-center sm:justify-between mb-0.5 sm:mb-1">
                    <p className="text-[10px] sm:text-sm text-gray-400">可用余额</p>
                    <Link
                      href="/dashboard/balance"
                      className="hidden sm:inline text-[10px] sm:text-xs text-primary hover:text-primary-600 hover:underline"
                    >
                      查看流水 →
                    </Link>
                  </div>
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
              <div className="border-t border-gray-100 mt-3 pt-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[10px] sm:text-xs text-gray-400">消费余额</span>
                    <span className="text-[10px] sm:text-xs font-medium text-gray-600">¥{formatMoney(user.consumeBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] sm:text-xs text-gray-400">待结算收益</span>
                    <span className="text-[10px] sm:text-xs font-medium text-gray-600">¥{formatMoney(user.earningsPending)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] sm:text-xs text-gray-400">已结算收益</span>
                    <span className="text-[10px] sm:text-xs font-medium text-green-600">¥{formatMoney(user.earningsAvailable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] sm:text-xs text-gray-400">已作废收益</span>
                    <span className="text-[10px] sm:text-xs font-medium text-red-500">¥{formatMoney(user.earningsVoided)}</span>
                  </div>
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
                  href="/dashboard/withdrawals"
                  icon={<Wallet className="w-6 h-6" />}
                  label="提现申请"
                  desc="申请余额提现"
                  color="text-orange-600 bg-orange-50"
                />
                <QuickLink
                  href="/dashboard/payment-password"
                  icon={<ShieldCheck className="w-6 h-6" />}
                  label="支付密码"
                  desc="设置/修改密码"
                  color="text-amber-600 bg-amber-50"
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

            {/* v50 E: 会员身份双轨制卡片 */}
            <div className="card-base p-4 sm:p-5 mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">会员身份</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  user.hasUpgradeProduct ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {user.hasUpgradeProduct ? '✅ 已解锁' : '🔒 未解锁'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-700">会员价购物</span>
                  <span className="text-xs text-green-600 font-medium ml-auto">已开通</span>
                </div>
                <div className="flex items-center gap-2">
                  {user.hasUpgradeProduct ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <Lock className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-sm text-gray-700">推荐奖 20%</span>
                  <span className={`text-xs font-medium ml-auto ${
                    user.hasUpgradeProduct ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {user.hasUpgradeProduct ? '已解锁' : '未解锁'}
                  </span>
                </div>
              </div>

              {!user.hasUpgradeProduct && (
                <Link
                  href="/products?category=upgrade"
                  className="block w-full text-center bg-gradient-to-r from-orange-500 to-amber-500 text-white py-2.5 rounded-lg text-sm font-medium hover:from-orange-600 hover:to-amber-600 transition-all"
                >
                  💡 购买 1 件升级品即可解锁推荐奖
                </Link>
              )}

              {user.hasUpgradeProduct && (
                <p className="text-xs text-gray-500 text-center">
                  ✅ 推荐奖已解锁，推荐好友下单即可获得 20% 推荐奖
                </p>
              )}
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
                      { lv: 1, name: '会员', desc: `会员价购物、推荐奖${(referralRate * 100).toFixed(0)}%` },
                      { lv: 2, name: '经销商', desc: `+品牌管理奖${(brandBonusRate * 100).toFixed(0)}%、购物积分` },
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

      <AvatarUploadModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        currentAvatarUrl={user?.avatarUrl}
        onSave={handleSaveAvatar}
      />
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

// ---- v62 P2-B: 用户可视化大盘 ----

function DashboardSection({ data }: { data: DashboardData }) {
  const { kpi, categoryBreakdown, trend, timeline } = data
  const trendHasData = trend.some(t => t.amount > 0)
  const pieHasData = categoryBreakdown.length > 0
  const totalMonthAmount = categoryBreakdown.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">本月收益大盘</h2>
        <span className="text-xs sm:text-sm text-gray-400 ml-auto">本月 ¥{formatMoney(kpi.monthEarnings)}</span>
      </div>

      {/* KPI 4 卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <KpiTile
          label="本月收益"
          value={`¥${formatMoney(kpi.monthEarnings)}`}
          hint={`${kpi.monthOrders} 单`}
          color="from-emerald-500 to-emerald-600"
        />
        <KpiTile
          label="已到账"
          value={`¥${formatMoney(kpi.availableAmount)}`}
          hint="可提现"
          color="from-blue-500 to-blue-600"
        />
        <KpiTile
          label="缓冲期"
          value={`¥${formatMoney(kpi.pendingAmount)}`}
          hint="待锁定"
          color="from-amber-500 to-amber-600"
        />
        <KpiTile
          label="待解锁"
          value={`¥${formatMoney(kpi.pendingLockedAmount)}`}
          hint="积分估算"
          color="from-purple-500 to-purple-600"
        />
      </div>

      {/* 分类饼图 + 趋势线 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        <div className="card-base p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="w-4 h-4 text-primary" />
            <h3 className="text-sm sm:text-base font-semibold text-gray-900">收益来源</h3>
          </div>
          {pieHasData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 items-center">
              <div className="h-44 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      innerRadius="45%"
                      paddingAngle={2}
                    >
                      {categoryBreakdown.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `¥${formatMoney(Number(v))}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 sm:space-y-1.5 text-xs sm:text-sm">
                {categoryBreakdown.map(c => (
                  <div key={c.type} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="flex-1 text-gray-700 truncate">{c.label}</span>
                    <span className="font-medium text-gray-900">¥{formatMoney(c.amount)}</span>
                    <span className="text-gray-400 w-12 text-right">
                      {totalMonthAmount > 0 ? Math.round((c.amount / totalMonthAmount) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">本月暂无收益明细</p>
          )}
        </div>

        <div className="card-base p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm sm:text-base font-semibold text-gray-900">最近 6 个月收益</h3>
          </div>
          {trendHasData ? (
            <div className="h-44 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <Tooltip formatter={(v: any) => `¥${formatMoney(Number(v))}`} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f97316' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">近 6 个月暂无收益</p>
          )}
        </div>
      </div>

      {/* 时间线 */}
      <div className="card-base p-4 sm:p-5">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">本月收益明细</h3>
        {timeline.length > 0 ? (
          <ol className="relative border-l-2 border-orange-200 ml-2 space-y-3">
            {timeline.map(item => (
              <li key={item.id} className="ml-4 pb-1">
                <span
                  className="absolute -left-1.5 w-3 h-3 rounded-full"
                  style={{ backgroundColor: getCategoryColor(item.type) }}
                />
                <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-medium truncate">{item.label}</p>
                    <p className="text-gray-400 text-[10px] sm:text-xs">
                      {new Date(item.date).toLocaleString('zh-CN', { hour12: false })}
                      {item.orderNo && ` · ${item.orderNo}`}
                    </p>
                  </div>
                  <span className="font-bold text-emerald-600 flex-shrink-0">
                    +¥{formatMoney(item.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">本月暂无明细</p>
        )}
      </div>
    </div>
  )
}

function KpiTile({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
  return (
    <div className="card-base p-3 sm:p-4">
      <p className="text-[10px] sm:text-xs text-gray-400 font-medium">{label}</p>
      <p className={`text-lg sm:text-2xl font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent mt-1`}>
        {value}
      </p>
      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{hint}</p>
    </div>
  )
}

function getCategoryColor(type: string): string {
  const map: Record<string, string> = {
    referral: '#3b82f6',
    brand_bonus: '#10b981',
    upgrade_reward: '#a855f7',
    manual_reward: '#f59e0b',
    dividend: '#ef4444',
  }
  return map[type] || '#6b7280'
}