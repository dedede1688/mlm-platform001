import { ChevronDown, ChevronUp } from 'lucide-react'

// 折叠面板组件
export function AccordionSection({
  title, icon: Icon, isOpen, onToggle, children
}: {
  title: string
  icon: React.ElementType
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        {isOpen
          ? <ChevronUp className="w-5 h-5 text-gray-400" />
          : <ChevronDown className="w-5 h-5 text-gray-400" />
        }
      </button>
      {isOpen && (
        <div className="px-6 py-5 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}
