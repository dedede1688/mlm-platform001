import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { X, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/utils/format";
import ImageLightbox from "@/components/admin/ImageLightbox";
import RefundApplicationHistory, {
  buildRefundAttemptView,
  type RefundHistoryRecord,
} from "@/components/admin/refunds/RefundApplicationHistory";

const LARGE_REFUND_THRESHOLD = 1000;

interface RefundItem {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  reason: string;
  description: string | null;
  images: unknown;
  status: string;
  adminComment: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; phone: string; nickname: string | null };
  order: { id: string; orderNo: string; payAmount: number };
}

interface Props {
  item: RefundItem;
  token: string;
  canApprove: boolean;
  onClose: () => void;
  onSuccess: () => void;
  formatTime: (iso: string) => string;
  parseImages: (images: unknown) => string[];
  showMessage: (type: "success" | "error", text: string) => void;
}

export default function RefundReviewModal({
  item,
  token,
  canApprove,
  onClose,
  onSuccess,
  formatTime,
  parseImages,
  showMessage,
}: Props) {
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [adminComment, setAdminComment] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [largeRefundConfirm, setLargeRefundConfirm] = useState<{
    item: RefundItem;
    action: "approve" | "reject";
  } | null>(null);

  const [reviewHistory, setReviewHistory] = useState<RefundHistoryRecord[]>([]);
  const [reviewHistoryLoading, setReviewHistoryLoading] = useState(false);
  const [reviewHistoryError, setReviewHistoryError] = useState("");
  const reviewHistoryRequestRef = useRef(0);

  // Auto-fetch history when modal opens
  useEffect(() => {
    void (async () => {
      const requestId = reviewHistoryRequestRef.current + 1;
      reviewHistoryRequestRef.current = requestId;
      setReviewHistoryLoading(true);
      setReviewHistoryError("");
      setReviewHistory([]);
      try {
        const res = await fetch(`/api/orders/${item.orderId}/refund`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.data)) {
          throw new Error(data.error || "历史申请加载失败");
        }
        const records = data.data as RefundHistoryRecord[];
        if (!records.some((record) => record.id === item.id)) {
          throw new Error("历史申请数据不完整");
        }
        if (reviewHistoryRequestRef.current !== requestId) return;
        setReviewHistory(records);
      } catch (error) {
        if (reviewHistoryRequestRef.current !== requestId) return;
        setReviewHistoryError(
          error instanceof Error ? error.message : "历史申请加载失败"
        );
      } finally {
        if (reviewHistoryRequestRef.current === requestId) {
          setReviewHistoryLoading(false);
        }
      }
    })();
  }, [item.id, item.orderId, token]);

  const closeReviewModal = () => {
    reviewHistoryRequestRef.current += 1;
    onClose();
  };

  const retryFetchHistory = () => {
    void (async () => {
      const requestId = reviewHistoryRequestRef.current + 1;
      reviewHistoryRequestRef.current = requestId;
      setReviewHistoryLoading(true);
      setReviewHistoryError("");
      setReviewHistory([]);
      try {
        const res = await fetch(`/api/orders/${item.orderId}/refund`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.data)) {
          throw new Error(data.error || "历史申请加载失败");
        }
        const records = data.data as RefundHistoryRecord[];
        if (!records.some((record) => record.id === item.id)) {
          throw new Error("历史申请数据不完整");
        }
        if (reviewHistoryRequestRef.current !== requestId) return;
        setReviewHistory(records);
      } catch (error) {
        if (reviewHistoryRequestRef.current !== requestId) return;
        setReviewHistoryError(
          error instanceof Error ? error.message : "历史申请加载失败"
        );
      } finally {
        if (reviewHistoryRequestRef.current === requestId) {
          setReviewHistoryLoading(false);
        }
      }
    })();
  };

  const handleReview = async (overrideAction?: "approve" | "reject") => {
    if (reviewHistoryLoading || reviewHistoryError) {
      showMessage("error", "请先成功加载完整历史申请");
      return;
    }
    const action = overrideAction || reviewAction;
    if (action === "reject" && adminComment.trim().length < 5) {
      showMessage("error", "拒绝原因至少填写5个字符");
      return;
    }
    setReviewing(true);
    try {
      const res = await fetch(`/api/admin/refunds/${item.id}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          adminComment: adminComment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMessage(
          "success",
          action === "approve" ? "退款申请已通过" : "退款申请已拒绝"
        );
        closeReviewModal();
        onSuccess();
      } else {
        showMessage("error", data.message || "操作失败");
      }
    } catch {
      showMessage("error", "网络错误，请重试");
    } finally {
      setReviewing(false);
    }
  };

  const attemptView = buildRefundAttemptView(reviewHistory, item.id);
  const rejectionReasonInvalid =
    reviewAction === "reject" && adminComment.trim().length < 5;
  const reviewUnavailable = reviewHistoryLoading || Boolean(reviewHistoryError);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* 弹窗头部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
            <h3 className="text-lg font-semibold text-gray-900">退款审核</h3>
            <button
              onClick={closeReviewModal}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 弹窗内容 */}
          <div className="px-6 py-4 space-y-3">
            {/* 申请次序 */}
            <div className="text-sm text-gray-500">
              第 {attemptView.currentAttemptNumber} 次申请
            </div>

            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">订单号：</span>
                <span className="text-gray-900 font-mono">
                  {item.order?.orderNo}
                </span>
              </div>
              <div>
                <span className="text-gray-500">退款金额：</span>
                <span className="text-orange-600 font-medium">
                  ¥{formatMoney(item.amount)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">用户：</span>
                <span className="text-gray-900">
                  {item.user?.nickname || "-"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">手机号：</span>
                <span className="text-gray-900">{item.user?.phone}</span>
              </div>
            </div>

            {/* 退款原因 */}
            <div className="text-sm">
              <span className="text-gray-500">退款原因：</span>
              <span className="text-gray-900">{item.reason}</span>
            </div>
            {item.description && (
              <div className="text-sm">
                <span className="text-gray-500">补充说明：</span>
                <span className="text-gray-700">{item.description}</span>
              </div>
            )}

            {/* 凭证图片 */}
            {parseImages(item.images).length > 0 && (
              <div className="text-sm">
                <span className="text-gray-500 block mb-2">
                  凭证图片（点击放大）：
                </span>
                <div className="flex flex-wrap gap-2">
                  {parseImages(item.images).map((img, idx) => (
                    <ImageLightbox key={idx} src={img}>
                      <div className="relative w-20 h-20">
                        <Image
                          src={img}
                          alt=""
                          fill
                          className="object-cover rounded-lg border border-gray-200 hover:border-blue-400 transition-colors"
                        />
                      </div>
                    </ImageLightbox>
                  ))}
                </div>
              </div>
            )}

            {/* 历史申请加载 */}
            {reviewHistoryLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在加载历史申请
              </div>
            )}
            {reviewHistoryError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{reviewHistoryError}</p>
                <button
                  type="button"
                  onClick={retryFetchHistory}
                  className="mt-1 underline"
                >
                  重新获取
                </button>
              </div>
            )}
            {!reviewHistoryLoading && !reviewHistoryError && (
              <RefundApplicationHistory
                records={reviewHistory}
                currentRefundId={item.id}
                formatTime={formatTime}
              />
            )}

            {/* 管理员备注/拒绝原因 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {reviewAction === "reject"
                  ? "拒绝原因（至少5个字符）"
                  : "管理员备注（可选）"}
              </label>
              <textarea
                value={adminComment}
                onChange={(e) => setAdminComment(e.target.value)}
                rows={3}
                placeholder={
                  reviewAction === "reject"
                    ? "填写拒绝原因（至少5个字符）..."
                    : "填写审核备注（可选）..."
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  text-sm text-gray-900 placeholder-gray-400 resize-none"
              />
              {rejectionReasonInvalid && adminComment.length > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  拒绝原因至少填写5个字符
                </p>
              )}
            </div>
          </div>

          {/* 弹窗底部按钮 */}
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
            <button
              onClick={closeReviewModal}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700
                hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (reviewAction === "reject") {
                  void handleReview("reject");
                  return;
                }
                setReviewAction("reject");
              }}
              disabled={
                reviewing ||
                (reviewAction === "reject" && adminComment.trim().length < 5)
              }
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                reviewAction === "reject"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-red-50 text-red-600 hover:bg-red-100"
              }`}
            >
              {reviewAction === "reject" ? "确认拒绝" : "拒绝"}
            </button>
            <button
              onClick={async () => {
                if (item.amount >= LARGE_REFUND_THRESHOLD) {
                  setLargeRefundConfirm({ item, action: "approve" });
                  return;
                }
                await handleReview("approve");
              }}
              disabled={reviewing || reviewUnavailable}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                bg-blue-600 text-white hover:bg-blue-700"
            >
              {reviewing ? "处理中..." : "同意"}
            </button>
          </div>
        </div>
      </div>

      {/* 大额退款二次确认 */}
      {largeRefundConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                大额退款确认
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                退款金额{" "}
                <span className="text-orange-600 font-semibold">
                  ¥{formatMoney(item.amount)}
                </span>{" "}
                超过 ¥{LARGE_REFUND_THRESHOLD}，请确认无误后再操作。
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setLargeRefundConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setLargeRefundConfirm(null);
                  await handleReview("approve");
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700"
              >
                确认通过
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}