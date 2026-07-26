'use client'

import { ChevronDown, ChevronRight, Folder, FolderOpen, Plus, Edit2, Trash2 } from 'lucide-react'

interface TreeNode {
  id: string
  name: string
  sortOrder: number
  parentId: string | null
  children: TreeNode[]
}

interface TreeListProps {
  nodes: TreeNode[]
  expandedIds: Set<string>
  toggleExpand: (id: string) => void
  onEdit: (item: any) => void
  onAddChild: (parentId: string) => void
  onDelete: (id: string) => void
  depth: number
}

export default function CategoryTreeList({ nodes, expandedIds, toggleExpand, onEdit, onAddChild, onDelete, depth }: TreeListProps) {
  if (nodes.length === 0) return null

  return (
    <div>
      {nodes.map(node => {
        const hasChildren = node.children.length > 0
        const isExpanded = expandedIds.has(node.id)

        return (
          <div key={node.id}>
            <div
              className="grid grid-cols-[1fr_80px_160px] gap-4 px-6 py-3 border-b border-gray-100
                hover:bg-gray-50 transition-colors items-center"
              style={{ paddingLeft: `${24 + depth * 24}px` }}
            >
              {/* 名称 */}
              <div className="flex items-center gap-2 min-w-0">
                {hasChildren ? (
                  <button
                    onClick={() => toggleExpand(node.id)}
                    className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                ) : (
                  <span className="w-5" />
                )}
                {hasChildren ? (
                  isExpanded ? <FolderOpen className="w-4 h-4 text-blue-500" /> : <Folder className="w-4 h-4 text-gray-400" />
                ) : (
                  <Folder className="w-4 h-4 text-gray-300" />
                )}
                <span className="text-sm font-medium text-gray-900 truncate">{node.name}</span>
                {hasChildren && (
                  <span className="text-xs text-gray-400">({node.children.length})</span>
                )}
              </div>

              {/* 排序 */}
              <span className="text-sm text-gray-500 text-center">{node.sortOrder}</span>

              {/* 操作 */}
              <div className="flex items-center gap-1 justify-end">
                <button
                  onClick={() => onAddChild(node.id)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="添加子分类"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onEdit(node)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="编辑"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(node.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 子节点 */}
            {hasChildren && isExpanded && (
              <CategoryTreeList
                nodes={node.children}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                onEdit={onEdit}
                onAddChild={onAddChild}
                onDelete={onDelete}
                depth={depth + 1}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
