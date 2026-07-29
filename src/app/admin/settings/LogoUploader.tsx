'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'


// ---- Logo 上传组件 ----
export function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState<string | null>(value || null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPreview(value || null)
  }, [value])

  const handleFile = async (file: File) => {
    setError(null)

    // 校验类型
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('仅支持 PNG / JPG / SVG / WebP / GIF 格式')
      return
    }

    // 校验大小（base64 后约 133%，所以限制 80KB）
    if (file.size > 80 * 1024) {
      setError(`文件过大（${(file.size / 1024).toFixed(1)} KB），请压缩到 80 KB 以内`)
      return
    }

    setUploading(true)
    try {
      // 转 base64
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        onChange(dataUrl)
        setPreview(dataUrl)
        setSize(dataUrl.length)
        setUploading(false)
      }
      reader.onerror = () => {
        setError('读取文件失败')
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '上传失败')
      setUploading(false)
    }
  }

  const handleClear = () => {
    onChange('')
    setPreview(null)
    setSize(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        Logo 图片
      </label>

      {/* 预览区 */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
        {preview ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center bg-white rounded p-3 h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Logo 预览"
                className="max-h-20 max-w-full object-contain"
              />
            </div>
            {size && (
              <p className="text-xs text-gray-500 text-center">
                大小：{(size / 1024).toFixed(1)} KB
              </p>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <X className="w-4 h-4" />
              移除并使用默认 Logo
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-1">未上传 Logo</p>
            <p className="text-xs text-gray-400">将使用默认 Logo（/logo.svg）</p>
          </div>
        )}
      </div>

      {/* 上传按钮 */}
      <div className="mt-2 flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {uploading ? '处理中...' : (preview ? '更换 Logo' : '上传 Logo')}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {/* 帮助提示 */}
      <p className="mt-2 text-xs text-gray-400">
        支持 PNG / JPG / SVG / WebP / GIF，文件大小需 ≤ 80 KB。建议尺寸 200×60 像素
      </p>
    </div>
  )
}
