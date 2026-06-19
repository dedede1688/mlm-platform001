'use client'

import { useEffect, useState, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

// 数据类型（与服务端 china-regions.ts 一致）
interface District {
  code: string
  name: string
}
interface City {
  code: string
  name: string
  districts: District[]
}
interface Province {
  code: string
  name: string
  cities: City[]
}

export interface AddressPickerValue {
  province: string
  city: string
  district: string
}

interface AddressPickerProps {
  value: AddressPickerValue
  onChange: (value: AddressPickerValue) => void
  disabled?: boolean
}

/**
 * 省市区三级联动选择器
 *
 * - 首次打开时 fetch /api/regions（完整三级数据 ~120KB）
 * - 缓存在 useRef，组件卸载前不重复请求
 * - 移动端：原生 select 体验更佳
 */
export function AddressPicker({ value, onChange, disabled }: AddressPickerProps) {
  const [provinces, setProvinces] = useState<Province[]>([])
  const [loading, setLoading] = useState(true)
  const cacheRef = useRef<Province[] | null>(null)

  // 加载省级数据
  useEffect(() => {
    if (cacheRef.current) {
      setProvinces(cacheRef.current)
      setLoading(false)
      return
    }
    let cancelled = false
    fetch('/api/regions')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.success) {
          cacheRef.current = data.data
          setProvinces(data.data)
        } else {
          console.error('加载省市区数据失败:', data.error)
        }
      })
      .catch((err) => console.error('加载省市区数据失败:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedProvince = provinces.find((p) => p.name === value.province)
  const availableCities = selectedProvince?.cities || []
  const selectedCity = availableCities.find((c) => c.name === value.city)
  const availableDistricts = selectedCity?.districts || []

  const handleProvinceChange = (name: string) => {
    onChange({ province: name, city: '', district: '' })
  }

  const handleCityChange = (name: string) => {
    onChange({ ...value, city: name, district: '' })
  }

  const handleDistrictChange = (name: string) => {
    onChange({ ...value, district: name })
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-400 animate-pulse"
          >
            加载中...
          </div>
        ))}
      </div>
    )
  }

  const selectClass =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50 disabled:cursor-not-allowed'

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* 省 */}
      <div className="relative">
        <select
          value={value.province}
          onChange={(e) => handleProvinceChange(e.target.value)}
          disabled={disabled}
          className={selectClass}
        >
          <option value="">省</option>
          {provinces.map((p) => (
            <option key={p.code} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>

      {/* 市 */}
      <div className="relative">
        <select
          value={value.city}
          onChange={(e) => handleCityChange(e.target.value)}
          disabled={disabled || !value.province}
          className={selectClass}
        >
          <option value="">市</option>
          {availableCities.map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>

      {/* 区 */}
      <div className="relative">
        <select
          value={value.district}
          onChange={(e) => handleDistrictChange(e.target.value)}
          disabled={disabled || !value.city}
          className={selectClass}
        >
          <option value="">区/县</option>
          {availableDistricts.map((d) => (
            <option key={d.code} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  )
}