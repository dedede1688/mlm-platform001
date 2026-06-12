'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Undo, Redo, ImagePlus, Code, Minus
} from 'lucide-react'

// ---- 类型 ----

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
}

// ---- 工具栏按钮 ----

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        isActive
          ? 'bg-blue-100 text-blue-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

// ---- 分隔线 ----

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />
}

// ---- 主组件 ----

export default function RichTextEditor({
  content,
  onChange,
  placeholder = '请输入商品描述...',
  editable = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  })

  if (!editor) return null

  const handleImageUpload = () => {
    const url = window.prompt('请输入图片 URL：')
    if (url?.trim()) {
      editor.chain().focus().setImage({ src: url.trim() }).run()
    }
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
      {/* 工具栏 */}
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="加粗"
          >
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="斜体"
          >
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="删除线"
          >
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="行内代码"
          >
            <Code className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="标题1"
          >
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="标题2"
          >
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="标题3"
          >
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="无序列表"
          >
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="有序列表"
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="引用"
          >
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="分割线"
          >
            <Minus className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={handleImageUpload}
            title="插入图片"
          >
            <ImagePlus className="w-4 h-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="撤销"
          >
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="重做"
          >
            <Redo className="w-4 h-4" />
          </ToolbarButton>
        </div>
      )}

      {/* 编辑区域 */}
      <EditorContent editor={editor} />

      {/* Tiptap 样式覆盖 */}
      <style jsx global>{`
        .tiptap {
          min-height: 200px;
          outline: none;
        }
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .tiptap img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 0.75rem 0;
        }
        .tiptap h1 { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; }
        .tiptap h2 { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
        .tiptap h3 { font-size: 1.125rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
        .tiptap ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .tiptap ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .tiptap blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 1rem;
          color: #6b7280;
          margin: 0.75rem 0;
        }
        .tiptap code {
          background-color: #f3f4f6;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
        }
        .tiptap hr {
          border-top: 1px solid #e5e7eb;
          margin: 1rem 0;
        }
        .tiptap p { margin: 0.5rem 0; }
      `}</style>
    </div>
  )
}