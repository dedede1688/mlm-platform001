'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Edit2, Trash2, MapPin, Star, Loader2, AlertCircle,
} from 'lucide-react'
import { toast } from '@/components/ToastProvider'
import { AddressForm, AddressFormData } from '@/components/address/AddressForm'

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
    const token = localStorage.getItem('token')
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
    const token = localStorage.getItem('token')
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
    const token = localStorage.getItem('token')
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
    if (!confirm('确定删除该地址吗？此操作不可恢复。')) return
    const token = localStorage.getItem('token')
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
    const token = localStorage.getItem('token')
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

  const editingAddress = editingId ? addresses.find((a) => a.id === editingId) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-4">
            <div className="h-8 w-48 bg-white rounded animate-pulse" />
            <div className="h-32 bg-white rounded-xl animate-pulse" />
            <div className="h-32 bg-white rounded-xl animate-pulse" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 via-white to-gray-50">
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="返回"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">收货地址</h1>
          </div>
          {!creatingNew && !editingId && (
            <button
              onClick={() => setCreatingNew(true)}
              disabled={addresses.length >= 20}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">新增地址</span>
              <span className="sm:hidden">新增</span>
            </button>
          )}
        </div>

        {/* 提示：地址数量上限 */}
        {addresses.length >= 20 && !creatingNew && !editingId && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              已达地址数量上限（20 个），请删除部分地址后再添加
            </p>
          </div>
        )}

        {/* 新增表单 */}
        {creatingNew && (
          <div className="bg-white rounded-xl shadow-md p-5 sm:p-6 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">新增地址</h2>
            <AddressForm
              defaultPhone={userPhone}
              submitting={submitting}
              submitText="保存地址"
              onSubmit={handleCreate}
              onCancel={() => setCreatingNew(false)}
            />
          </div>
        )}

        {/* 编辑表单 */}
        {editingAddress && (
          <div className="bg-white rounded-xl shadow-md p-5 sm:p-6 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">编辑地址</h2>
            <AddressForm
              initial={editingAddress}
              defaultPhone={userPhone}
              submitting={submitting}
              submitText="保存修改"
              onSubmit={(data) => handleUpdate(editingAddress.id, data)}
              onCancel={() => setEditingId(null)}
            />
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