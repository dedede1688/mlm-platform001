'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt?: string
  /** 触发 lightbox 的缩略图元素 */
  children: React.ReactNode
}

/**
 * 图片预览组件：点击缩略图打开全屏弹窗，支持缩放、拖拽、旋转。
 * - 滚轮缩放
 * - 鼠标拖拽移动
 * - 双击重置
 * - ESC 关闭
 */
export default function ImageLightbox({ src, alt = '', children }: ImageLightboxProps) {
  const [open, setOpen] = useState(false)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const reset = useCallback(() => {
    setScale(1)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    reset()
  }, [reset])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, handleClose])

  // 滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale(prev => {
      const next = prev + (e.deltaY > 0 ? -0.15 : 0.15)
      return Math.min(5, Math.max(0.3, next))
    })
  }, [])

  // 拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    }
  }, [position])

  // 拖拽移动
  useEffect(() => {
    if (!open || !dragRef.current) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      setPosition({
        x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
      })
    }
    const handleMouseUp = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [open])

  // 双击重置
  const handleDoubleClick = useCallback(() => {
    reset()
  }, [reset])

  return (
    <>
      {/* 触发元素 */}
      <div
        onClick={() => setOpen(true)}
        className="cursor-pointer"
        title="点击放大查看"
      >
        {children}
      </div>

      {/* 全屏弹窗 */}
      {open && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]"
          onClick={handleClose}
        >
          {/* 工具栏 */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setScale(s => Math.min(5, s + 0.3))}
              className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title="放大"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={() => setScale(s => Math.max(0.3, s - 0.3))}
              className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              onClick={() => setRotation(r => r + 90)}
              className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title="旋转"
            >
              <RotateCw className="w-5 h-5" />
            </button>
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              title="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 缩放比例显示 */}
          <div className="absolute top-4 left-4 text-white/60 text-sm font-mono z-10">
            {Math.round(scale * 100)}%
          </div>

          {/* 图片 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={e => e.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            draggable={false}
            className="max-w-[90vw] max-h-[90vh] object-contain select-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: dragRef.current ? 'none' : 'transform 0.1s ease-out',
              cursor: dragRef.current ? 'grabbing' : 'grab',
            }}
          />
        </div>
      )}
    </>
  )
}
