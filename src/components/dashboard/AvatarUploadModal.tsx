'use client'

import { useState, useMemo } from 'react'
import { X, Link2, ImageIcon, Check } from 'lucide-react'

interface AvatarUploadModalProps {
  isOpen: boolean
  onClose: () => void
  currentAvatarUrl?: string | null
  onSave: (avatarUrl: string) => Promise<void>
}

const PRESET_PROMPTS = [
  'cute cartoon avatar of a young woman, pastel pink background, minimal flat illustration',
  'friendly cartoon avatar of a young man, light blue background, minimal flat illustration',
  'cute cartoon avatar of a child with glasses, warm yellow background, minimal flat illustration',
  'professional cartoon avatar of a business woman, mint green background, minimal flat illustration',
  'friendly cartoon avatar of an elderly man, soft orange background, minimal flat illustration',
  'cute robot avatar, lavender purple background, minimal flat illustration',
]

const PRESET_LABELS = ['女生 1', '男生 1', '萌娃', '职业女性', '长辈', '机器人']

function getPresetUrl(prompt: string) {
  return `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encodeURIComponent(prompt)}&image_size=square`
}

export default function AvatarUploadModal({
  isOpen,
  onClose,
  currentAvatarUrl,
  onSave,
}: AvatarUploadModalProps) {
  const presetUrls = useMemo(() => PRESET_PROMPTS.map(getPresetUrl), [])
  const [urlInput, setUrlInput] = useState(currentAvatarUrl || '')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(
    currentAvatarUrl && presetUrls.includes(currentAvatarUrl) ? currentAvatarUrl : null
  )
  const [activeTab, setActiveTab] = useState<'url' | 'preset'>(
    currentAvatarUrl && presetUrls.includes(currentAvatarUrl) ? 'preset' : 'url'
  )
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const previewUrl = urlInput.trim() || selectedPreset || ''

  const handlePresetSelect = (url: string) => {
    setSelectedPreset(url)
    setUrlInput(url)
    setActiveTab('preset')
  }

  const handleUrlChange = (value: string) => {
    setUrlInput(value)
    setSelectedPreset(presetUrls.includes(value) ? value : null)
  }

  const handleSave = async () => {
    const finalUrl = urlInput.trim()
    setSaving(true)
    try {
      await onSave(finalUrl)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">更换头像</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview */}
        <div className="px-5 py-6 flex flex-col items-center">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-primary-100 flex items-center justify-center border-2 border-primary-100">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="头像预览"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <ImageIcon className="w-10 h-10 text-primary/60" />
            )}
          </div>
          <p className="mt-3 text-sm text-gray-500">点击预设或输入图片地址预览</p>
        </div>

        {/* Tabs */}
        <div className="px-5">
          <div className="flex rounded-xl bg-gray-100 p-1 mb-4">
            <button
              onClick={() => setActiveTab('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'url'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Link2 className="w-4 h-4" />
              输入地址
            </button>
            <button
              onClick={() => setActiveTab('preset')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'preset'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              预设头像
            </button>
          </div>

          {activeTab === 'url' ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">图片 URL</label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/avatar.png"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm"
              />
              <p className="text-xs text-gray-400">支持 jpg、png、gif 等常见图片格式</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {presetUrls.map((url, idx) => (
                <button
                  key={url}
                  onClick={() => handlePresetSelect(url)}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    selectedPreset === url
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-gray-100 hover:border-primary/50'
                  }`}
                  title={PRESET_LABELS[idx]}
                >
                  <img
                    src={url}
                    alt={PRESET_LABELS[idx]}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedPreset === url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="bg-primary text-white rounded-full p-1">
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 mt-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
