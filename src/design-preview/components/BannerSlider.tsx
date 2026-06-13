'use client'

import { useState, useEffect } from 'react'

const banners = [
  {
    imageUrl: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=1200&h=400&fit=crop',
    title: '耐高高温金花草菌 · 专利认证',
    subtitle: '源自青藏高原，专刊认证'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1200&h=400&fit=crop',
    title: '中科院博士团队 · 13年研发',
    subtitle: '从实验室到量产全程可追溯'
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&h=400&fit=crop',
    title: '降血脂 · 调菌群 · 强免疫',
    subtitle: '三重健康守护'
  }
]

export default function BannerSlider() {
  const [current, setCurrent] = useState(0)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    if (banners.length <= 1) return
    const timer = setInterval(() => {
      setTransitioning(true)
      setTimeout(() => {
        setCurrent(prev => (prev + 1) % banners.length)
        setTransitioning(false)
      }, 300)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const banner = banners[current]

  return (
    <section className=\"section-padding pt-8\">
      <div className=\"max-w-6xl mx-auto\">
        <div className=\"relative rounded-2xl overflow-hidden shadow-2xl h-[320px] md:h-[420px] bg-gray-100\">
          {/* 图片 */}
          <div className={bsolute inset-0 transition-opacity duration-300 }>
            <img
              src={banner.imageUrl}
              alt={banner.title}
              className=\"w-full h-full object-cover\"
            />
          </div>

          {/* 渐变蒙版 */}
          <div className=\"absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent\" />

          {/* 文字 */}
          <div className=\"absolute bottom-0 left-0 right-0 p-6 md:p-10\">
            <h3 className=\"text-xl md:text-2xl font-bold text-white mb-2\">{banner.title}</h3>
            <p className=\"text-sm md:text-base text-white/80\">{banner.subtitle}</p>
          </div>

          {/* 指示点 */}
          {banners.length > 1 && (
            <div className=\"absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2\">
              {banners.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setTransitioning(true)
                    setTimeout(() => {
                      setCurrent(index)
                      setTransitioning(false)
                    }, 300)
                  }}
                  className={h-2.5 rounded-full transition-all duration-300 }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
