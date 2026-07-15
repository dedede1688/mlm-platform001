'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft, Loader2, AlertCircle, Upload, X
} from 'lucide-react'
import { supabaseBrowserClient, isSupabaseAvailable } from '@/lib/supabase/client'
import {
  refundReasonRequiresDescription,
  refundReasonRequiresImages,
  validateRefundApplication,
} from '@/lib/refunds/refund-validation'

// ---- 类型 ----

interface RefundForm {
  reason: string
  description: string
  images: string[]
}

// ---- 退款原因选项 ----

const REASON_OPTIONS = [
  { value: '', label: '请选择退款原因' },
  { value: '质量问题', label: '质量问题' },
  { value: '未按约定时间发货', label: '未按约定时间发货' },
  { value: '商品损坏', label: '商品损坏' },
  { value: '其他', label: '其他' },
]

// ---- 工具函数 ----

function generateFileName(file: File): string {
  const ext = file.name.split('.').pop() || 'jpg'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}.${ext}`
}

// ---- 主组件 ----

export default function RefundApplyPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState<RefundForm>({
    reason: '',
    description: '',
    images: [],
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingIndex, setUploadingIndex] = useState(-1)

  const imagesRequired = refundReasonRequiresImages(form.reason)
  const descriptionRequired = refundReasonRequiresDescription(form.reason)
  const currentValidation = validateRefundApplication(form)
  const formInvalid = !currentValidation.success

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      router.push('/login')
      return
    }
    setToken(storedToken)
  }, [router])

  const handleReasonChange = (value: string) => {
    setForm(prev => ({ ...prev, reason: value }))
    setError(null)
  }

  const handleDescriptionChange = (value: string) => {
    setForm(prev => ({ ...prev, description: value }))
  }

  // 上传单张图片到 Supabase
  const uploadImage = async (file: File): Promise<string> => {
    const fileName = generateFileName(file)
    const filePath = `refunds/${fileName}`

    if (isSupabaseAvailable() && supabaseBrowserClient) {
      const { error: uploadError } = await supabaseBrowserClient.storage
        .from('images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        throw new Error(`上传失败: ${uploadError.message}`)
      }

      const { data } = supabaseBrowserClient.storage.from('images').getPublicUrl(filePath)
      return data.publicUrl
    }

    // 回退 Base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // 最多5张
    const remaining = 5 - form.images.length
    if (remaining <= 0) return

    const filesToUpload = Array.from(files).slice(0, remaining)

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i]
      if (!file.type.startsWith('image/')) continue
      if (file.size > 5 * 1024 * 1024) continue

      setUploadingIndex(form.images.length + i)
      try {
        const url = await uploadImage(file)
        setForm(prev => ({ ...prev, images: [...prev.images, url] }))
      } catch (err) {
        console.error('上传图片失败:', err)
      }
    }
    setUploadingIndex(-1)

    // 重置 input
    e.target.value = ''
  }

  // 删除已上传图片
  const handleRemoveImage = (index: number) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }))
  }

  // 提交退款申请
  const handleSubmit = async () => {
    if (!token) return

    const validation = validateRefundApplication(form)
    if (!validation.success) {
      setError(validation.error)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${params.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: validation.data.reason,
          description: validation.data.description || undefined,
          images: validation.data.images.length > 0 ? validation.data.images : undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        router.push(`/dashboard/orders/${params.id}?refund=success`)
      } else {
        setError(data.error || '提交失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/orders/${params.id}`)}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">申请退款</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* 退款原因 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            退款原因 <span className="text-red-500">*</span>
          </label>
          <select
            value={form.reason}
            onChange={e => handleReasonChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-colors text-gray-900 hover:border-gray-400"
          >
            {REASON_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 补充说明 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            补充说明
            {descriptionRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
          <textarea
            value={form.description}
            onChange={e => handleDescriptionChange(e.target.value)}
            rows={4}
            placeholder="请详细描述退款原因，有助于我们更快处理..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400
              resize-none"
          />
        </div>

        {/* 上传凭证 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            上传凭证
            {imagesRequired && <span className="text-red-500 ml-1">*</span>}
          </label>
          {imagesRequired && (
            <p className="text-xs text-red-500 mb-2">
              该退款原因至少需要上传1张凭证图片
            </p>
          )}
          <p className="text-xs text-gray-400 mb-3">最多上传5张图片，支持 JPG、PNG，单张最大5MB</p>

          <div className="flex flex-wrap gap-3">
            {/* 已上传图片 */}
            {form.images.map((url, index) => (
              <div key={index} className="relative w-20 h-20 group">
                <Image
                  src={url}
                  alt={`凭证${index + 1}`}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover rounded-lg border border-gray-200"
                />
                <button
                  onClick={() => handleRemoveImage(index)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white
                    rounded-full flex items-center justify-center shadow-sm
                    opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* 上传中占位 */}
            {uploadingIndex >= 0 && (
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50
                flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div>
            )}

            {/* 添加按钮 */}
            {form.images.length < 5 && uploadingIndex < 0 && (
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300
                bg-gray-50 flex flex-col items-center justify-center cursor-pointer
                hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-[10px] text-gray-400 mt-1">添加图片</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => router.push(`/dashboard/orders/${params.id}`)}
            className="flex-1 py-3 rounded-xl text-gray-700 font-medium text-base transition-all
              bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || formInvalid}
            className="flex-1 py-3 rounded-xl text-white font-semibold text-base transition-all
              bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? '提交中...' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  )
}