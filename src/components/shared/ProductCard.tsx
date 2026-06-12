'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ShoppingBag, Package } from 'lucide-react'

// ---- 商品数据接口 ----

export interface ProductCardData {
  id: string
  name: string
  imageUrl: string | null
  memberPrice: number
  retailPrice: number
  benefits?: string[] | null
  isUpgradeProduct?: boolean
}

// ---- Props 接口 ----

export interface ProductCardProps {
  product: ProductCardData
  /** 布局变体：'home' 首页紧凑样式，'list' 商品列表样式 */
  variant?: 'home' | 'list'
}

// ---- 组件 ----

export function ProductCard({ product, variant = 'home' }: ProductCardProps) {
  const isList = variant === 'list'

  return (
    <Link
      href={`/products/${product.id}`}
      className={`card-base overflow-hidden group ${
        isList ? 'hover:-translate-y-0.5 transition-all duration-300' : ''
      }`}
    >
      {/* 商品图片 */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isList ? (
              <Package className="w-10 h-10 sm:w-14 sm:h-14 text-gray-300" />
            ) : (
              <ShoppingBag className="w-8 h-8 sm:w-12 sm:h-12 text-gray-300" />
            )}
          </div>
        )}
        {/* 升级标签（仅 list 变体） */}
        {isList && product.isUpgradeProduct && (
          <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 bg-secondary text-white text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium shadow-sm">
            升级产品
          </span>
        )}
      </div>

      {/* 商品信息 */}
      <div className={isList ? 'p-2 sm:p-4' : 'p-2 sm:p-3 md:p-4'}>
        <h3
          className={`text-gray-900 truncate mb-0.5 sm:mb-1 ${
            isList
              ? 'font-semibold text-xs sm:text-base mb-1 sm:mb-1.5'
              : 'font-medium text-xs sm:text-sm md:text-base'
          }`}
        >
          {product.name}
        </h3>

        {/* 功效标签 */}
        {(() => {
          const benefits = Array.isArray(product.benefits) ? product.benefits : []
          return benefits.length > 0 && (
            <div
              className={
                isList
                  ? 'hidden sm:flex flex-wrap gap-1 mb-2'
                  : 'flex flex-wrap gap-0.5 sm:gap-1 mb-1 sm:mb-2'
              }
            >
              {benefits.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className={
                    isList
                      ? 'text-xs bg-primary-50 text-primary px-1.5 py-0.5 rounded'
                      : 'text-[10px] sm:text-xs bg-primary-50 text-primary px-1 sm:px-1.5 py-0.5 rounded'
                  }
                >
                  {tag}
                </span>
              ))}
            </div>
          )
        })()}

        {/* 价格 */}
        <div className={`flex items-baseline gap-1 sm:gap-2 ${isList ? 'mb-2 sm:mb-3' : ''}`}>
          <span className={`text-primary font-bold ${isList ? 'text-sm sm:text-xl' : 'text-sm sm:text-lg'}`}>
            ¥{product.memberPrice}
          </span>
          <span className={`text-gray-400 line-through ${isList ? 'text-[10px] sm:text-sm' : 'text-[10px] sm:text-xs'}`}>
            ¥{product.retailPrice}
          </span>
        </div>

        {/* 购买按钮 */}
        <div className={isList ? '' : 'mt-1.5 sm:mt-2'}>
          <span
            className={
              isList
                ? 'block w-full text-center bg-primary text-white text-xs sm:text-sm py-1.5 sm:py-2 rounded-lg group-hover:bg-primary-600 group-hover:scale-[1.02] transition-all duration-200 font-medium'
                : 'inline-block w-full text-center bg-primary text-white text-xs sm:text-sm py-1 sm:py-1.5 rounded-lg group-hover:bg-primary-600 transition-colors'
            }
          >
            立即购买
          </span>
        </div>
      </div>
    </Link>
  )
}
