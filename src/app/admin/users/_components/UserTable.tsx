"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/utils/format";
import {
  Users,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Network,
  Wallet,
  Lock,
  LockOpen,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getAuthToken } from "@/lib/utils/auth-token";

// ---- 类型定义 ----

export interface UserRow {
  id: string;
  phone: string;
  nickname: string | null;
  level: number;
  balance: number;
  frozenBalance: number;
  consumeBalance: number;
  earningsPending: number;
  earningsAvailable: number;
  earningsFrozen: number;
  earningsVoided: number;
  totalPoints: number;
  unlockedPoints: number;
  lockedPoints: number;
  referrer: { id: string; nickname: string | null; phone: string } | null;
  parentId: string | null;
  position: number | null;
  upgradeProductCount: number;
  directSalesAmount: number;
  directDistributorCount: number;
  directReferralCount: number;
  orderCount: number;
  totalOrderAmount: number;
  status: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  hasPaymentPassword: boolean;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ---- 等级映射 ----

export const LEVEL_NAMES: Record<number, string> = {
  0: "\u6e38\u5ba2",
  1: "\u4f1a\u5458",
  2: "\u7ecf\u9500\u5546",
  3: "\u4e3b\u4efb",
  4: "\u7ecf\u7406",
  5: "\u603b\u76d1",
  6: "\u603b\u88c1",
  7: "\u8463\u4e8b",
};

export const LEVEL_COLORS: Record<number, string> = {
  0: "bg-gray-100 text-gray-500",
  1: "bg-blue-50 text-blue-700",
  2: "bg-green-50 text-green-700",
  3: "bg-yellow-50 text-yellow-700",
  4: "bg-orange-50 text-orange-700",
  5: "bg-purple-50 text-purple-700",
  6: "bg-red-50 text-red-700",
  7: "bg-amber-50 text-amber-800",
};

export const LEVEL_OPTIONS = [
  { value: "", label: "\u5168\u90e8\u7b49\u7ea7" },
  ...Array.from({ length: 8 }, (_, i) => ({
    value: String(i),
    label: `${i} - ${LEVEL_NAMES[i]}`,
  })),
];

// ---- 辅助函数 ----

function formatTime(iso: string): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ---- 组件 Props ----

interface UserTableProps {
  users: UserRow[];
  pagination: Pagination;
  loading: boolean;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  filterLevel: string;
  setFilterLevel: React.Dispatch<React.SetStateAction<string>>;
  filterStatus: string;
  setFilterStatus: React.Dispatch<React.SetStateAction<string>>;
  startDate: string;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  endDate: string;
  setEndDate: React.Dispatch<React.SetStateAction<string>>;
  sortBy: string;
  setSortBy: React.Dispatch<React.SetStateAction<string>>;
  sortOrder: string;
  setSortOrder: React.Dispatch<React.SetStateAction<string>>;
  handleSearch: () => void;
  handlePageChange: (page: number) => void;
  onViewDetail: (userId: string) => void;
  onOpenTree: (userId: string, userName: string) => void;
}

export default function UserTable({
  users,
  pagination,
  loading,
  search,
  setSearch,
  filterLevel,
  setFilterLevel,
  filterStatus,
  setFilterStatus,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  handleSearch,
  handlePageChange,
  onViewDetail,
  onOpenTree,
}: UserTableProps) {
  const handleExportExcel = () => {
    if (users.length === 0) return;
    const data = users.map((u) => ({
      "\u624b\u673a\u53f7": u.phone,
      "\u6635\u79f0": u.nickname || "-",
      "\u63a8\u8350\u4eba": u.referrer
        ? `${u.referrer.nickname || "-"}(${u.referrer.phone.slice(-4)})`
        : "-",
      "\u7b49\u7ea7": LEVEL_NAMES[u.level] || "-",
      "\u72b6\u6001": u.status === "active" ? "\u6b63\u5e38" : "\u51bb\u7ed3",
      "\u4f59\u989d": u.balance,
      "\u51bb\u7ed3\u4f59\u989d": u.frozenBalance,
      "\u6d88\u8d39\u4f59\u989d": u.consumeBalance,
      "\u5f85\u7ed3\u7b97": u.earningsPending,
      "\u53ef\u63d0\u73b0": u.earningsAvailable,
      "\u7d2f\u8ba1\u4f5c\u5e9f": u.earningsVoided,
      "\u603b\u79ef\u5206": u.totalPoints,
      "\u8ba2\u5355\u6570": u.orderCount,
      "\u8ba2\u5355\u603b\u989d": u.totalOrderAmount,
      "\u76f4\u63a8\u4eba\u6570": u.directReferralCount,
      "\u76f4\u63a8\u7ecf\u9500\u5546": u.directDistributorCount,
      "\u6ce8\u518c\u65f6\u95f4": formatTime(u.createdAt),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "\u4f1a\u5458\u5217\u8868");
    XLSX.writeFile(
      wb,
      `\u4f1a\u5458\u5217\u8868_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <>
      {/* 工具栏 */}
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* 搜索框 */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="\u641c\u7d22\u624b\u673a\u53f7\u3001\u6635\u79f0..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              \u641c\u7d22
            </button>
          </div>

          {/* 等级筛选 */}
          <select
            value={filterLevel}
            onChange={(e) => { setFilterLevel(e.target.value); handleSearch() }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* 状态筛选 */}
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); handleSearch() }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">\u5168\u90e8\u72b6\u6001</option>
            <option value="active">\u6b63\u5e38</option>
            <option value="frozen">\u51bb\u7ed3</option>
          </select>

          {/* 日期筛选 */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); handleSearch() }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            title="\u5f00\u59cb\u65e5\u671f"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); handleSearch() }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            title="\u7ed3\u675f\u65e5\u671f"
          />

          {/* 排序 */}
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); handleSearch() }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="createdAt">\u6ce8\u518c\u65f6\u95f4</option>
            <option value="balance">\u4f59\u989d</option>
            <option value="totalPoints">\u603b\u79ef\u5206</option>
            <option value="orderCount">\u8ba2\u5355\u6570</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => { setSortOrder(e.target.value); handleSearch() }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="desc">\u964d\u5e8f</option>
            <option value="asc">\u5347\u5e8f</option>
          </select>

          {/* 导出按钮 */}
          <button
            onClick={handleExportExcel}
            disabled={users.length === 0}
            className="inline-flex items-center gap-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            \u5bfc\u51faExcel
          </button>
        </div>
      </div>

      {/* 会员列表 */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-500">\u52a0\u8f7d\u4e2d...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users className="w-12 h-12 mb-3" />
            <p>\u6682\u65e0\u4f1a\u5458\u6570\u636e</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u624b\u673a\u53f7
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u6635\u79f0
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u63a8\u8350\u4eba
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u7b49\u7ea7
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u72b6\u6001
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u4f59\u989d
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u51bb\u7ed3\u4f59\u989d
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u6d88\u8d39\u4f59\u989d
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u5f85\u7ed3\u7b97
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u53ef\u63d0\u73b0
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u7d2f\u8ba1\u4f5c\u5e9f
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u603b\u79ef\u5206
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u8ba2\u5355\u6570
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u8ba2\u5355\u603b\u989d
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u76f4\u63a8\u4eba\u6570
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u76f4\u63a8\u7ecf\u9500\u5546
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u6ce8\u518c\u65f6\u95f4
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    \u64cd\u4f5c
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900">{u.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {u.nickname || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {u.referrer ? (
                        <span className="text-gray-700">
                          {u.referrer.nickname || "-"}
                          <span className="text-gray-400 text-xs ml-1">
                            ({u.referrer.phone.slice(-4)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "super_admin" ||
                      u.role === "goods_admin" ||
                      u.role === "finance_admin" ||
                      u.role === "support_admin" ||
                      u.role === "auditor" ? (
                        <span className="text-gray-400">-</span>
                      ) : (
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            LEVEL_COLORS[u.level] || "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {LEVEL_NAMES[u.level]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          u.status === "active"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {u.status === "active" ? "\u6b63\u5e38" : "\u51bb\u7ed3"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      \uffe5{u.balance.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 text-right whitespace-nowrap">
                      \uffe5{formatMoney(u.frozenBalance)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-700 text-right whitespace-nowrap">
                      \uffe5{formatMoney(u.consumeBalance)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500 text-right whitespace-nowrap">
                      \uffe5{formatMoney(u.earningsPending)}
                    </td>
                    <td className="px-3 py-3 text-sm text-green-600 text-right whitespace-nowrap">
                      \uffe5{formatMoney(u.earningsAvailable)}
                    </td>
                    <td className="px-3 py-3 text-sm text-red-600 text-right whitespace-nowrap">
                      \uffe5{formatMoney(u.earningsVoided)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {u.totalPoints}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {u.orderCount}\u5355
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      \uffe5{formatMoney(u.totalOrderAmount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {u.directReferralCount}\u4eba
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {u.directDistributorCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatTime(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          onClick={() => onViewDetail(u.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          \u8be6\u60c5
                        </button>
                        <button
                          onClick={() =>
                            onOpenTree(u.id, u.nickname || u.phone.slice(-4))
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors font-medium"
                        >
                          <Network className="w-3.5 h-3.5" />
                          \u63a8\u8350\u6811
                        </button>
                        <Link
                          href={`/admin/users/${u.id}/balance`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors font-medium"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          \u6d41\u6c34
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-xl shadow-lg p-4">
          <span className="text-sm text-gray-500">
            \u5171 {pagination.total} \u6761\uff0c\u7b2c {pagination.page}/
            {pagination.totalPages} \u9875
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              \u4e0a\u4e00\u9875
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              \u4e0b\u4e00\u9875
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
