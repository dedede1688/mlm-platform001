'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { Upload, X, Link2, Loader2 } from 'lucide-react'
import { supabaseBrowserClient, isSupabaseAvailable } from '@/lib/supabase/client'

// ---- 类型定义 ----

interface ImageUploadProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  bucket?: string
  folder?: string
  disabled?: boolean
  maxSizeMB?: number
  accept?: string
}

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

type UploadMode = 'file' | 'url'

// ---- 辅助函数 ----

function generateFileName(file: File): string {
  const ext = file.name.split('.').pop() || 'jpg'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}.${ext}`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ---- 组件 ----

export default function ImageUpload({
  value,
  onChange,
  label = '图片',
  placeholder = '输入图片URL或拖拽上传',
  bucket = 'images',
  folder = 'uploads',
  disabled = false,
  maxSizeMB = 5,
  accept = 'image/*',
}: ImageUploadProps) {
  const [mode, setMode] = useState<UploadMode>('file')
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0 })
  const [dragOver, setDragOver] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  // 上传到 Supabase Storage
  const uploadToSupabase = useCallback(async (file: File): Promise<string> => {
    if (!supabaseBrowserClient) {
      throw new Error('Supabase 客户端未配置')
    }

    const fileName = generateFileName(file)
    const filePath = `${folder}/${fileName}`

    const { error } = await supabaseBrowserClient.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      throw new Error(`上传失败: ${error.message}`)
    }

    const { data } = supabaseBrowserClient.storage.from(bucket).getPublicUrl(filePath)
    return data.publicUrl
  }, [bucket, folder])

  // 处理文件上传
  const handleFileUpload = useCallback(async (file: File) => {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      setUploadState({ status: 'error', progress: 0, error: '只允许上传图片文件' })
      return
    }

    // 验证文件大小
    if (file.size > maxSizeBytes) {
      setUploadState({ status: 'error', progress: 0, error: `文件大小不能超过 ${maxSizeMB}MB` })
      return
    }

    setUploadState({ status: 'uploading', progress: 0 })
    setPreviewError(false)

    try {
      let url: string

      // 尝试 Supabase Storage；如果失败（bucket 不存在等），则回退到 Base64
      try {
        if (isSupabaseAvailable()) {
          setUploadState({ status: 'uploading', progress: 50 })
          url = await uploadToSupabase(file)
        } else {
          throw new Error('Supabase 不可用')
        }
      } catch (supabaseError) {
        console.warn('Supabase 上传失败，回退到 Base64:', supabaseError)
        setUploadState({ status: 'uploading', progress: 75 })
        url = await fileToBase64(file)
      }

      setUploadState({ status: 'success', progress: 100 })
      onChange(url)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上传过程中发生未知错误'
      setUploadState({ status: 'error', progress: 0, error: message })
    }
  }, [maxSizeBytes, maxSizeMB, onChange, uploadToSupabase])

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [disabled, handleFileUpload])

  // 文件选择处理
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
    // 重置 input 以便可以再次选择同一个文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFileUpload])

  // 清除图片
  const handleClear = useCallback(() => {
    onChange('')
    setUploadState({ status: 'idle', progress: 0 })
    setPreviewError(false)
  }, [onChange])

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      )}

      {/* 模式切换 */}
      <div className="flex rounded-lg bg-gray-100 p-1 mb-3">
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md transition-all ${
            mode === 'file'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Upload className="w-4 h-4" />
          本地上传
        </button>
        <button
          type="button"
          onClick={() => setMode('url')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-md transition-all ${
            mode === 'url'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Link2 className="w-4 h-4" />
          图片链接
        </button>
      </div>

      {/* URL 模式 */}
      {mode === 'url' && (
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setPreviewError(false)
            }}
            disabled={disabled}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400
              disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={placeholder}
          />
          {value && !previewError && (
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 inline-block relative group">
              <div className="relative w-24 h-24">
                <Image
                  src={value}
                  alt="预览"
                  fill
                  className="object-cover"
                />
              </div>
              <button
                onClick={handleClear}
                className="absolute top-0.5 right-0.5 w-6 h-6 bg-red-500 text-white rounded-full
                  flex items-center justify-center opacity-0 group-hover:opacity-100
                  transition-opacity hover:bg-red-600"
                type="button"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {value && previewError && (
            <div className="mt-2 text-sm text-red-500">图片预览失败，请检查链接是否有效</div>
          )}
        </div>
      )}

      {/* 文件上传模式 */}
      {mode === 'file' && (
        <div>
          {!value ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !disabled && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                disabled={disabled || uploadState.status === 'uploading'}
                className="hidden"
              />

              {uploadState.status === 'uploading' ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <span className="text-sm text-gray-600">上传中...</span>
                  <div className="w-full max-w-[200px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                </div>
              ) : uploadState.status === 'error' ? (
                <div className="flex flex-col items-center gap-2">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <span className="text-sm text-red-600">{uploadState.error}</span>
                  <span className="text-xs text-gray-400">点击重新选择</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">点击或拖拽图片到此处</span>
                  <span className="text-xs text-gray-400">支持 JPG、PNG、GIF、WEBP，最大 {maxSizeMB}MB</span>
                </div>
              )}
            </div>
          ) : (
            <div className="relative inline-block group">
              <div className="relative w-32 h-32 rounded-lg overflow-hidden border border-gray-200">
                <Image
                  src={value}
                  alt="已上传"
                  fill
                  className="object-cover"
                />
              </div>
              <button
                onClick={handleClear}
                className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full
                  flex items-center justify-center shadow-md
                  opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity
                  hover:bg-red-600"
                type="button"
                title="删除图片"
              >
                <X className="w-4 h-4" />
              </button>
              {uploadState.status === 'success' && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center">
                  <CheckIcon className="w-3 h-3" />
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- 辅助图标组件 ----

function AlertCircle(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}