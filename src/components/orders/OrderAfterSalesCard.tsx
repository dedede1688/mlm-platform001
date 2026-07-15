'use client'

import { RotateCcw } from 'lucide-react'

export interface OrderRefundSummary {
  id: string
  reason: string
  description: string | null
  images: string[] | null
  status: string
  adminComment: string | null
  createdAt: string
}

interface OrderAfterSalesCardProps {
  orderStatus: string
  latestRefund: OrderRefundSummary | null
  onApplyRefund: () => void
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  pending: { label: '审核中', color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
  approved: { label: '退款处理中', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  completed: { label: '退款已完成', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  rejected: { label: '申请未通过', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
}

export default function OrderAfterSalesCard({
  orderStatus,
  latestRefund,
  onApplyRefund,
}: OrderAfterSalesCardProps) {
  const canApplyRefund = (orderStatus === 'paid' || orderStatus === 'shipped') && !latestRefund
  const canReapplyRefund = (orderStatus === 'paid' || orderStatus === 'shipped') && latestRefund?.status === 'rejected'

  const statusConfig = latestRefund ? STATUS_CONFIG[latestRefund.status] : null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">售后服务</h3>
        </div>

        {canApplyRefund && (
          <button
            onClick={onApplyRefund}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            申请退款
          </button>
        )}

        {canReapplyRefund && (
          <button
            onClick={onApplyRefund}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重新申请
          </button>
        )}
      </div>

      {!latestRefund && canApplyRefund && (
        <p className="mt-2 text-xs text-gray-500">
          如商品存在问题，可提交退款申请，平台审核后处理
        </p>
      )}

      {latestRefund && statusConfig && (
        <div className="mt-3">
          {/* v69: 审核结果醒目展示 */}
          <div className={`rounded-lg border ${statusConfig.borderColor} ${statusConfig.bgColor} px-4 py-3`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${statusConfig.color} bg-white/60`}>
                {statusConfig.label}
              </div>
              {latestRefund.status === 'rejected' && latestRefund.adminComment && (
                <span className="text-xs text-red-600 font-medium">原因：{latestRefund.adminComment}</span>
              )}
              {latestRefund.status === 'approved' && (
                <span className="text-xs text-blue-600">退款正在处理中，请耐心等待</span>
              )}
              {latestRefund.status === 'completed' && (
                <span className="text-xs text-green-600">退款已到账</span>
              )}
            </div>
            <details className="mt-1">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                查看退款详情
              </summary>
              <div className="mt-2 pl-3 border-l-2 border-gray-200 space-y-1.5">
                <p className="text-xs text-gray-600">
                  <span className="text-gray-400">退款原因：</span>
                  {latestRefund.reason}
                </p>
                {latestRefund.description && (
                  <p className="text-xs text-gray-600">
                    <span className="text-gray-400">补充说明：</span>
                    {latestRefund.description}
                  </p>
                )}
                {latestRefund.adminComment && latestRefund.status !== 'rejected' && (
                  <p className="text-xs text-gray-600">
                    <span className="text-gray-400">管理员备注：</span>
                    {latestRefund.adminComment}
                  </p>
                )}
                {latestRefund.images && latestRefund.images.length > 0 && (
                  <p className="text-xs text-gray-600">
                    <span className="text-gray-400">凭证图片：</span>
                    <span>{latestRefund.images.length} 张</span>
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  申请时间：{new Date(latestRefund.createdAt).toLocaleString('zh-CN')}
                </p>
              </div>
            </details>
          </div>
        </div>
      )}

      {latestRefund && !statusConfig && (
        <div className="mt-3">
          <div className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-gray-600 bg-gray-50">
            退款状态：{latestRefund.status}
          </div>
        </div>
      )}
    </div>
  )
}