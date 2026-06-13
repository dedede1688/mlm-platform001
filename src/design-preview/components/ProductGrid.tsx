'use client'

import Link from 'next/link'
import { ShoppingBag, TrendingUp } from 'lucide-react'

const products = [
  {
    name: '冠突散囊菌·升级产品A',
    price: 500,
    retailPrice: 600,
    isUpgrade: true,
    image: 'https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400&h=500&fit=crop',
    tags: ['降血脂', '调菌群'],
  },
  {
    name: '冠突散囊菌·升级产品B',
    price: 1000,
    retailPrice: 1200,
    isUpgrade: true,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=500&fit=crop',
    tags: ['强免疫', '护肠胃'],
  },
  {
    name: '冠突散囊菌·普通产品C',
    price: 250,
    retailPrice: 300,
    isUpgrade: false,
    image: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=400&h=500&fit=crop',
    tags: ['日常保健'],
  },
  {
    name: '冠突散囊菌·普通产品D',
    price: 500,
    retailPrice: 600,
    isUpgrade: false,
    image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=400&h=500&fit=crop',
    tags: ['日常保健'],
  },
]

function ProductCard({ product, index }: { product: typeof products[0]; index: number }) {
  return (
    <Link
      href="/products/1"
      className="group bg-white rounded-xl overflow-hidden shadow-md border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-in"
      style={{ animationDelay: ${index * 100}ms }}
    >
      {/* 图片 */}
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* 升级标签 */}
        {product.isUpgrade && (
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-white shadow-sm">
              <TrendingUp className="w-3 h-3" />
              升级产品
            </span>
          </div>
        )}

        {/* 悬浮遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* 信息 */}
      <div className="p-4">
        <h3 className="font-semibold text-[#0F172A] text-sm md:text-base truncate mb-2">
          {product.name}
        </h3>

        {/* 标签 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {product.tags.map((tag, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded bg-[#E6F5ED] text-[#1B5E3B]">
              {tag}
            </span>
          ))}
        </div>

        {/* 价格 */}
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-xl font-bold text-[#1B5E3B]">¥{product.price}</span>
          <span className="text-sm text-gray-400 line-through">¥{product.retailPrice}</span>
          <span className="text-xs text-[#1B5E3B] font-medium ml-auto">
            省 ¥{product.retailPrice - product.price}
          </span>
        </div>

        {/* 按钮 */}
        <div className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#1B5E3B] to-[#15803D] text-white text-sm font-medium text-center group-hover:from-[#15803D] group-hover:to-[#166534] transition-all duration-200">
          立即购买
        </div>
      </div>
    </Link>
  )
}

export default function ProductGrid() {
  return (
    <section className="section-padding bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A]">精选产品</h2>
            <p className="text-[#64748B] mt-1">为您严选优质健康产品</p>
          </div>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-[#1B5E3B] font-medium hover:text-[#15803D] transition-colors"
          >
            查看全部
            <ShoppingBag className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {products.map((product, index) => (
            <ProductCard key={index} product={product} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}
