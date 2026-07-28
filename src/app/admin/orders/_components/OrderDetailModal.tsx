'use client'

import { X, Package, Loader2 } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import Image from 'next/image'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待支付', color: 'bg-yellow-100 text-yellow-800' },
  paid: { label: '已支付', color: 'bg-blue-100 text-blue-800' },
  shipped: { label: '已发货', color: 'bg-purple-100 text-purple-800' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-800' },
  cancelled: { label: '已取消', color: 'bg-gray-100 text-gray-800' },
  refund_requested: { label: '退款申请', color: 'bg-orange-100 text-orange-800' },
  refunded: { label: '已退款', color: 'bg-red-100 text-red-800' },
}

export default function OrderDetailModal({
  detailOrder,
  detailLoading,
  actions,
  actionIcons,
  handleStatusAction,
  formatTime,
  closeDetail,
  updatingStatus,
}: any) {
  return (
    <>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => closeDetail()} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* 标题 */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">订单详情</h2>
              <button
                onClick={() => closeDetail()}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容 */}
            <div className="px-6 py-5 space-y-6">
              {/* 订单基本信息 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">订单信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-400">订单号</span>
                    <p className="text-sm font-mono text-gray-900">{detailOrder.orderNo}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">状态</span>
                    <p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_MAP[detailOrder.status]?.color || 'bg-gray-100 text-gray-500'
                      }`}>
                        {STATUS_MAP[detailOrder.status]?.label || detailOrder.status}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">总金额</span>
                    <p className="text-sm text-gray-900">¥{detailOrder.totalAmount.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">实付金额</span>
                    <p className="text-sm text-blue-600 font-medium">¥{detailOrder.payAmount.toFixed(2)}</p>
                  </div>
                  {detailOrder.pointsUsed > 0 && (
                    <>
                      <div>
                        <span className="text-xs text-gray-400">使用积分</span>
                        <p className="text-sm text-gray-900">{detailOrder.pointsUsed}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">积分抵扣</span>
                        <p className="text-sm text-gray-900">¥{detailOrder.pointsDiscount.toFixed(2)}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-xs text-gray-400">创建时间</span>
                    <p className="text-sm text-gray-900">{formatTime(detailOrder.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">支付时间</span>
                    <p className="text-sm text-gray-900">{formatTime(detailOrder.paidAt)}</p>
                  </div>
                  {detailOrder.shippedAt && (
                    <div>
                      <span className="text-xs text-gray-400">发货时间</span>
                      <p className="text-sm text-gray-900">{formatTime(detailOrder.shippedAt)}</p>
                    </div>
                  )}
                  {detailOrder.trackingNumber && (
                    <div>
                      <span className="text-xs text-gray-400">物流单号</span>
                      <p className="text-sm font-mono text-gray-900">{detailOrder.trackingNumber}</p>
                    </div>
                  )}
                  {detailOrder.completedAt && (
                    <div>
                      <span className="text-xs text-gray-400">完成时间</span>
                      <p className="text-sm text-gray-900">{formatTime(detailOrder.completedAt)}</p>
                    </div>
                  )}
                  {detailOrder.cancelledAt && (
                    <div>
                      <span className="text-xs text-gray-400">取消时间</span>
                      <p className="text-sm text-gray-900">{formatTime(detailOrder.cancelledAt)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 用户信息 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">用户信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-400">手机号</span>
                    <p className="text-sm text-gray-900">{detailOrder.user.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">昵称</span>
                    <p className="text-sm text-gray-900">{detailOrder.user.nickname || '-'}</p>
                  </div>
                </div>
              </div>

              {/* 商品列表 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">商品列表</h3>
                <div className="space-y-3">
                  {detailOrder.items.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg bg-gray-50">
                      {/* 商品图片 */}
                      {item.product.imageUrl ? (
                        <div className="w-14 h-14 rounded-lg relative overflow-hidden border border-gray-200 flex-shrink-0">
                          <Image
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      {/* 商品信息 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">单价 ¥{item.unitPrice.toFixed(2)}</p>
                      </div>
                      {/* 数量和金额 */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">x{item.quantity}</p>
                        <p className="text-sm font-medium text-gray-900">¥{item.totalPrice.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 奖励记录 */}
              {detailOrder.rewards && detailOrder.rewards.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">奖励记录</h3>
                  <div className="space-y-2">
                    {detailOrder.rewards.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 border border-gray-100 rounded-lg bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.type === 'referral' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                          }`}>
                            {r.type === 'referral' ? '推荐奖' : r.type === 'brand_bonus' ? '品牌奖' : r.type}
                          </span>
                          {r.level != null && (
                            <span className="text-xs text-gray-400">第{r.level}层</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-900">+¥{r.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-2xl">
              {actions.map((act: any) => {
                const ActionIcon = actionIcons[act.status]
                return (
                  <button
                    key={act.status}
                    onClick={() => handleStatusAction(detailOrder.id, act)}
                    disabled={updatingStatus}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium shadow-sm text-white ${
                      act.status === 'cancelled'
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-blue-600 hover:bg-blue-700'
                    } transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <ActionIcon className="w-4 h-4" />
                    {act.label}
                  </button>
                )
              })}
              <button
                onClick={() => closeDetail()}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                  hover:bg-gray-50 transition-colors font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>

      {/* 加载中遮罩（详情） */}
      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-gray-600">加载中...</span>
          </div>
        </div>
      )}
    </>
  )
}
