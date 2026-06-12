'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

interface BannerItem {
  imageUrl: string
  link?: string
  title?: string
}

export default function BannerSlider({ banners }: { banners: BannerItem[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)

  // 自动播放
  useEffect(() => {
    if (banners.length <= 1) return

    const timer = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentIndex(prev => (prev + 1) % banners.length)
        setIsTransitioning(false)
      }, 300)
    }, 3000)

    return () => clearInterval(timer)
  }, [banners.length])

  if (!banners || banners.length === 0) return null

  const goTo = (index: number) => {
    if (index === currentIndex) return
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentIndex(index)
      setIsTransitioning(false)
    }, 300)
  }

  const goPrev = () => {
    const newIndex = currentIndex === 0 ? banners.length - 1 : currentIndex - 1
    goTo(newIndex)
  }

  const goNext = () => {
    const newIndex = (currentIndex + 1) % banners.length
    goTo(newIndex)
  }

  const currentBanner = banners[currentIndex]

  const imageElement = (
    <Image
      src={currentBanner.imageUrl}
      alt={currentBanner.title || `轮播图 ${currentIndex + 1}`}
      fill
      priority={currentIndex === 0}
      className={`object-cover transition-opacity duration-300 ${
        isTransitioning ? 'opacity-0' : 'opacity-100'
      }`}
    />
  )

  return (
    <div className="relative w-full h-[280px] sm:h-[360px] md:h-[440px] lg:h-[520px] overflow-hidden bg-gray-100 rounded-xl">
      {/* 轮播图片 */}
      {currentBanner.link ? (
        <Link href={currentBanner.link} className="block w-full h-full">
          {imageElement}
        </Link>
      ) : (
        <div className="w-full h-full">{imageElement}</div>
      )}

      {/* 标题覆盖 */}
      {currentBanner.title && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-6 py-4">
          <p className="text-white text-lg font-medium">{currentBanner.title}</p>
        </div>
      )}

      {/* 左右箭头 */}
      {banners.length > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
              bg-black/30 hover:bg-black/50 text-white flex items-center justify-center
              transition-colors backdrop-blur-sm"
            aria-label="上一张"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
              bg-black/30 hover:bg-black/50 text-white flex items-center justify-center
              transition-colors backdrop-blur-sm"
            aria-label="下一张"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* 指示点 */}
      {banners.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => goTo(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-white scale-125'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`跳转到第 ${index + 1} 张`}
            />
          ))}
        </div>
      )}
    </div>
  )
}