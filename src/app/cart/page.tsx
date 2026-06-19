'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ShoppingCart, Trash2, ShoppingBag, ArrowRight, Loader2, Coins } from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import { CheckoutDialog, CheckoutInput, CheckoutProduct, SavedAddress } from '@/components/checkout/CheckoutDialog'

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
  phone?: string              // v43-4-修复-2: 默认填到弹窗手机号
  hasPaymentPassword?: boolean // v43-4-修复-2: 决定弹窗显示"去设置"还是"去修改"
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

  // v43-4-修复: checkout 弹窗（用公共组件，弹窗内部管理输入字段）
  const [checkoutItem, setCheckoutItem] = useState<CartItem | null>(null)
  // v43-5: 用户地址簿
  const [addresses, setAddresses] = useState<SavedAddress[]>([])

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchCart(storedToken)
    fetchUserInfo(storedToken)
    fetchAddresses(storedToken)
  }, [router])

  const fetchUserInfo = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setUserInfo({
            unlockedPoints: data.data.unlockedPoints || 0,
            phone: data.data.phone,
            hasPaymentPassword: data.data.hasPaymentPassword,
          })
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

  // v43-5: 加载用户地址簿
  const fetchAddresses = async (authToken: string) => {
    try {
      const res = await fetch('/api/user/addresses', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setAddresses(data.data || [])
      }
    } catch (error) {
      console.error('获取地址列表失败:', error)
    }
  }

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

  // v43-4-修复: 打开 checkout 弹窗
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

    setCheckoutItem(item)
  }

  // v43-4-修复: CheckoutDialog 提交回调（创建订单 + 验证支付密码 + 删购物车项 + 跳转）
  const handleCheckoutConfirm = async (input: CheckoutInput): Promise<{ orderId: string } | null> => {
    if (!checkoutItem || !token) return null

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
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        shippingAddress: input.shippingAddress,
      }),
    })

    if (!orderRes.ok) {
      const errData = await orderRes.json()
      toast.error(errData.error || '创建订单失败')
      return null
    }

    const orderData = await orderRes.json()
    const orderId = orderData.data?.id

    if (!orderId) {
      toast.error('创建订单失败：未获取到订单ID')
      return null
    }

    // 2. 验证支付密码 + 标记已支付
    const verifyRes = await fetch(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password: input.payPassword }),
    })

    if (!verifyRes.ok) {
      const verifyErr = await verifyRes.json()
      toast.error(verifyErr.error || '支付验证失败')
      return null
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
    return { orderId }
  }

  const handleCheckoutClose = () => {
    setCheckoutItem(null)
  }

  // v43-5: 下单成功后保存地址到地址簿
  const handleSaveAddress = async (data: {
    recipientName: string
    phone: string
    province: string
    city: string
    district: string
    detailAddress: string
  }): Promise<boolean> => {
    if (!token) return false
    try {
      const res = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, isDefault: addresses.length === 0 }),
      })
      const result = await res.json()
      if (result.success) {
        await fetchAddresses(token)
        return true
      }
      return false
    } catch {
      return false
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

      {/* v43-4-修复: Checkout 弹窗（公共组件） */}
      <CheckoutDialog
        open={!!checkoutItem}
        onClose={handleCheckoutClose}
        product={checkoutItem ? {
          id: checkoutItem.product.id,
          name: checkoutItem.product.name,
          memberPrice: checkoutItem.product.memberPrice,
          imageUrl: checkoutItem.product.imageUrl,
          pointsUsed: pointsMap[checkoutItem.id] || 0,
        } as CheckoutProduct : null}
        onConfirm={handleCheckoutConfirm}
        defaultPhone={userInfo?.phone || ''}
        hasPaymentPassword={userInfo?.hasPaymentPassword || false}
        existingAddresses={addresses}
        onSaveAddress={handleSaveAddress}
      />
    </div>
  )
}