import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { sanitizeHtml } from '@/lib/utils/sanitize-html'

// 富文本编辑器（textarea + 预览）
export function HtmlEditor({
  label, value, onChange, placeholder
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [preview, setPreview] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <button
          type="button"
          onClick={() => setPreview(!preview)}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
        >
          {preview ? (
            <><EyeOff className="w-3.5 h-3.5" /> 编辑</>
          ) : (
            <><Eye className="w-3.5 h-3.5" /> 预览</>
          )}
        </button>
      </div>
      {preview ? (
        <div
          className="w-full min-h-[200px] p-4 border border-gray-300 rounded-lg
            prose prose-gray max-w-none
            prose-headings:text-gray-900 prose-p:text-gray-600 prose-p:leading-relaxed
            prose-a:text-blue-600"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(value || '<p class="text-gray-300">暂无内容</p>') }}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={10}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-colors text-gray-900 placeholder-gray-400 font-mono text-sm
            hover:border-gray-400 resize-y"
          placeholder={placeholder || `请输入${label}的 HTML 内容`}
        />
      )}
    </div>
  )
}
