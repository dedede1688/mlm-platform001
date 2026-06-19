'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart, Trash2, ShoppingBag, ArrowRight, Loader2, Coins, X, MapPin, User, Phone, Lock } from 'lucide-react'
import { toast } from '@/components/ToastProvider'

interface CartProduct {
  id: string
  name: string
  imageUrl: string | null
  retailPrice: number
  memberPrice: number
  stock: number
  status: string
  isUpgradeProduct: boolean
  maxPointsRatio: number | null
}

interface CartItem {
  id: string
  quantity: number
  createdAt: string
  product: CartProduct
}

interface UserInfo {
  unlockedPoints: number
}

export default function CartPage() {
  const router = useRouter()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  // 每个购物车项的积分使用量，key 为 cartItemId
  const [pointsMap, setPointsMap] = useState<Record<string, number>>({})

  // v43-4: checkout 弹窗状态
  const [checkoutItem, setCheckoutItem] = useState<CartItem | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [payPassword, setPayPassword] = useState('')
  const [showPayPwd, setShowPayPwd] = useState(false)
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchCart(storedToken)
    fetchUserInfo(storedToken)
  }, [router])

  const fetchUserInfo = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setUserInfo({ unlockedPoints: data.data.unlockedPoints || 0 })
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  }

  // 计算某商品可使用的最大积分数
  const getMaxPoints = useCallback((item: CartItem) => {
    const ratio = (item.product.maxPointsRatio ?? 50) / 100
    const maxFromPrice = Math.floor(item.product.memberPrice * ratio)
    const maxFromUser = userInfo?.unlockedPoints ?? 0
    return Math.min(maxFromPrice, maxFromUser)
  }, [userInfo])

  const fetchCart = async (authToken: string) => {
    try {
      const res = await fetch('/api/cart', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.status === 401) {
        localStorage.removeItem('token')
        router.push('/login')
        return
      }
      const data = await res.json()
      if (data.success) {
        setCartItems(data.data || [])
      }
    } catch (error) {
      console.error('获取购物车失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (cartItemId: string) => {
    if (!token) return
    setDeletingId(cartItemId)

    try {
      const res = await fetch(`/api/cart/${cartItemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        setCartItems(prev => prev.filter(item => item.id !== cartItemId))
      } else {
        const data = await res.json()
        toast.error(data.error || '删除失败')
      }
    } catch (_error) {
      toast.error('网络错误，请重试')
    } finally {
      setDeletingId(null)
    }
  }

  // v43-4: 打开 checkout 弹窗（替代原来的直接购买流程）
  const handleBuyNow = (item: CartItem) => {
    if (!token) {
      router.push('/login')
      return
    }

    // 积分验证
    const pointsUsed = pointsMap[item.id] || 0
    const maxPoints = getMaxPoints(item)
    if (pointsUsed < 0 || !Number.isInteger(pointsUsed)) {
      toast.error('积分数量必须为非负整数')
      return
    }
    if (pointsUsed > maxPoints) {
      toast.error(`最多可使用 ${maxPoints} 积分`)
      return
    }
    if (pointsUsed > (userInfo?.unlockedPoints ?? 0)) {
      toast.error(`可用积分不足，当前可用 ${userInfo?.unlockedPoints ?? 0} 积分`)
      return
    }

    // 打开弹窗
    setCheckoutItem(item)
    setRecipientName('')
    setRecipientPhone('')
    setShippingAddress('')
    setPayPassword('')
  }

  // v43-4: 提交 checkout 弹窗（创建订单 + 验证支付密码）
  const handleCheckoutSubmit = async () => {
    if (!checkoutItem || !token) return

    // 校验收货信息
    if (!recipientName.trim()) {
      toast.error('请输入收件人姓名')
      return
    }
    if (!recipientPhone.trim() || !/^1\d{10}$/.test(recipientPhone.trim())) {
      toast.error('请输入正确的手机号')
      return
    }
    if (!shippingAddress.trim()) {
      toast.error('请输入详细地址')
      return
    }
    if (!/^\d{6}$/.test(payPassword)) {
      toast.error('支付密码必须为 6 位数字')
      return
    }

    setCheckoutSubmitting(true)
    try {
      const pointsUsed = pointsMap[checkoutItem.id] || 0

      // 1. 创建订单（带收货信息）
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: [{ productId: checkoutItem.product.id, quantity: 1 }],
          pointsUsed,
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim(),
          shippingAddress: shippingAddress.trim(),
        }),
      })

      if (!orderRes.ok) {
        const errData = await orderRes.json()
        toast.error(errData.error || '创建订单失败')
        return
      }

      const orderData = await orderRes.json()
      const orderId = orderData.data?.id

      if (!orderId) {
        toast.error('创建订单失败：未获取到订单ID')
        return
      }

      // 2. 验证支付密码 + 标记已支付
      const verifyRes = await fetch(`/api/orders/${orderId}/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: payPassword }),
      })

      if (!verifyRes.ok) {
        const verifyErr = await verifyRes.json()
        toast.error(verifyErr.error || '支付验证失败')
        return
      }

      // 3. 成功：删除购物车项 + 跳转订单详情
      await fetch(`/api/cart/${checkoutItem.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      setCartItems(prev => prev.filter(i => i.id !== checkoutItem.id))
      setPointsMap(prev => {
        const next = { ...prev }
        delete next[checkoutItem.id]
        return next
      })
      fetchUserInfo(token)
      setCheckoutItem(null)
      toast.success('购买成功！')
      router.push(`/dashboard/orders/${orderId}`)

    } catch (_error) {
      toast.error('网络错误，请重试')
    } finally {
      setCheckoutSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">我的购物车</h1>
          {cartItems.length > 0 && (
            <span className="text-xs sm:text-sm text-gray-500">（{cartItems.length} 件商品）</span>
          )}
          {userInfo && (
            <span className="ml-auto flex items-center gap-1 text-xs sm:text-sm text-amber-600">
              <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              可用积分：{userInfo.unlockedPoints}
            </span>
          )}
        </div>

        {cartItems.length === 0 ? (
          /* 空购物车 */
          <div className="bg-white rounded-xl shadow-sm py-20 text-center">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg text-gray-500 mb-2">购物车为空</p>
            <p className="text-sm text-gray-400 mb-6">快去挑选心仪的商品吧</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg
                hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow-md"
            >
              去购物
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          /* 购物车列表 */
          <div className="space-y-4">
            {cartItems.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-xl shadow-sm p-3 sm:p-6"
              >
                {/* 上部：图片 + 信息 + 桌面端操作 */}
                <div className="flex items-start gap-3 sm:gap-6">
                  {/* 商品图片 */}
                  <Link
                    href={`/products/${item.product.id}`}
                    className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 rounded-lg overflow-hidden relative"
                  >
                    {item.product.imageUrl ? (
                      <Image
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                        暂无图片
                      </div>
                    )}
                  </Link>

                  {/* 商品信息 */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/products/${item.product.id}`}
                      className="text-sm sm:text-base font-medium text-gray-900 hover:text-blue-600 transition-colors line-clamp-2"
                    >
                      {item.product.name}
                    </Link>
                    {item.product.isUpgradeProduct && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] sm:text-xs rounded-full">
                        升级产品
                      </span>
                    )}
                    <div className="mt-1.5 sm:mt-2 flex items-center gap-2 sm:gap-3">
                      <span className="text-base sm:text-lg font-bold text-red-600">
                        ¥{item.product.memberPrice.toFixed(2)}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-400 line-through">
                        ¥{item.product.retailPrice.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">× {item.quantity}</p>
                  </div>

                  {/* 桌面端操作按钮 */}
                  <div className="hidden sm:flex flex-shrink-0 flex-col items-end gap-2">
                    <button
                      onClick={() => handleBuyNow(item)}
                      disabled={buyingId === item.id}
                      className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
                        buyingId === item.id
                          ? 'bg-blue-400 text-white cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                      }`}
                    >
                      {buyingId === item.id
                        ? '处理中...'
                        : `¥${(item.product.memberPrice - (pointsMap[item.id] || 0)).toFixed(2)} 购买`
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id || buyingId === item.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="删除"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 积分抵扣 */}
                <div className="mt-2 sm:mt-3 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs text-gray-500">积分抵扣</span>
                  <input
                    type="number"
                    min={0}
                    max={getMaxPoints(item)}
                    value={pointsMap[item.id] || 0}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0
                      setPointsMap(prev => ({ ...prev, [item.id]: val < 0 ? 0 : val }))
                    }}
                    className="w-16 sm:w-20 px-2 py-1.5 sm:py-1 text-xs sm:text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    disabled={buyingId === item.id}
                  />
                  <span className="text-[10px] sm:text-xs text-gray-400">
                    最多 {getMaxPoints(item)} 积分
                  </span>
                  {pointsMap[item.id] > 0 && (
                    <span className="text-[10px] sm:text-xs text-red-500 font-medium">
                      -¥{(pointsMap[item.id] || 0).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* 移动端操作按钮 */}
                <div className="mt-3 sm:hidden flex items-center justify-between">
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id || buyingId === item.id}
                    className="flex items-center gap-1 px-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="删除"
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    删除
                  </button>
                  <button
                    onClick={() => handleBuyNow(item)}
                    disabled={buyingId === item.id}
                    className={`px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                      buyingId === item.id
                        ? 'bg-blue-400 text-white cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                    }`}
                  >
                    {buyingId === item.id
                      ? '处理中...'
                      : `¥${(item.product.memberPrice - (pointsMap[item.id] || 0)).toFixed(2)} 购买`
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* v43-4: Checkout 弹窗 */}
      {checkoutItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            {/* Sticky 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-gray-900">确认订单</h2>
              <button
                onClick={() => setCheckoutItem(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 滚动内容区 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* 商品信息 */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-900 line-clamp-2">{checkoutItem.product.name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-base font-bold text-red-600">
                    ¥{checkoutItem.product.memberPrice.toFixed(2)}
                  </span>
                  {(pointsMap[checkoutItem.id] || 0) > 0 && (
                    <span className="text-xs text-orange-600">
                      -¥{(pointsMap[checkoutItem.id] || 0).toFixed(2)} (积分抵扣)
                    </span>
                  )}
                </div>
              </div>

              {/* 收件人姓名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <User className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                  收件人姓名
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="请输入收件人姓名"
                  maxLength={20}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* 手机号 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <Phone className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                  手机号码
                </label>
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                  placeholder="请输入手机号"
                  maxLength={11}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* 详细地址 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                  详细地址
                </label>
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="省/市/区/街道/门牌号"
                  rows={2}
                  maxLength={200}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>

              {/* 支付密码 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <Lock className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                  支付密码
                </label>
                <div className="relative">
                  <input
                    type={showPayPwd ? 'text' : 'password'}
                    value={payPassword}
                    onChange={(e) => setPayPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 位数字支付密码"
                    maxLength={6}
                    className="w-full px-3.5 py-2.5 pr-11 border border-gray-300 rounded-lg text-center tracking-[0.5em] font-mono text-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPayPwd(!showPayPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    {showPayPwd ? <X className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">未设置？<a href="/dashboard/payment-password" className="text-blue-600 hover:underline">去设置</a></p>
              </div>
            </div>

            {/* Sticky 底部按钮 */}
            <div className="px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-500">实付金额</span>
                <span className="text-xl font-bold text-red-600">
                  ¥{(checkoutItem.product.memberPrice - (pointsMap[checkoutItem.id] || 0)).toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleCheckoutSubmit}
                disabled={checkoutSubmitting}
                className={`w-full py-3 rounded-xl font-semibold text-base text-white transition-all ${
                  checkoutSubmitting
                    ? 'bg-orange-400 cursor-not-allowed'
                    : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-md'
                }`}
              >
                {checkoutSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中...
                  </span>
                ) : (
                  '确认下单'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}