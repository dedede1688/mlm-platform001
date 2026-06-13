'use client'

import { useEffect, useState } from 'react'

interface StatItem {
  value: number
  suffix: string
  label: string
  icon: string
}

const stats: StatItem[] = [
  { value: 13, suffix: '年', label: '研发经验', icon: '🔬' },
  { value: 21, suffix: '℃', label: '耐高温', icon: '🌡️' },
  { value: 5000, suffix: '+', label: '注册用户', icon: '👥' },
  { value: 10, suffix: '万+', label: '订单总数', icon: '📦' },
  { value: 4, suffix: '项', label: '发明专利', icon: '🏅' },
]

function AnimatedNumber({ target, suffix }: { target: number; suffix: string }) {
  const [count, setCount] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isVisible) {
          setIsVisible(true)
        }
      },
      { threshold: 0.3 }
    )

    const el = document.getElementById('stat-' + target)
    if (el) observer.observe(el)

    return () => observer.disconnect()
  }, [target, isVisible])

  useEffect(() => {
    if (!isVisible) return

    const duration = 1500
    const steps = 60
    const increment = target / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [isVisible, target])

  return (
    <span>
      {count}{suffix}
    </span>
  )
}

export default function StatsBar() {
  return (
    <section className="relative z-10 -mt-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 md:gap-4">
            {stats.map((stat, index) => (
              <div
                key={index}
                id={'stat-' + stat.value}
                className="text-center animate-fade-in"
                style={{ animationDelay: ((index + 1) * 100) + 'ms' }}
              >
                <div className="text-2xl md:text-3xl mb-1">{stat.icon}</div>
                <div className="text-2xl md:text-3xl font-bold text-[#1B5E3B]">
                  <AnimatedNumber target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-[#64748B] mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
