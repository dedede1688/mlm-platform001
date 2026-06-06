'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Package, ShoppingBag, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'

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
  benefits?: string[] | null
  sortOrder?: number
}

type SortType = 'default' | 'price-asc' | 'price-desc'

const PAGE_SIZE = 12

// ---- 主组件 ----

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortType>('default')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      if (data.success) {
        setProducts(data.data)
      }
    } catch (error) {
      console.error('Fetch products error:', error)
    } finally {
      setLoading(false)
    }
  }

  // 排序
  const sortedProducts = useMemo(() => {
    const list = [...products]
    switch (sortBy) {
      case 'price-asc':
        return list.sort((a, b) => a.memberPrice - b.memberPrice)
      case 'price-desc':
        return list.sort((a, b) => b.memberPrice - a.memberPrice)
      default:
        return list
    }
  }, [products, sortBy])

  // 分页
  const totalPages = Math.ceil(sortedProducts.length / PAGE_SIZE)
  const pagedProducts = sortedProducts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // 切换排序
  const handleSortChange = (type: SortType) => {
    setSortBy(type)
    setCurrentPage(1)
  }

  // 分页跳转
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page)
  }

  // 页码按钮
  const getPageNumbers = () => {
    const pages: number[] = []
    const maxVisible = 5
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">

      {/* ====== Main ====== */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 标题栏 + 排序 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-gray-900">商品中心</h1>
            <span className="text-sm text-gray-400">共 {sortedProducts.length} 件商品</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">排序：</span>
            <SortButton
              label="默认"
              active={sortBy === 'default'}
              onClick={() => handleSortChange('default')}
            />
            <SortButton
              label="价格升序"
              icon={<ArrowUp className="w-3 h-3" />}
              active={sortBy === 'price-asc'}
              onClick={() => handleSortChange('price-asc')}
            />
            <SortButton
              label="价格降序"
              icon={<ArrowDown className="w-3 h-3" />}
              active={sortBy === 'price-desc'}
              onClick={() => handleSortChange('price-desc')}
            />
          </div>
        </div>

        {loading ? (
          /* 骨架屏 */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md overflow-hidden animate-pulse">
                <div className="h-[200px] bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                  <div className="h-8 bg-gray-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : pagedProducts.length > 0 ? (
          <>
            {/* 商品网格 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {pagedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getPageNumbers().map((page) => (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      page === currentPage
                        ? 'bg-primary text-white shadow-sm'
                        : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-40" />
            <p className="text-lg">暂无商品，敬请期待</p>
          </div>
        )}
      </main>

    </div>
  )
}

// ---- 商品卡片 ----

function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.id}`}
      className="card-base overflow-hidden group hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* 图片 */}
      <div className="h-[200px] bg-gray-100 relative overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-14 h-14 text-gray-300" />
          </div>
        )}
        {/* 升级标签 */}
        {product.isUpgradeProduct && (
          <span className="absolute top-2 left-2 bg-secondary text-white text-xs px-2 py-0.5 rounded-full font-medium shadow-sm">
            升级产品
          </span>
        )}
      </div>

      {/* 信息 */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-base truncate mb-1.5">{product.name}</h3>

        {/* 功效标签 */}
        {(() => { const benefits = Array.isArray(product.benefits) ? product.benefits : []; return benefits.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {benefits.slice(0, 3).map((tag, i) => (
              <span key={i} className="text-xs bg-primary-50 text-primary px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        ) })()}

        {/* 价格 */}
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-primary font-bold text-xl">¥{product.memberPrice}</span>
          <span className="text-gray-400 text-sm line-through">¥{product.retailPrice}</span>
        </div>

        {/* 购买按钮 */}
        <span className="block w-full text-center bg-primary text-white text-sm py-2 rounded-lg group-hover:bg-primary-600 group-hover:scale-[1.02] transition-all duration-200 font-medium">
          立即购买
        </span>
      </div>
    </Link>
  )
}

// ---- 排序按钮 ----

function SortButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors font-medium ${
        active
          ? 'bg-primary text-white shadow-sm'
          : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}