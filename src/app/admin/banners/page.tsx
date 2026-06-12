'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import {
  ImageIcon, Loader2, AlertCircle, Plus, Edit2, Trash2,
  ArrowUp, ArrowDown, X, Save
} from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'

// ---- 类型定义 ----

interface BannerItem {
  id: string
  imageUrl: string
  link?: string
  title?: string
  alt?: string
  order: number
}

interface BannerFormData {
  id: string
  imageUrl: string
  link: string
  title: string
  alt: string
  order: number
}

// ---- 预设链接选项 ----

const LINK_OPTIONS: { value: string; label: string }[] = [
  { value: '/', label: '首页' },
  { value: '/products', label: '商品中心' },
  { value: '/dashboard', label: '个人中心' },
  { value: '/cart', label: '购物车' },
  { value: '/about', label: '关于我们' },
  { value: '__other__', label: '其他（自定义链接）' },
]

function getLinkSelectValue(currentLink: string): string {
  if (!currentLink) return ''
  const match = LINK_OPTIONS.find(opt => opt.value === currentLink && opt.value !== '__other__')
  return match ? match.value : '__other__'
}

// ---- 辅助函数 ----

function generateId(): string {
  return `banner_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

function createEmptyBanner(order: number): BannerFormData {
  return {
    id: generateId(),
    imageUrl: '',
    link: '',
    title: '',
    alt: '',
    order,
  }
}

// ---- 组件 ----

export default function BannersPage() {
  const [banners, setBanners] = useState<BannerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 编辑模式
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<BannerFormData[]>([])

  // 删除确认
  const [_deleteId, setDeleteId] = useState<string | null>(null)

  const fetchBanners = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/banners', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 403 || res.status === 401) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success && data.data) {
        setBanners(data.data)
      } else {
        setError(data.error || '获取轮播图失败')
      }
    } catch (err) {
      console.error('获取轮播图失败:', err)
      setError('网络错误，加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBanners()
  }, [fetchBanners])

  // ---- 开始编辑 ----
  const handleStartEdit = useCallback(() => {
    const mapped = banners.map((b, index) => ({
      id: b.id,
      imageUrl: b.imageUrl,
      link: b.link || '',
      title: b.title || '',
      alt: b.alt || '',
      order: b.order ?? index,
    }))
    setFormData(mapped)
    setIsEditing(true)
    setMessage(null)
  }, [banners])

  // ---- 退出编辑 ----
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setFormData([])
    setDeleteId(null)
  }, [])

  // ---- 添加轮播图 ----
  const handleAdd = useCallback(() => {
    setFormData(prev => [
      ...prev,
      createEmptyBanner(prev.length),
    ])
  }, [])

  // ---- 更新表单字段 ----
  const handleUpdateField = useCallback((index: number, field: keyof BannerFormData, value: string | number) => {
    setFormData(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    )
  }, [])

  // ---- 删除轮播图 ----
  const handleDelete = useCallback((index: number) => {
    setFormData(prev => {
      const item = prev[index]
      if (item.imageUrl) {
        setDeleteId(item.id)
      }
      const filtered = prev.filter((_, i) => i !== index)
      // 重新排序
      return filtered.map((item, i) => ({ ...item, order: i }))
    })
  }, [])

  // ---- 上移 ----
  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return
    setFormData(prev => {
      const arr = [...prev]
      const temp = arr[index]
      arr[index] = arr[index - 1]
      arr[index - 1] = temp
      return arr.map((item, i) => ({ ...item, order: i }))
    })
  }, [])

  // ---- 下移 ----
  const handleMoveDown = useCallback((index: number) => {
    setFormData(prev => {
      if (index >= prev.length - 1) return prev
      const arr = [...prev]
      const temp = arr[index]
      arr[index] = arr[index + 1]
      arr[index + 1] = temp
      return arr.map((item, i) => ({ ...item, order: i }))
    })
  }, [])

  // ---- 保存 ----
  const handleSave = useCallback(async () => {
    // 验证
    for (const item of formData) {
      if (!item.imageUrl.trim()) {
        setMessage({ type: 'error', text: '所有轮播图都必须上传图片' })
        return
      }
    }

    setSaving(true)
    setMessage(null)

    try {
      const token = localStorage.getItem('token')
      const payload = {
        banners: formData.map(item => ({
          ...item,
          imageUrl: item.imageUrl.trim(),
          link: item.link.trim() || undefined,
          title: item.title.trim() || undefined,
          alt: item.alt.trim() || undefined,
        })),
      }

      const res = await fetch('/api/admin/banners', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        setBanners(data.data || [])
        setIsEditing(false)
        setFormData([])
        setMessage({ type: 'success', text: '保存成功' })
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' })
      }
    } catch (err) {
      console.error('保存轮播图失败:', err)
      setMessage({ type: 'error', text: '网络错误，保存失败' })
    } finally {
      setSaving(false)
    }
  }, [formData])

  // ---- 加载状态 ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    )
  }

  // ---- 错误状态 ----
  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <span className="ml-3 text-red-600">{error}</span>
      </div>
    )
  }

  // ---- 渲染预览列表（只读模式） ----
  const renderPreviewList = () => (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">轮播图管理</h1>
        <button
          onClick={handleStartEdit}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
            hover:bg-blue-700 transition-colors font-medium"
        >
          <Edit2 className="w-4 h-4" />
          编辑
        </button>
      </div>

      {banners.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">暂无轮播图</p>
          <button
            onClick={handleStartEdit}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加轮播图
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-24">缩略图</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">图片</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-36">链接</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-32">标题</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-28">Alt</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 w-16">排序</th>
                </tr>
              </thead>
              <tbody>
                {banners.map((banner) => (
                  <tr key={banner.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {banner.imageUrl ? (
                        <div className="w-20 h-12 rounded relative overflow-hidden border border-gray-200">
                          <Image
                            src={banner.imageUrl}
                            alt={banner.alt || banner.title || '轮播图'}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-12 bg-gray-100 rounded flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-300" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700 break-all text-xs font-mono">
                        {banner.imageUrl}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {banner.link ? (
                        <span className="text-blue-600 text-xs break-all">{banner.link}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {banner.title ? (
                        <span className="text-gray-700">{banner.title}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {banner.alt ? (
                        <span className="text-gray-700">{banner.alt}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {banner.order}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-gray-400">共 {banners.length} 条轮播图</p>
        </>
      )}
    </div>
  )

  // ---- 渲染编辑表单 ----
  const renderEditForm = () => (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">编辑轮播图</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancelEdit}
            className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
              hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* 添加按钮 */}
      <button
        onClick={handleAdd}
        className="mb-4 inline-flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-200
          hover:bg-blue-50 rounded-lg transition-colors"
      >
        <Plus className="w-4 h-4" />
        添加轮播图
      </button>

      {/* 表单列表 */}
      <div className="space-y-4">
        {formData.map((item, index) => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start gap-4">
              {/* 排序控制 */}
              <div className="flex flex-col items-center gap-1 pt-2">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-gray-500 w-6 text-center">{item.order}</span>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === formData.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <ImageUpload
                    label="轮播图片"
                    value={item.imageUrl}
                    onChange={url => handleUpdateField(index, 'imageUrl', url)}
                    bucket="banners"
                    folder="banners"
                    maxSizeMB={5}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                  <input
                    type="text"
                    value={item.title}
                    onChange={e => handleUpdateField(index, 'title', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 text-sm"
                    placeholder="轮播图标题"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alt 描述</label>
                  <input
                    type="text"
                    value={item.alt}
                    onChange={e => handleUpdateField(index, 'alt', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 text-sm"
                    placeholder="图片描述（用于SEO）"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">跳转链接</label>
                  <select
                    value={getLinkSelectValue(item.link)}
                    onChange={e => {
                      const val = e.target.value
                      if (val === '__other__') {
                        // 切换到自定义时清空，让用户输入
                        handleUpdateField(index, 'link', '')
                      } else {
                        handleUpdateField(index, 'link', val)
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg
                      focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                      transition-colors text-gray-900 text-sm bg-white"
                  >
                    <option value="">不跳转</option>
                    {LINK_OPTIONS.filter(o => o.value !== '__other__').map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                    <option value="__other__">其他（自定义链接）</option>
                  </select>
                  {getLinkSelectValue(item.link) === '__other__' && (
                    <input
                      type="text"
                      value={item.link}
                      onChange={e => handleUpdateField(index, 'link', e.target.value)}
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        transition-colors text-gray-900 text-sm"
                      placeholder="https://example.com"
                    />
                  )}
                </div>
              </div>

              {/* 删除按钮 */}
              <button
                onClick={() => handleDelete(index)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {formData.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">暂无轮播图，点击「添加轮播图」开始</p>
        </div>
      )}
    </div>
  )

  return isEditing ? renderEditForm() : renderPreviewList()
}