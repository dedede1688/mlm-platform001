'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, X, Link2, Loader2, Video, Play } from 'lucide-react'
import { supabaseBrowserClient, isSupabaseAvailable } from '@/lib/supabase/client'

// ---- 类型 ----

interface VideoUploadProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  maxSizeMB?: number
}

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

type UploadMode = 'file' | 'url'

// ---- 辅助函数 ----

function generateFileName(file: File): string {
  const ext = file.name.split('.').pop() || 'mp4'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${timestamp}-${random}.${ext}`
}

// ---- 组件 ----

export default function VideoUpload({
  value,
  onChange,
  label = '视频',
  placeholder = '输入视频URL或拖拽上传',
  disabled = false,
  maxSizeMB = 100,
}: VideoUploadProps) {
  const [mode, setMode] = useState<UploadMode>('url')
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle', progress: 0 })
  const [urlInput, setUrlInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  // 上传到 Supabase Storage
  const uploadToSupabase = useCallback(async (file: File): Promise<string> => {
    if (!supabaseBrowserClient) {
      throw new Error('Supabase 客户端未配置')
    }

    const fileName = generateFileName(file)
    const filePath = `videos/${fileName}`

    const { error } = await supabaseBrowserClient.storage
      .from('images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      throw new Error(`上传失败: ${error.message}`)
    }

    const { data } = supabaseBrowserClient.storage.from('images').getPublicUrl(filePath)
    return data.publicUrl
  }, [])

  // 处理文件上传
  const handleFileUpload = useCallback(async (file: File) => {
    // 验证文件类型
    if (!file.type.startsWith('video/')) {
      setUploadState({ status: 'error', progress: 0, error: '只允许上传视频文件' })
      return
    }

    // 验证文件大小
    if (file.size > maxSizeBytes) {
      setUploadState({ status: 'error', progress: 0, error: `文件大小不能超过 ${maxSizeMB}MB` })
      return
    }

    setUploadState({ status: 'uploading', progress: 0 })

    try {
      let url: string

      if (isSupabaseAvailable()) {
        setUploadState({ status: 'uploading', progress: 50 })
        url = await uploadToSupabase(file)
      } else {
        setUploadState({ status: 'error', progress: 0, error: '视频文件较大，请配置 Supabase Storage 后上传' })
        return
      }

      setUploadState({ status: 'success', progress: 100 })
      onChange(url)

      setTimeout(() => {
        setUploadState({ status: 'idle', progress: 0 })
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '上传失败'
      setUploadState({ status: 'error', progress: 0, error: msg })
    }
  }, [maxSizeBytes, maxSizeMB, onChange, uploadToSupabase])

  // 文件选择
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
    e.target.value = ''
  }

  // 拖拽
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileUpload(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  // URL 提交
  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim())
      setUrlInput('')
    }
  }

  // 清除
  const handleClear = () => {
    onChange('')
    setUploadState({ status: 'idle', progress: 0 })
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>

      {value ? (
        /* 已有视频 - 预览 */
        <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black">
          <video
            src={value}
            controls
            className="w-full max-h-64 object-contain"
            onError={(e) => {
              (e.target as HTMLVideoElement).style.display = 'none'
            }}
          />
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full
              hover:bg-black/80 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* 无视频 - 上传区域 */
        <div>
          {/* 模式切换 */}
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                mode === 'file'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              文件上传
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                mode === 'url'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              URL 输入
            </button>
          </div>

          {mode === 'file' ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                transition-colors ${
                  dragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                disabled={disabled}
                className="hidden"
              />
              {uploadState.status === 'uploading' ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-600">上传中... {uploadState.progress}%</span>
                </div>
              ) : uploadState.status === 'error' ? (
                <div className="flex flex-col items-center gap-2">
                  <Video className="w-8 h-8 text-red-400" />
                  <span className="text-sm text-red-600">{uploadState.error}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Play className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-500">点击或拖拽视频文件到此处上传</span>
                  <span className="text-xs text-gray-400">支持 MP4、WebM 等格式，最大 {maxSizeMB}MB</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                placeholder={placeholder}
                disabled={disabled}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  text-gray-900 placeholder-gray-400"
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                disabled={disabled || !urlInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                  hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认
              </button>
            </div>
          )}

          {/* 上传成功提示 */}
          {uploadState.status === 'success' && (
            <p className="mt-2 text-xs text-green-600">上传成功</p>
          )}
        </div>
      )}
    </div>
  )
}