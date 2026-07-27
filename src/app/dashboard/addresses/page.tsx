'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Edit2, Trash2, MapPin, Star, Loader2, AlertCircle,
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import { AddressForm, AddressFormData } from '@/components/address/AddressForm'
import { getAuthToken } from '@/lib/utils/auth-token'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

interface Address {
  id: string
  recipientName: string
  phone: string
  province: string
  city: string
  district: string
  detailAddress: string
  isDefault: boolean
  createdAt: string
}

export default function AddressesPage() {
  const router = useRouter()
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)
  const [userPhone, setUserPhone] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null)

  const fetchAddresses = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/user/addresses', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setAddresses(data.data)
      } else {
        toast.error(data.error || '加载地址失败')
      }
    } catch (_err) {
      toast.error('网络错误')
    }
  }, [])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      router.push('/login')
      return
    }
    // 拿到当前用户手机号（用作默认填充）
    fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setUserPhone(data.data.phone || '')
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
      })
    fetchAddresses(token)
  }, [router, fetchAddresses])

  const handleCreate = async (formData: AddressFormData) => {
    const token = getAuthToken()
    if (!token) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/user/addresses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('地址添加成功')
        setCreatingNew(false)
        await fetchAddresses(token)
      } else {
        toast.error(data.error || '添加失败')
      }
    } catch (_err) {
      toast.error('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async (id: string, formData: AddressFormData) => {
    const token = getAuthToken()
    if (!token) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('地址更新成功')
        setEditingId(null)
        await fetchAddresses(token)
      } else {
        toast.error(data.error || '更新失败')
      }
    } catch (_err) {
      toast.error('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleteDialogOpen(id)
  }

  const handleDeleteConfirm = async () => {
    const id = deleteDialogOpen
    if (!id) return
    setDeleteDialogOpen(null)
    const token = getAuthToken()
    if (!token) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success('地址已删除')
        await fetchAddresses(token)
      } else {
        toast.error(data.error || '删除失败')
      }
    } catch (_err) {
      toast.error('网络错误')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    const token = getAuthToken()
    if (!token) return
    setSettingDefaultId(id)
    try {
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('已设为默认地址')
        await fetchAddresses(token)
      } else {
        toast.error(data.error || '设置失败')
      }
    } catch (_err) {
      toast.error('网络错误')
    } finally {
      setSettingDefaultId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            收货地址
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* 新增地址表单 */}
        {creatingNew && (
          <div className="mb-6">
            <AddressForm
              submitting={submitting}
              defaultPhone={userPhone}
              submitText="保存新地址"
              onSubmit={handleCreate}
              onCancel={() => setCreatingNew(false)}
            />
          </div>
        )}

        {/* 编辑地址表单 */}
        {editingId && (
          <div className="mb-6">
            {(() => {
              const editingAddress = addresses.find((a) => a.id === editingId)
              if (!editingAddress) return null
              return (
                <AddressForm
                  submitting={submitting}
                  defaultPhone={userPhone}
                  initial={{
                    recipientName: editingAddress.recipientName,
                    phone: editingAddress.phone,
                    province: editingAddress.province,
                    city: editingAddress.city,
                    district: editingAddress.district,
                    detailAddress: editingAddress.detailAddress,
                    isDefault: editingAddress.isDefault,
                  }}
                  submitText="保存修改"
                  onSubmit={(data) => handleUpdate(editingAddress.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              )
            })()}
          </div>
        )}

        {/* 地址列表 */}
        {!creatingNew && !editingId && (
          <>
            {addresses.length === 0 ? (
              <div className="bg-white rounded-xl shadow-md p-10 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">暂无收货地址</h3>
                <p className="text-sm text-gray-500 mb-5">添加地址后下单更便捷</p>
                <button
                  onClick={() => setCreatingNew(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  新增第一个地址
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {addresses.map((addr) => (
                  <AddressCard
                    key={addr.id}
                    address={addr}
                    onEdit={() => setEditingId(addr.id)}
                    onDelete={() => handleDelete(addr.id)}
                    onSetDefault={() => handleSetDefault(addr.id)}
                    deleting={deletingId === addr.id}
                    settingDefault={settingDefaultId === addr.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={deleteDialogOpen !== null}
        title="删除地址"
        message="确定删除该地址吗？此操作不可恢复。"
        mode="emphasize"
        confirmText="确认删除"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDialogOpen(null)}
      />
    </div>
  )
}

// ---- 单个地址卡片 ----

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  deleting,
  settingDefault,
}: {
  address: Address
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
  deleting: boolean
  settingDefault: boolean
}) {
  return (
    <div
      className={`bg-white rounded-xl shadow-md p-4 sm:p-5 border-2 transition-all ${
        address.isDefault ? 'border-orange-400' : 'border-transparent'
      }`}
    >
      {/* 顶部：姓名 + 电话 + 默认徽章 */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-gray-900 truncate">{address.recipientName}</span>
          <span className="text-sm text-gray-600">{address.phone}</span>
          {address.isDefault && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
              <Star className="w-3 h-3 fill-current" />
              默认
            </span>
          )}
        </div>
      </div>

      {/* 地址 */}
      <p className="text-sm text-gray-700 leading-relaxed mb-4 break-all">
        {address.province} {address.city} {address.district} {address.detailAddress}
      </p>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-3 border-t border-gray-100">
        {!address.isDefault && (
          <button
            onClick={onSetDefault}
            disabled={settingDefault || deleting}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors font-medium min-h-[28px] disabled:opacity-50"
          >
            {settingDefault ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Star className="w-3.5 h-3.5" />
            )}
            设为默认
          </button>
        )}
        <button
          onClick={onEdit}
          disabled={deleting}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-medium min-h-[28px] disabled:opacity-50"
        >
          <Edit2 className="w-3.5 h-3.5" />
          编辑
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium min-h-[28px] disabled:opacity-50"
        >
          {deleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          删除
        </button>
      </div>
    </div>
  )
}