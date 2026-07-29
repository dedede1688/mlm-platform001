'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  X, Loader2, PlusCircle, MinusCircle, Lightbulb
} from 'lucide-react'
import ImageUpload from '@/components/ImageUpload'
import RichTextEditor from '@/components/RichTextEditor'
import VideoUpload from '@/components/VideoUpload'

interface SpecGroup {
  name: string
  values: string[]
}

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
}

export interface ProductFormData {
  name: string
  description: string
  images: string[]
  retailPrice: string
  memberPrice: string
  stock: string
  isUpgradeProduct: boolean
  maxPointsRatio: string
  benefits: string[]
  status: string
  sortOrder: string
  categoryId: string
  specs: SpecGroup[]
  research: string
  videoUrl: string
}

interface ProductFormProps {
  editingId: string | null
  formData: ProductFormData
  setFormData: React.Dispatch<React.SetStateAction<ProductFormData>>
  saving: boolean
  categories: CategoryItem[]
  buildCategoryOptions: () => { id: string; name: string; depth: number }[]
  handleSave: () => Promise<void>
  onClose: () => void
}

export default function ProductForm({
  editingId,
  formData,
  setFormData,
  saving,
  categories: _categories,
  buildCategoryOptions,
  handleSave,
  onClose,
}: ProductFormProps) {
  const [newBenefit, setNewBenefit] = useState('')
  const [specInputs, setSpecInputs] = useState<Record<number, string>>({})

  const addImage = (url: string) => {
    if (url.trim() && formData.images.length < 3) {
      setFormData(prev => ({ ...prev, images: [...prev.images, url.trim()] }))
    }
  }

  const removeImage = (idx: number) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))
  }

  const addBenefit = () => {
    const val = newBenefit.trim()
    if (val && !formData.benefits.includes(val)) {
      setFormData(prev => ({ ...prev, benefits: [...prev.benefits, val] }))
      setNewBenefit('')
    }
  }

  const removeBenefit = (idx: number) => {
    setFormData(prev => ({ ...prev, benefits: prev.benefits.filter((_, i) => i !== idx) }))
  }

  const addSpecGroup = () => {
    setFormData(prev => ({ ...prev, specs: [...prev.specs, { name: '', values: [] }] }))
  }

  const removeSpecGroup = (idx: number) => {
    setFormData(prev => ({ ...prev, specs: prev.specs.filter((_, i) => i !== idx) }))
  }

  const updateSpecGroupName = (idx: number, name: string) => {
    setFormData(prev => ({ ...prev, specs: prev.specs.map((s, i) => i === idx ? { ...s, name } : s) }))
  }

  const handleAddSpecValue = (groupIdx: number) => {
    const val = (specInputs[groupIdx] || '').trim()
    if (!val) return
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.map((s, i) =>
        i === groupIdx ? { ...s, values: [...s.values, val] } : s
      ),
    }))
    setSpecInputs(prev => ({ ...prev, [groupIdx]: '' }))
  }

  const removeSpecValue = (groupIdx: number, valueIdx: number) => {
    setFormData(prev => ({
      ...prev,
      specs: prev.specs.map((s, i) =>
        i === groupIdx ? { ...s, values: s.values.filter((_, vi) => vi !== valueIdx) } : s
      ),
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? '编辑商品' : '新增商品'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* 名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              商品名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
              placeholder="请输入商品名称"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">商品描述</label>
            <RichTextEditor
              content={formData.description}
              onChange={html => setFormData(prev => ({ ...prev, description: html }))}
              placeholder="请输入商品描述"
            />
          </div>

          {/* 分类选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">商品分类</label>
            <select
              value={formData.categoryId}
              onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-colors text-gray-900 hover:border-gray-400 bg-white"
            >
              <option value="">-- 未分类 --</option>
              {buildCategoryOptions().map(opt => (
                <option key={opt.id} value={opt.id}>
                  {'\u3000'.repeat(opt.depth)}{opt.name}
                </option>
              ))}
            </select>
          </div>

          {/* 产品主图（最多3张） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              产品主图 <span className="text-xs text-gray-400 font-normal">（最多3张，第一张为封面）</span>
            </label>
            {formData.images.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-3">
                {formData.images.map((img, idx) => (
                  <div key={idx} className="relative group w-full aspect-square">
                    <div className={`absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      idx === 0 ? 'bg-blue-500 text-white' : 'bg-gray-400/80 text-white'
                    }`}>
                      {idx === 0 ? '封面' : `${idx + 1}`}
                    </div>
                    <Image
                      src={img}
                      alt={`产品图 ${idx + 1}`}
                      fill
                      className="rounded-lg object-cover border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {formData.images.length < 3 && (
              <div className="space-y-2">
                <ImageUpload
                  value=""
                  onChange={url => { if (url) addImage(url) }}
                  bucket="products"
                  folder="gallery"
                />
              </div>
            )}
          </div>

          {/* 零售价 / 会员价 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                零售价 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.retailPrice}
                onChange={e => setFormData(prev => ({ ...prev, retailPrice: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
                placeholder="零售价"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                会员价 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.memberPrice}
                onChange={e => setFormData(prev => ({ ...prev, memberPrice: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
                placeholder="会员价"
                min="0"
              />
            </div>
          </div>

          {/* 库存 / 积分抵扣比例 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">库存</label>
              <input
                type="number"
                value={formData.stock}
                onChange={e => setFormData(prev => ({ ...prev, stock: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
                placeholder="0"
                min="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                积分抵扣比例（%）
              </label>
              <input
                type="number"
                value={formData.maxPointsRatio}
                onChange={e => setFormData(prev => ({ ...prev, maxPointsRatio: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
                placeholder="50"
                min="0"
                max="100"
              />
            </div>
          </div>

          {/* 升级产品 / 排序 / 状态 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 pt-2">
              <label className="text-sm font-medium text-gray-700">升级产品</label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isUpgradeProduct}
                  onChange={e => setFormData(prev => ({ ...prev, isUpgradeProduct: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300
                  rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full
                  peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px]
                  after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4
                  after:transition-all peer-checked:bg-blue-600"
                />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">排序</label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={e => setFormData(prev => ({ ...prev, sortOrder: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                  transition-colors text-gray-900 hover:border-gray-400"
                placeholder="0"
                min="0"
              />
            </div>
          </div>

          {/* 状态 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
            <select
              value={formData.status}
              onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                transition-colors text-gray-900 hover:border-gray-400 bg-white"
            >
              <option value="active">上架</option>
              <option value="inactive">下架</option>
            </select>
          </div>

          {/* 产品卖点 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">产品卖点</label>
            <div className="space-y-2">
              {formData.benefits.map((benefit, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm">{benefit}</span>
                  <button
                    type="button"
                    onClick={() => removeBenefit(idx)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <MinusCircle className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBenefit}
                  onChange={e => setNewBenefit(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addBenefit()}
                  placeholder="输入卖点后按回车添加"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg
                    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    transition-colors text-gray-900 placeholder-gray-400 hover:border-gray-400"
                />
                <button
                  type="button"
                  onClick={addBenefit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                    transition-colors font-medium"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          {/* 规格管理 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">规格管理</label>
              <button
                type="button"
                onClick={addSpecGroup}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600
                  rounded-md hover:bg-blue-100 transition-colors font-medium"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                添加规格组
              </button>
            </div>
            <div className="space-y-4">
              {formData.specs.map((spec, gi) => (
                <div key={gi} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="text"
                      value={spec.name}
                      onChange={e => updateSpecGroupName(gi, e.target.value)}
                      placeholder="规格组名称（如：颜色、尺寸）"
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => removeSpecGroup(gi)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {spec.values.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {spec.values.map((val, vi) => (
                        <span key={vi} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50
                          text-blue-700 rounded-full text-xs font-medium">
                          {val}
                          <button
                            type="button"
                            onClick={() => removeSpecValue(gi, vi)}
                            className="hover:text-red-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={specInputs[gi] || ''}
                      onChange={e => setSpecInputs(prev => ({ ...prev, [gi]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddSpecValue(gi) }}
                      placeholder="输入规格值后按回车或点击添加"
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm
                        focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSpecValue(gi)}
                      className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-600
                        rounded-md hover:bg-gray-50 transition-colors font-medium"
                    >
                      添加值
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    <Lightbulb className="w-4 h-4 text-gray-500 inline" /> 提示：输入规格值后按回车键或点击"添加值"按钮
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 科研背书 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">科研背书</label>
            <RichTextEditor
              content={formData.research}
              onChange={html => setFormData(prev => ({ ...prev, research: html }))}
              placeholder="请输入科研背书内容（如科研背景、核心成果、临床试验等）"
            />
          </div>

          {/* 视频上传 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">商品视频</label>
            <VideoUpload
              value={formData.videoUrl}
              onChange={url => setFormData(prev => ({ ...prev, videoUrl: url }))}
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg
              hover:bg-gray-50 transition-colors font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg
              text-white font-medium transition-all ${
                saving
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm'
              }`}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
