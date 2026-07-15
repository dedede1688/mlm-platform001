'use client'

import Image from 'next/image'

export interface RefundHistoryRecord {
  id: string
  reason: string
  description: string | null
  images: unknown
  status: string
  adminComment: string | null
  createdAt: string
}

export function buildRefundAttemptView(records: RefundHistoryRecord[], currentRefundId: string) {
  const chronological = [...records].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const numbered = chronological.map((record, index) => ({
    ...record,
    attemptNumber: index + 1,
  }))
  return {
    currentAttemptNumber: numbered.find(record => record.id === currentRefundId)?.attemptNumber ?? 1,
    previousRecords: numbered
      .filter(record => record.id !== currentRefundId)
      .sort((left, right) => right.attemptNumber - left.attemptNumber),
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  completed: '已完成',
}

function parseImages(images: unknown): string[] {
  return Array.isArray(images)
    ? images.filter((image): image is string => typeof image === 'string' && Boolean(image))
    : []
}

interface RefundApplicationHistoryProps {
  records: RefundHistoryRecord[]
  currentRefundId: string
  formatTime: (value: string) => string
}

export default function RefundApplicationHistory({
  records,
  currentRefundId,
  formatTime,
}: RefundApplicationHistoryProps) {
  const { previousRecords } = buildRefundAttemptView(records, currentRefundId)
  if (previousRecords.length === 0) return null

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">
        历史申请记录（共{previousRecords.length}次）
      </summary>
      <div className="space-y-3 border-t border-gray-200 p-4">
        {previousRecords.map(record => {
          const images = parseImages(record.images)
          return (
            <section key={record.id} className="rounded-lg bg-white p-3 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <strong>第{record.attemptNumber}次申请</strong>
                <span className="text-xs text-gray-500">{formatTime(record.createdAt)}</span>
              </div>
              <p className="mt-2"><span className="text-gray-500">状态：</span>{STATUS_LABELS[record.status] || record.status}</p>
              <p><span className="text-gray-500">退款原因：</span>{record.reason}</p>
              {record.description && (
                <p><span className="text-gray-500">补充说明：</span>{record.description}</p>
              )}
              {images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {images.map((image, index) => (
                    <a key={`${record.id}-${image}-${index}`} href={image} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={image}
                        alt={`第${record.attemptNumber}次申请凭证${index + 1}`}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded border border-gray-200 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
              {record.adminComment && (
                <p className="mt-2 rounded bg-gray-50 p-2">
                  <span className="text-gray-500">管理员备注：</span>{record.adminComment}
                </p>
              )}
            </section>
          )
        })}
      </div>
    </details>
  )
}