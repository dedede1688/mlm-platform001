'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, Package, ShoppingCart, Zap, Tag, Shield,
  X, Loader2, FlaskConical
} from 'lucide-react'

// ---- 类型 ----

interface Product {
  id: string
  name: string
  description: string
  imageUrl: string
  retailPrice: number
  memberPrice: number
  stock: number
  isUpgradeProduct: boolean
  maxPointsRatio: number
  benefits?: string[] | null
}

type TabKey = 'desc' | 'research'

// ---- 主组件 ----

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { id } = params as { id: string }

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{ level: number; unlockedPoints: number; balance: number } | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [addingToCart, setAddingToCart] = useState(false)
  const [buying, setBuying] = useState(false)
  const [pointsToUse, setPointsToUse] = useState(0)
  const [imageModal, setImageModal] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('desc')

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
    fetchUser(storedToken)
    fetchProduct(storedToken)
  }, [id, router])

  const fetchUser = async (authToken: string) => {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data.data)
      } else {
        localStorage.removeItem('token')
        router.push('/login')
      }
    } catch {
      localStorage.removeItem('token')
      router.push('/login')
    }
  }

  const fetchProduct = async (authToken: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })
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

  // 积分计算
  const maxPoints = product && user
    ? Math.min(
        Math.floor(product.memberPrice * product.maxPointsRatio / 100),
        user.unlockedPoints
      )
    : 0
  const pointsDiscount = pointsToUse * 1 // 1积分=1元
  const finalPrice = product
    ? Math.max(0, product.memberPrice - pointsDiscount)
    : 0

  // 立即购买
  const handleBuyNow = async () => {
    if (!token || !user) { router.push('/login'); return }
    if (!product || product.stock <= 0) return
    setBuying(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: [{ productId: product.id, quantity: 1 }],
          pointsUsed: pointsToUse > 0 ? pointsToUse : undefined,
        }),
      })
      if (res.ok) {
        router.push('/dashboard/orders')
      } else {
        const data = await res.json()
        alert(data.error || '创建订单失败')
      }
    } catch {
      alert('网络错误，请重试')
    } finally {
      setBuying(false)
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
        alert('已加入购物车')
      } else if (res.status === 409) {
        alert('商品已在购物车中')
      } else {
        const data = await res.json()
        alert(data.error || '添加购物车失败')
      }
    } catch {
      alert('网络错误，请重试')
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
            {/* 左侧图片 */}
            <div className="p-6 lg:p-8">
              <div
                className="relative w-full aspect-square max-w-[400px] mx-auto bg-gray-100 rounded-xl overflow-hidden cursor-zoom-in"
                onClick={() => product.imageUrl && setImageModal(true)}
              >
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <Package className="w-16 h-16 text-gray-300 mb-2" />
                    <span className="text-gray-400 text-sm">暂无图片</span>
                  </div>
                )}
                {/* 升级标签 */}
                {product.isUpgradeProduct && (
                  <span className="absolute top-3 left-3 bg-secondary text-white text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
                    升级产品
                  </span>
                )}
              </div>
            </div>

            {/* 右侧信息 */}
            <div className="p-6 lg:p-8 lg:border-l border-gray-100">
              {/* 名称 */}
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{product.name}</h1>

              {/* 功效标签 */}
              {(() => { const benefits = Array.isArray(product.benefits) ? product.benefits : []; return benefits.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {benefits.map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary px-2.5 py-1 rounded-full">
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              ) })()}

              {/* 价格区域 */}
              <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-xl p-5 mb-5">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="text-3xl font-bold text-primary">¥{product.memberPrice}</span>
                  <span className="text-gray-400 line-through text-base">¥{product.retailPrice}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs bg-secondary/10 text-secondary-700 px-2 py-0.5 rounded-full font-medium">
                    会员专享价
                  </span>
                  {product.maxPointsRatio > 0 && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      可用积分抵扣 {product.maxPointsRatio}%
                    </span>
                  )}
                </div>
              </div>

              {/* 库存 */}
              <div className="flex items-center gap-2 mb-5">
                <Shield className={`w-4 h-4 ${stockLabel.color}`} />
                <span className={`text-sm font-medium ${stockLabel.color}`}>{stockLabel.text}</span>
              </div>

              {/* 购买数量 */}
              <div className="mb-4">
                <span className="text-sm text-gray-500">购买数量</span>
                <span className="ml-3 px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm font-medium">1 件</span>
                <span className="ml-2 text-xs text-gray-400">限购1件</span>
              </div>

              {/* 积分抵扣 */}
              {user && product.maxPointsRatio > 0 && user.unlockedPoints > 0 && (
                <div className="mb-5 bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">使用积分抵扣</label>
                    <span className="text-xs text-gray-400">
                      可用 {user.unlockedPoints} 积分，最多用 {maxPoints} 积分
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={maxPoints}
                      value={pointsToUse}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0
                        setPointsToUse(Math.max(0, Math.min(maxPoints, v)))
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                      placeholder="输入积分数量"
                    />
                    <button
                      onClick={() => setPointsToUse(maxPoints)}
                      className="text-xs text-primary hover:text-primary-600 font-medium whitespace-nowrap transition-colors"
                    >
                      全部使用
                    </button>
                  </div>
                  {pointsToUse > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      抵扣 ¥{pointsDiscount.toFixed(2)}，实付 <span className="text-primary font-bold">¥{finalPrice.toFixed(2)}</span>
                    </p>
                  )}
                </div>
              )}

              {/* 升级产品提示 */}
              {product.isUpgradeProduct && (
                <div className="mb-5 flex items-start gap-2 bg-blue-50 text-blue-700 rounded-xl p-4 text-sm">
                  <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>购买此产品可累计升级经销商资格</span>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={product.stock === 0 || addingToCart}
                  className="flex-1 py-3 px-4 rounded-xl font-medium border-2 border-primary text-primary hover:bg-primary-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" />
                  {addingToCart ? '添加中...' : '加入购物车'}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={product.stock === 0 || buying}
                  className="flex-1 py-3 px-4 rounded-xl font-medium text-white bg-primary hover:bg-primary-600 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
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
        <div className="mt-8 card-base overflow-hidden">
          {/* Tab 切换 */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('desc')}
              className={`px-6 py-3.5 text-sm font-medium transition-colors relative ${
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
              className={`px-6 py-3.5 text-sm font-medium transition-colors relative ${
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
          <div className="p-6 lg:p-8">
            {activeTab === 'desc' ? (
              <div className="prose prose-sm max-w-none text-gray-600">
                {product.description ? (
                  <p>{product.description}</p>
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
                <h3 className="text-lg font-semibold text-gray-900 !mt-0">冠突散囊菌（金花菌）科研背景</h3>
                <p>
                  本产品核心成分——冠突散囊菌（金花菌），源自青藏高原特殊环境筛选，经中国科学院博士团队13年潜心研究，
                  成功实现从实验室到量产的完整转化。金花菌是目前已知唯一能耐121℃高温的益生菌，这一特性使其在口服制剂中
                  具有无可比拟的优势。
                </p>
                <div className="bg-primary-50 rounded-lg p-4 !my-4">
                  <h4 className="font-semibold text-primary !mt-0 !mb-2">核心科研成果</h4>
                  <ul className="space-y-1.5 text-sm !mb-0">
                    <li>耐高温121℃，活性保持率超过90%</li>
                    <li>动物实验显示甘油三酯下降60%</li>
                    <li>总胆固醇水平降低35%</li>
                    <li>双歧杆菌等有益菌数量增加3倍</li>
                    <li>多项国家发明专利认证</li>
                  </ul>
                </div>
                <p>
                  研究成果已在上海市公共卫生临床中心完成临床试验，并由中国微生物菌种保藏中心进行菌种保藏和鉴定。
                  金花菌的降血脂、调节肠道菌群、增强免疫三重功效，为高血脂人群提供了全新的天然解决方案。
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ====== 图片放大模态框 ====== */}
      {imageModal && product.imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setImageModal(false)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors"
            onClick={() => setImageModal(false)}
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={product.imageUrl}
            alt={product.name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  )
}