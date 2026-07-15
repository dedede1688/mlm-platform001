'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ChevronLeft, ChevronRight, Package, ShoppingCart, Zap, Tag, Shield,
  X, Loader2, FlaskConical, CheckCircle2, AlertCircle, RefreshCw
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import { CheckoutDialog, CheckoutInput, CheckoutProduct, SavedAddress, CheckoutLockedShipping } from '@/components/checkout/CheckoutDialog'
import { EarningsTransferModal } from '@/components/EarningsTransferModal'
import {
  calculatePendingShortage,
  clearProductPendingPayment,
  loadProductPendingPayment,
  saveProductPendingPayment,
} from '@/lib/utils/pending-payment-session'

// ---- 类型 ----

interface SpecGroup {
  name: string
  values: string[]
}

interface Product {
  id: string
  name: string
  description: string
  images: string[] | null
  retailPrice: number
  memberPrice: number
  stock: number
  isUpgradeProduct: boolean
  maxPointsRatio: number
  benefits?: string[] | null
  specs?: SpecGroup[] | null
  research?: string | null
}

type TabKey = 'desc' | 'research'

interface ProductPageUser {
  id: string
  level: number
  unlockedPoints: number
  balance: number
  earningsAvailable: number
  phone?: string
  hasPaymentPassword?: boolean
}

interface ProductPendingPayment {
  orderId: string
  payAmount: number
  shortage: number
  shipping: CheckoutLockedShipping
}

type PendingRestoreStatus = 'idle' | 'validating' | 'restored' | 'validation_error'

// ---- 商品规格展示组件 ----

function ProductSpecsDisplay({ specs }: { specs?: SpecGroup[] | null }) {
  // 调试日志
  console.log('[ProductSpecsDisplay] 收到的specs数据:', specs)

  if (!Array.isArray(specs) || specs.length === 0) {
    console.log('[ProductSpecsDisplay] 没有规格数据或数据为空')
    return null
  }

  const validSpecs = specs
    .map(s => ({
      name: s?.name || '规格',
      values: Array.isArray(s?.values) ? s.values.filter(v => v && v.trim()) : []
    }))
    .filter(s => s.values.length > 0)

  console.log('[ProductSpecsDisplay] 处理后的有效规格:', validSpecs)
  console.log('[ProductSpecsDisplay] 有效规格数量:', validSpecs.length)

  // 🔍 调试：临时显示所有数据（包括无效的）
  if (validSpecs.length === 0) {
    console.warn('[ProductSpecsDisplay] ⚠️ 所有规格都被过滤掉了！原始数据:', JSON.stringify(specs, null, 2))
    // 临时返回：显示原始数据用于调试
    return (
      <div className="mb-3 sm:mb-5 border-2 border-red-300 bg-red-50 rounded-xl p-3 sm:p-4">
        <h3 className="text-xs sm:text-sm font-bold text-red-600 mb-2">🔧 调试：商品规格（原始数据）</h3>
        <pre className="text-xs text-gray-700 overflow-auto max-h-60 bg-white p-2 rounded">
          {JSON.stringify(specs, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="mb-4 sm:mb-6">
      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary" />
        商品规格
      </h3>
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="space-y-3">
          {validSpecs.map((spec, gi) => (
            <div key={gi} className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600 w-12 flex-shrink-0">{spec.name}</span>
              <div className="flex flex-wrap gap-2">
                {spec.values.map((val, vi) => (
                  <span
                    key={vi}
                    className="inline-flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all cursor-default"
                  >
                    {val}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- 主组件 ----

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { id } = params as { id: string }

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<ProductPageUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [addingToCart, setAddingToCart] = useState(false)
  const [buying, setBuying] = useState(false)
  const [pointsToUse, setPointsToUse] = useState(0)
  const [imageModal, setImageModal] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<TabKey>('desc')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [pendingPayment, setPendingPayment] = useState<ProductPendingPayment | null>(null)
  const [restoreStatus, setRestoreStatus] = useState<PendingRestoreStatus>('idle')
  const [restoreError, setRestoreError] = useState('')
  const [showEarningsTransfer, setShowEarningsTransfer] = useState(false)
  const lastRestoreKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (storedToken) {
      setToken(storedToken)
      fetchUser(storedToken)
      fetchAddresses(storedToken)
    }
    // 无论是否登录都获取商品信息
    fetchProduct(storedToken)
  }, [id])

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

  const fetchUser = async (authToken: string): Promise<ProductPageUser | null> => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data.data)
        return data.data
      } else {
        setUser(null)
        return null
      }
    } catch (err) {
      console.error('获取用户信息失败:', err)
      return null
    }
  }

  const fetchProduct = async (authToken: string | null) => {
    try {
      const headers: Record<string, string> = {}
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const res = await fetch(`/api/products/${id}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setProduct(data.data)
      } else {
        setError('商品不存在')
      }
    } catch {
      setError('获取商品信息失败')
    } finally {
      setLoading(false)
    }
  }

  // 积分计算（升级产品不支持积分抵扣）
  const maxPoints = (product && user && !product.isUpgradeProduct)
    ? Math.min(
        Math.floor(product.memberPrice * product.maxPointsRatio / 100),
        user.unlockedPoints
      )
    : 0
  const pointsDiscount = pointsToUse * 1
  const finalPrice = product
    ? Math.max(0, product.memberPrice - pointsDiscount)
    : 0

  const persistPendingPayment = (
    orderId: string,
    shortage: number,
  ): boolean => {
    if (!user || !product) return false
    const result = saveProductPendingPayment({
      version: 1,
      userId: user.id,
      productId: product.id,
      orderId,
      shortage,
    })
    if (!result.ok) {
      toast.error(result.error || '待支付订单保存失败，请重试')
      return false
    }
    return true
  }

  const restorePendingPayment = async (force = false): Promise<void> => {
    if (!user || !product || !token) return
    const restoreKey = `${user.id}:${product.id}`
    if (!force && lastRestoreKeyRef.current === restoreKey) return
    lastRestoreKeyRef.current = restoreKey

    const loadResult = loadProductPendingPayment(user.id, product.id)

    if (loadResult.status === 'empty') {
      setRestoreStatus('idle')
      return
    }
    if (loadResult.status === 'invalid') {
      clearProductPendingPayment(user.id, product.id)
      setRestoreStatus('idle')
      toast.info('待支付记录已失效')
      return
    }
    if (loadResult.status === 'unavailable') {
      setRestoreStatus('validation_error')
      setRestoreError('浏览器存储不可用')
      return
    }

    setRestoreStatus('validating')

    try {
      const res = await fetch(`/api/orders/${loadResult.value.orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (res.status === 403 || res.status === 404) {
        clearProductPendingPayment(user.id, product.id)
        setPendingPayment(null)
        setRestoreStatus('idle')
        return
      }

      if (!res.ok) {
        setRestoreStatus('validation_error')
        setRestoreError('待支付订单验证失败，请重试')
        return
      }

      const body = await res.json()
      const order = body.data

      if (order.status !== 'pending') {
        clearProductPendingPayment(user.id, product.id)
        setPendingPayment(null)
        setRestoreStatus('idle')
        return
      }

      if (!order.items || order.items.length !== 1 || order.items[0].productId !== product.id || order.items[0].quantity !== 1) {
        clearProductPendingPayment(user.id, product.id)
        setPendingPayment(null)
        setRestoreStatus('idle')
        return
      }

      const orderPayAmount = Number(order.payAmount)
      const orderPointsUsed = Number(order.pointsUsed)

      if (!Number.isFinite(orderPayAmount) || orderPayAmount < 0 || !Number.isFinite(orderPointsUsed) || orderPointsUsed < 0) {
        clearProductPendingPayment(user.id, product.id)
        setPendingPayment(null)
        setRestoreStatus('idle')
        return
      }

      const shipping: CheckoutLockedShipping = {
        recipientName: order.recipientName || '',
        recipientPhone: order.recipientPhone || '',
        shippingAddress: order.shippingAddress || '',
      }

      if (!shipping.recipientName || !shipping.recipientPhone || !shipping.shippingAddress) {
        clearProductPendingPayment(user.id, product.id)
        setPendingPayment(null)
        setRestoreStatus('idle')
        return
      }

      setPointsToUse(orderPointsUsed)

      const latestUser = await fetchUser(token)
      if (!latestUser) {
        setRestoreStatus('validation_error')
        setRestoreError('资金信息读取失败，请重新验证')
        return
      }
      const shortage = calculatePendingShortage(orderPayAmount, latestUser.balance)
      if (shortage === null) {
        setRestoreStatus('validation_error')
        setRestoreError('资金数据异常，请重新验证')
        return
      }

      const nextPendingPayment: ProductPendingPayment = {
        orderId: loadResult.value.orderId,
        payAmount: orderPayAmount,
        shortage,
        shipping,
      }
      setPendingPayment(nextPendingPayment)
      persistPendingPayment(loadResult.value.orderId, shortage)
      setRestoreStatus('restored')
    } catch {
      setRestoreStatus('validation_error')
      setRestoreError('网络异常，请重试')
    }
  }

  useEffect(() => {
    if (user && product && token && restoreStatus === 'idle' && !pendingPayment) {
      restorePendingPayment(false)
    }
  }, [user?.id, product?.id, token])

  // 立即购买：v43-4-修复改为打开 checkout 弹窗
  const handleBuyNow = () => {
    if (!token || !user) {
      router.push('/login')
      return
    }
    if (!product || product.stock <= 0) return
    if (restoreStatus === 'validating' || restoreStatus === 'validation_error') return
    const pointsUsed = pointsToUse
    if (pointsUsed < 0 || !Number.isInteger(pointsUsed)) {
      toast.error('积分数量必须为非负整数')
      return
    }
    if (pointsUsed > maxPoints) {
      toast.error(`最多可使用 ${maxPoints} 积分`)
      return
    }
    if (pointsUsed > (user?.unlockedPoints ?? 0)) {
      toast.error(`可用积分不足，当前可用 ${user?.unlockedPoints ?? 0} 积分`)
      return
    }
    setCheckoutOpen(true)
  }

  // v43-4-修复: CheckoutDialog 提交回调
  const handleCheckoutConfirm = async (input: CheckoutInput): Promise<{ orderId: string } | null> => {
    if (!product || !token || !user) return null

    setBuying(true)
    try {
      let orderId = pendingPayment?.orderId ?? null
      let currentPayAmount = pendingPayment?.payAmount ?? null
      let currentPendingPayment = pendingPayment

      if (!orderId) {
        const preCreateShortage = calculatePendingShortage(finalPrice, user.balance)

        if (preCreateShortage === null) {
          setRestoreStatus('validation_error')
          setRestoreError('资金数据异常，无法创建订单')
          toast.error('资金数据异常，无法创建订单')
          return null
        }

        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            items: [{ productId: product.id, quantity: 1 }],
            pointsUsed: pointsToUse > 0 ? pointsToUse : undefined,
            recipientName: input.recipientName,
            recipientPhone: input.recipientPhone,
            shippingAddress: input.shippingAddress,
          }),
        })

        if (!orderRes.ok) {
          const errorData = await orderRes.json()
          toast.error(errorData.error || '创建订单失败')
          return null
        }

        const orderData = await orderRes.json()
        orderId = String(orderData.data?.id || '')
        if (!orderId) {
          toast.error('创建订单失败：未获取到订单ID')
          return null
        }
        const rawCreatedPayAmount = orderData.data?.payAmount
        currentPayAmount = (
          typeof rawCreatedPayAmount === 'number' &&
          Number.isFinite(rawCreatedPayAmount) &&
          rawCreatedPayAmount >= 0
        )
          ? rawCreatedPayAmount
          : finalPrice

        const recalculatedShortage = calculatePendingShortage(currentPayAmount, user.balance)
        const initialShortage = recalculatedShortage === null
          ? preCreateShortage
          : recalculatedShortage

        currentPendingPayment = {
          orderId,
          payAmount: currentPayAmount,
          shortage: initialShortage,
          shipping: {
            recipientName: input.recipientName,
            recipientPhone: input.recipientPhone,
            shippingAddress: input.shippingAddress,
          },
        }
        setPendingPayment(currentPendingPayment)
        persistPendingPayment(orderId, initialShortage)
      }

      if (!currentPendingPayment || currentPayAmount === null) {
        toast.error('待支付订单状态不完整，请重新打开结算窗口')
        return null
      }

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

        const isInsufficient = verifyErr.code === 'INSUFFICIENT_BALANCE'
          || String(verifyErr.error || '').includes('余额不足')

        if (isInsufficient) {
          const rawApiShortage = verifyErr.data?.shortage
          const paymentAmount = currentPayAmount
          let actualShortage: number | null = null

          if (typeof rawApiShortage === 'number' && Number.isFinite(rawApiShortage) && rawApiShortage >= 0) {
            actualShortage = rawApiShortage
          } else {
            const calculatedShortage = calculatePendingShortage(paymentAmount, user.balance)
            if (calculatedShortage === null) {
              setRestoreStatus('validation_error')
              setRestoreError('资金数据异常，请重新验证')
              return null
            }
            actualShortage = calculatedShortage
          }

          const nextPendingPayment = {
            ...currentPendingPayment,
            payAmount: paymentAmount,
            shortage: actualShortage,
          }
          setPendingPayment(nextPendingPayment)
          persistPendingPayment(orderId!, actualShortage)
          if (user.earningsAvailable > 0) {
            setShowEarningsTransfer(true)
          } else {
            toast.info('购物余额不足，请充值后重新确认支付')
          }
          return null
        }

        toast.error(verifyErr.error || '支付验证失败')
        return null
      }

      const verifyData = await verifyRes.json()
      if (verifyData.data?.unlockRequired && verifyData.data?.unlockAmount) {
        toast.warning(`您还未购买升级品，本次推荐奖 ¥${verifyData.data.unlockAmount.toFixed(2)} 未发放。购买升级品即可解锁。`)
      }

      if (user) clearProductPendingPayment(user.id, product.id)
      setPendingPayment(null)
      setCheckoutOpen(false)
      toast.success('购买成功！')
      router.push(`/dashboard/orders/${orderId}`)
      return { orderId }
    } catch (_err) {
      toast.error('网络错误，请重试')
      return null
    } finally {
      setBuying(false)
    }
  }

  const handleEarningsTransferSuccess = async () => {
    if (!pendingPayment || !token) return
    const latestUser = await fetchUser(token)
    if (!latestUser) {
      setShowEarningsTransfer(false)
      setRestoreStatus('validation_error')
      setRestoreError('收益已转入，请重新验证资金信息')
      return
    }
    const remainingShortage = calculatePendingShortage(pendingPayment.payAmount, latestUser.balance)
    if (remainingShortage === null) {
      setShowEarningsTransfer(false)
      setRestoreStatus('validation_error')
      setRestoreError('资金数据异常，请重新验证')
      return
    }

    const next = { ...pendingPayment, shortage: remainingShortage }
    setPendingPayment(next)
    persistPendingPayment(next.orderId, remainingShortage)
    setShowEarningsTransfer(false)
    toast.success('余额已补充，请重新确认支付')
  }

  const handleGoRecharge = () => {
    if (!user || !product) return
    const result = saveProductPendingPayment({
      version: 1,
      userId: user.id,
      productId: product.id,
      orderId: pendingPayment?.orderId || '',
      shortage: pendingPayment?.shortage || 0,
    })
    if (!result.ok) {
      toast.error(result.error || '保存待支付状态失败')
      return
    }
    router.push('/dashboard/recharge')
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
    } catch (error) {
      console.error('保存地址失败:', error)
      return false
    }
  }

  // 加入购物车
  const handleAddToCart = async () => {
    if (!token) { router.push('/login'); return }
    if (!product || product.stock <= 0) return
    setAddingToCart(true)
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId: product.id }),
      })
      if (res.ok) {
        toast.success('已加入购物车')
      } else if (res.status === 409) {
        toast.warning('商品已在购物车中')
      } else {
        const data = await res.json()
        toast.error(data.error || '添加购物车失败')
      }
    } catch {
      toast.error('网络错误，请重试')
    } finally {
      setAddingToCart(false)
    }
  }

  // 加载中
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card-base p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-[400px] bg-gray-200 rounded-lg animate-pulse" />
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-full animate-pulse" />
                <div className="h-10 bg-gray-200 rounded w-1/3 animate-pulse" />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-red-500 text-lg mb-4">{error || '商品不存在'}</p>
          <Link href="/products" className="text-primary hover:text-primary-600 font-medium">
            返回商品列表
          </Link>
        </div>
      </div>
    )
  }

  const stockLabel = product.stock > 20
    ? { text: `库存充足 (${product.stock}件)`, color: 'text-green-600' }
    : product.stock > 0
    ? { text: `库存紧张 (仅${product.stock}件)`, color: 'text-red-500' }
    : { text: '已售罄', color: 'text-gray-400' }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* 面包屑 */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Link href="/products" className="flex items-center gap-1 text-gray-500 hover:text-primary transition-colors">
            <ChevronLeft className="w-4 h-4" />
            返回商品列表
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-gray-400">商品详情</span>
        </div>

        {/* ====== 主内容：左图右文 ====== */}
        <div className="card-base overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* 左侧图片 - 支持多图轮播 */}
            <div className="p-3 sm:p-6 lg:p-8">
              {(() => {
                const allImages = product.images && product.images.length > 0
                  ? product.images
                  : []

                if (allImages.length === 0) {
                  return (
                    <div className="relative w-full aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden flex flex-col items-center justify-center">
                      <Package className="w-16 h-16 text-gray-300 mb-2" />
                      <span className="text-gray-400 text-sm">暂无图片</span>
                    </div>
                  )
                }

                return (
                  <div className="flex flex-col items-center gap-3 h-full">
                    {/* 主图容器 - 自适应宽度，flex-1 撑满剩余空间 */}
                    <div className="relative w-full flex-1 min-h-0 bg-gray-100 rounded-xl overflow-hidden">
                      {/* 升级标签 */}
                      {product.isUpgradeProduct && (
                        <span className="absolute top-3 left-3 bg-secondary text-white text-xs px-2.5 py-1 rounded-full font-medium shadow-sm z-10 pointer-events-none">
                          升级产品
                        </span>
                      )}
                      {/* 主图展示区 */}
                      <div
                        className="relative w-full h-full cursor-zoom-in"
                        onClick={() => setImageModal(true)}
                      >
                        <Image
                          src={allImages[currentImageIndex] || ''}
                          alt={`${product.name} - 图片${currentImageIndex + 1}`}
                          fill
                          sizes="(max-width: 768px) 100vw, 400px"
                          className="object-cover hover:scale-105 transition-transform duration-300"
                        />
                        {/* 左右切换箭头（多图时显示，常驻可见）*/}
                        {allImages.length > 1 && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length)
                              }}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-opacity"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setCurrentImageIndex((prev) => (prev + 1) % allImages.length)
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-opacity"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* 底部缩略图条（在主图容器外部，不会被裁剪）*/}
                    <div className="flex justify-center gap-2 w-full">
                      {allImages.map((imgUrl, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0 ${
                            idx === currentImageIndex
                              ? 'border-primary shadow-sm'
                              : 'border-transparent hover:border-gray-300 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <Image
                            src={imgUrl}
                            alt={`缩略图${idx + 1}`}
                            fill
                            className="object-cover"
                            unoptimized   // base64 图片不需要优化，直接显示
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* 右侧信息 */}
            <div className="p-3 sm:p-6 lg:p-8 lg:border-l border-gray-100">
              {/* 名称 */}
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">{product.name}</h1>

              {/* 功效标签 */}
              {(() => { const benefits = Array.isArray(product.benefits) ? product.benefits : []; return benefits.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                  {benefits.map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] sm:text-xs bg-primary-50 text-primary px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full">
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              ) })()}

              {/* 价格区域 */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-3 sm:p-5 mb-3 sm:mb-5">
                <div className="flex items-baseline gap-2 sm:gap-3 mb-1">
                  <span className="text-2xl sm:text-3xl font-bold text-primary">¥{product.memberPrice}</span>
                  <span className="text-gray-400 line-through text-sm sm:text-base">¥{product.retailPrice}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-secondary/10 text-secondary-700 px-2 py-0.5 rounded-full font-medium">
                    会员专享价
                  </span>
                  {!product.isUpgradeProduct && product.maxPointsRatio > 0 && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      可用积分抵扣 {product.maxPointsRatio}%
                    </span>
                  )}
                  {product.isUpgradeProduct && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                      不支持积分抵扣
                    </span>
                  )}
                </div>
              </div>

              {/* 库存 */}
              <div className="flex items-center gap-2 mb-3 sm:mb-5">
                <Shield className={`w-4 h-4 ${stockLabel.color}`} />
                <span className={`text-xs sm:text-sm font-medium ${stockLabel.color}`}>{stockLabel.text}</span>
              </div>

              {/* 购买数量 */}
              <div className="mb-3 sm:mb-4">
                <span className="text-xs sm:text-sm text-gray-500">购买数量</span>
                <span className="ml-2 sm:ml-3 px-2 sm:px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-xs sm:text-sm font-medium">1 件</span>
                <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs text-gray-400">限购1件</span>
              </div>

              {/* 积分抵扣（升级产品不显示此区域） */}
              {user && !product.isUpgradeProduct && product.maxPointsRatio > 0 && user.unlockedPoints > 0 && (
                <div className="mb-3 sm:mb-5 bg-gray-50 rounded-xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs sm:text-sm font-medium text-gray-700">使用积分抵扣</label>
                    <span className="text-[10px] sm:text-xs text-gray-400">
                      可用 {user.unlockedPoints} 积分，最多用 {maxPoints} 积分
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <input
                      type="number"
                      min={0}
                      max={maxPoints}
                      value={pointsToUse}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0
                        setPointsToUse(Math.max(0, Math.min(maxPoints, v)))
                      }}
                      className="flex-1 min-w-0 px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                      placeholder="输入积分数量"
                    />
                    <button
                      onClick={() => setPointsToUse(maxPoints)}
                      className="text-xs text-primary hover:text-primary-600 font-medium whitespace-nowrap transition-colors px-2 py-2.5 sm:py-2"
                    >
                      全部使用
                    </button>
                  </div>
                  {pointsToUse > 0 && (
                    <p className="mt-2 text-[10px] sm:text-xs text-gray-500">
                      抵扣 ¥{pointsDiscount.toFixed(2)}，实付 <span className="text-primary font-bold">¥{finalPrice.toFixed(2)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* 升级产品提示 */}
              {product.isUpgradeProduct && (
                <div className="mb-3 sm:mb-5 flex items-start gap-2 bg-blue-50 text-blue-700 rounded-xl p-3 sm:p-4 text-xs sm:text-sm">
                  <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>购买此产品可累计升级经销商资格</span>
                </div>
              )}

              {/* 商品规格 */}
              <ProductSpecsDisplay specs={product.specs} />

              {restoreStatus === 'validating' && (
                <div className="mb-3 sm:mb-5 flex items-center gap-2 bg-blue-50 text-blue-700 rounded-xl p-3 sm:p-4 text-xs sm:text-sm">
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  <span>正在验证待支付订单</span>
                </div>
              )}
              {restoreStatus === 'validation_error' && (
                <div className="mb-3 sm:mb-5 flex items-start gap-2 bg-red-50 text-red-700 rounded-xl p-3 sm:p-4 text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p>{restoreError || '待支付订单验证失败，请重试'}</p>
                    <button
                      onClick={() => restorePendingPayment(true)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      <RefreshCw className="w-3 h-3" />
                      重新验证
                    </button>
                  </div>
                </div>
              )}
              {restoreStatus === 'restored' && pendingPayment && (
                <div className="mb-3 sm:mb-5 flex items-center gap-2 bg-amber-50 text-amber-700 rounded-xl p-3 sm:p-4 text-xs sm:text-sm">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>已恢复待支付订单，不会重复下单</span>
                </div>
              )}

              {/* 操作按钮 - 移动端sticky底部 */}
              <div className="flex gap-2 sm:gap-3 sticky bottom-0 bg-white/80 backdrop-blur-sm py-3 -mx-3 px-3 sm:mx-0 sm:px-0 sm:relative sm:bg-transparent sm:backdrop-blur-none sm:py-0 sm:mt-0">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock === 0 || addingToCart}
                  className="flex-1 py-3 px-3 sm:px-4 rounded-xl font-medium border-2 border-primary text-primary hover:bg-primary-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 sm:gap-2 text-sm sm:text-base"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {addingToCart ? '添加中...' : '加入购物车'}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={product.stock === 0 || buying || restoreStatus === 'validating' || restoreStatus === 'validation_error'}
                  className="flex-1 py-3 px-3 sm:px-4 rounded-xl font-medium text-white bg-primary hover:bg-primary-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-1.5 sm:gap-2 text-sm sm:text-base"
                >
                  {buying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {product.stock === 0 ? '已售罄' : buying ? '提交中...' : '立即购买'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ====== 详情标签页 ====== */}
        <div className="mt-4 sm:mt-8 card-base overflow-hidden">
          {/* Tab 切换 */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('desc')}
              className={`px-4 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-colors relative ${
                activeTab === 'desc'
                  ? 'text-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              商品描述
              {activeTab === 'desc' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('research')}
              className={`px-4 sm:px-6 py-3 sm:py-3.5 text-xs sm:text-sm font-medium transition-colors relative ${
                activeTab === 'research'
                  ? 'text-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              科研背书
              {activeTab === 'research' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {/* Tab 内容 */}
          <div className="p-4 sm:p-6 lg:p-8">
            {activeTab === 'desc' ? (
              <div className="prose prose-sm max-w-none text-gray-600 [&_img]:max-w-full [&_img]:h-auto">
                {product.description ? (
                  <div dangerouslySetInnerHTML={{ __html: product.description }} />
                ) : (
                  <div className="text-center py-8">
                    <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">暂无商品描述</p>
                    <p className="text-gray-400 text-sm mt-1">该产品源自敏维生物科研团队，采用耐高温金花菌核心技术</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="prose prose-sm max-w-none text-gray-600">
                {product.research ? (
                  <div dangerouslySetInnerHTML={{ __html: product.research }} />
                ) : (
                  <div className="text-center py-8">
                    <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">暂无科研背书内容</p>
                    <p className="text-gray-400 text-sm mt-1">该产品暂无科研背景介绍</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ====== 图片放大模态框（支持多图）===== */}
      {imageModal && (() => {
        const allImages = product.images && product.images.length > 0
          ? product.images
          : []
        if (allImages.length === 0) return null

        return (
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setImageModal(false)}
          >
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors z-10"
              onClick={() => setImageModal(false)}
            >
              <X className="w-5 h-5" />
            </button>
            {/* 主大图 */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <Image
                src={allImages[currentImageIndex] || ''}
                alt={`${product.name} - 大图${currentImageIndex + 1}`}
                width={800}
                height={800}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
              {/* 多图时左右切换 */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setCurrentImageIndex((prev) => (prev + 1) % allImages.length)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
            {/* 底部缩略图 */}
            {allImages.length > 1 && (
              <div className="flex gap-2 mt-4 justify-center" onClick={(e) => e.stopPropagation()}>
                {allImages.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      idx === currentImageIndex
                        ? 'border-white'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Image
                      src={imgUrl}
                      alt={`大图缩略${idx + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* v43-4-修复: Checkout 弹窗（公共组件） */}
      <CheckoutDialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        product={product ? {
          id: product.id,
          name: product.name,
          memberPrice: product.memberPrice,
          imageUrl: product.images?.[0] || null,
          pointsUsed: pointsToUse,
        } as CheckoutProduct : null}
        onConfirm={handleCheckoutConfirm}
        defaultPhone={user?.phone || ''}
        hasPaymentPassword={user?.hasPaymentPassword || false}
        existingAddresses={addresses}
        onSaveAddress={handleSaveAddress}
        hasPendingOrder={!!pendingPayment}
        shortage={pendingPayment?.shortage ?? 0}
        earningsAvailable={user?.earningsAvailable ?? 0}
        pendingOrderShipping={pendingPayment?.shipping ?? null}
        onOpenEarningsTransfer={() => setShowEarningsTransfer(true)}
        onGoRecharge={handleGoRecharge}
      />

      {showEarningsTransfer && user && (
        <EarningsTransferModal
          open={showEarningsTransfer}
          onClose={() => setShowEarningsTransfer(false)}
          earningsAvailable={user.earningsAvailable ?? 0}
          balance={user.balance ?? 0}
          onSuccess={handleEarningsTransferSuccess}
          initialAmount={Math.min(pendingPayment?.shortage ?? 0, user.earningsAvailable ?? 0)}
        />
      )}
    </div>
  )
}