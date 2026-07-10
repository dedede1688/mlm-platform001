'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageOff, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  MAX_PROOF_SCALE,
  MIN_PROOF_SCALE,
  clampProofScale,
} from '@/lib/utils/proof-viewer'

interface ProofViewerModalProps {
  url: string | null
  onClose: () => void
}

export default function ProofViewerModal({ url, onClose }: ProofViewerModalProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })

  const resetPosition = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const fitToWindow = useCallback((size = imageSize) => {
    const viewport = viewportRef.current
    if (!viewport || !size.width || !size.height) return

    const availableWidth = Math.max(viewport.clientWidth - 48, 1)
    const availableHeight = Math.max(viewport.clientHeight - 48, 1)
    const fittedScale = Math.min(availableWidth / size.width, availableHeight / size.height, 1)

    setScale(clampProofScale(fittedScale))
    setOffset({ x: 0, y: 0 })
  }, [imageSize])

  useEffect(() => {
    if (!url) return

    setScale(1)
    setOffset({ x: 0, y: 0 })
    setDragging(false)
    setImageError(false)
    setImageSize({ width: 0, height: 0 })

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [url, onClose])

  if (!url) return null

  const changeScale = (delta: number) => {
    setScale((current) => clampProofScale(current + delta))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragging) return
    setOffset({
      x: dragStartRef.current.offsetX + event.clientX - dragStartRef.current.x,
      y: dragStartRef.current.offsetY + event.clientY - dragStartRef.current.y,
    })
  }

  const stopDragging = (event: React.PointerEvent<HTMLImageElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label="付款凭证"
    >
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/15 bg-black/50 px-4 text-white">
        <h2 className="text-base font-semibold">付款凭证</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-200 hover:bg-white/10 hover:text-white"
          aria-label="关闭凭证弹窗"
          title="关闭"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-12 flex-shrink-0 flex-wrap items-center justify-center gap-1.5 border-b border-white/10 bg-black/40 px-3 py-2 text-white">
        <button
          type="button"
          onClick={() => changeScale(-0.25)}
          disabled={scale <= MIN_PROOF_SCALE}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="缩小"
          title="缩小"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-14 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={() => changeScale(0.25)}
          disabled={scale >= MAX_PROOF_SCALE}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="放大"
          title="放大"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetPosition}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm hover:bg-white/10"
          title="按图片原始大小显示"
        >
          <RotateCcw className="h-4 w-4" />
          原始大小
        </button>
        <button
          type="button"
          onClick={() => fitToWindow()}
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm hover:bg-white/10"
          title="完整显示在当前窗口内"
        >
          <Maximize2 className="h-4 w-4" />
          适应窗口
        </button>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onWheel={(event) => {
          event.preventDefault()
          changeScale(event.deltaY > 0 ? -0.2 : 0.2)
        }}
      >
        {imageError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-300">
            <ImageOff className="h-12 w-12 text-gray-500" />
            <p className="text-sm">图片加载失败，请检查凭证链接</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <img
              src={url}
              alt="付款凭证原图"
              draggable={false}
              onLoad={(event) => {
                const size = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                }
                setImageSize(size)
                requestAnimationFrame(() => fitToWindow(size))
              }}
              onError={() => setImageError(true)}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                touchAction: 'none',
              }}
              className={`max-w-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 bg-black/50 px-4 py-2 text-center text-xs text-gray-300">
        可使用鼠标滚轮缩放，按住图片拖动查看；按 Esc 键关闭
      </div>
    </div>
  )
}
