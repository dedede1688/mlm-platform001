'use client'

import { useState } from 'react'
import { Download, ZoomIn, Smartphone, ImageIcon, AlertCircle } from 'lucide-react'
import ProofViewerModal from '@/components/ProofViewerModal'
import { toast } from '@/components/ToastProvider'

/**
 * 用户端充值二维码展示组件
 * - 展示平台二维码 + 说明 + 收款人名称
 * - 查看大图：复用 ProofViewerModal
 * - 保存二维码：优先 fetch + a[download]；下载失败时打开大图，提示用户长按保存
 * - 不暴露误导文案（不出现"立即支付 / 自动到账 / 已确认收款 / 跳转支付宝 / 跳转微信"）
 */
interface RechargeQrPanelProps {
  qrCodeUrl: string
  qrCodeLabel?: string
  payeeName?: string
  instruction: string
}

export default function RechargeQrPanel({
  qrCodeUrl,
  qrCodeLabel,
  payeeName,
  instruction,
}: RechargeQrPanelProps) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [imageError, setImageError] = useState(false)

  const handleSave = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const response = await fetch(qrCodeUrl)
      if (!response.ok) throw new Error('下载失败')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = '平台充值二维码.png'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(objectUrl)
    } catch {
      // 下载失败：打开大图，提示用户长按保存（不打开新窗口）
      setViewerOpen(true)
      toast.error('浏览器未能直接保存，请在大图中长按二维码保存')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold text-gray-900">{qrCodeLabel || '平台充值二维码'}</h3>
      </div>

      {/* 二维码原图 */}
      <div className="flex justify-center">
        <div
          className="relative w-56 h-56 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
          style={{ aspectRatio: '1 / 1' }}
        >
          {imageError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
              <AlertCircle className="w-8 h-8" />
              <span className="text-xs">二维码加载失败，请稍后再试</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrCodeUrl}
              alt={qrCodeLabel || '平台充值二维码'}
              onError={() => setImageError(true)}
              className="w-full h-full object-contain bg-white"
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* 收款人 */}
      {payeeName && (
        <div className="text-center text-sm text-gray-700">
          收款人：<span className="font-medium text-gray-900">{payeeName}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
          查看大图
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {downloading ? '保存中...' : '保存二维码'}
        </button>
      </div>

      {/* 付款指引 */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2 text-sm text-orange-700">
        <div className="flex items-start gap-2">
          <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>使用另一部设备直接扫码付款</p>
        </div>
        <div className="flex items-start gap-2">
          <Download className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>也可以保存二维码，在付款软件的"扫一扫"中从相册识别</p>
        </div>
        <div className="flex items-start gap-2">
          <ImageIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>付款完成后返回本页面，填写金额并上传付款成功截图，等待后台审核入账</p>
        </div>
      </div>

      {/* 充值说明（来自后台设置） */}
      {instruction && (
        <div className="text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
          {instruction}
        </div>
      )}

      <ProofViewerModal
        url={viewerOpen ? qrCodeUrl : null}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  )
}
