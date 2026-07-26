'use client'

import { X, Network, Lock, LockOpen, AlertTriangle, Wallet } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import Section from './Section'

const LEVEL_NAMES: Record<number, string> = {
  0: '游客', 1: '会员', 2: '经销商', 3: '主任',
  4: '经理', 5: '总监', 6: '总裁', 7: '董事',
}

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-gray-100 text-gray-500',
  1: 'bg-blue-50 text-blue-700',
  2: 'bg-green-50 text-green-700',
  3: 'bg-yellow-50 text-yellow-700',
  4: 'bg-orange-50 text-orange-700',
  5: 'bg-purple-50 text-purple-700',
  6: 'bg-red-50 text-red-700',
  7: 'bg-amber-50 text-amber-800',
}

const DETAIL_TABS = [
  { key: 'basic', label: '基本资料' },
  { key: 'finance', label: '资金账户' },
  { key: 'stats', label: '经营统计' },
  { key: 'relation', label: '推荐关系' },
  { key: 'referrals', label: '直推列表' },
] as const

export default function UserDetailModal({
  detailUser, detailTab, setDetailTab, closeDetailModal,
  openSections, toggleSection,
  newLevel, setNewLevel, savingLevel, handleUpdateLevel,
  balanceType, setBalanceType, balanceAmount, setBalanceAmount,
  balanceReason, setBalanceReason, savingBalance, handleAdjustBalance,
  pointsType, setPointsType, pointsAmount, setPointsAmount,
  pointsReason, setPointsReason, savingPoints, handleAdjustPoints,
  profilePhone, setProfilePhone, profileNickname, setProfileNickname,
  profileEmail, setProfileEmail, profileRole, setProfileRole,
  profileReason, setProfileReason, savingProfile, handleUpdateProfile,
  resetPassword, setResetPassword, passwordReason, setPasswordReason,
  savingPassword, handleResetPassword,
  newStatus, setNewStatus, statusReason, setStatusReason,
  savingStatus, handleChangeStatus,
  payPwdResetReason, setPayPwdResetReason, payPwdResetSuffix, setPayPwdResetSuffix,
  savingPayPwdReset, handleResetPaymentPassword,
  actualPhoneSuffix, normalizedSuffix, suffixMatches,
  userRole, canUpdate, canApprove,
  LARGE_BALANCE_THRESHOLD, LARGE_POINTS_THRESHOLD,
  showMessage, formatTime, setTreeUserId, setTreeUserName,
}: any) {
  return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/50" onClick={closeDetailModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            {/* 标题 + 标签页 */}
            <div className="sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">会员详情</h2>
                <button onClick={closeDetailModal} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              {/* 标签页导航 */}
              <div className="px-6 border-b border-gray-200">
                <div className="flex gap-1 overflow-x-auto">
                  {DETAIL_TABS.map(tab => (
                    <button key={tab.key} onClick={() => setDetailTab(tab.key)}
                      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${detailTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* === 基本资料 === */}
              {detailTab === 'basic' && (
                <>
              {/* 基本信息 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><span className="text-xs text-gray-400">手机号</span><p className="text-sm text-gray-900 font-medium">{detailUser.phone}</p></div>
                <div><span className="text-xs text-gray-400">昵称</span><p className="text-sm text-gray-900">{detailUser.nickname || '-'}</p></div>
                <div><span className="text-xs text-gray-400">等级</span><p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[detailUser.level]}`}>{LEVEL_NAMES[detailUser.level]}</span></p></div>
                <div><span className="text-xs text-gray-400">状态</span><p className="text-sm text-gray-900">{detailUser.status === 'active' ? '正常' : detailUser.status}</p></div>
                <div><span className="text-xs text-gray-400">总积分</span><p className="text-sm text-gray-900">{detailUser.totalPoints}</p></div>
                <div><span className="text-xs text-gray-400">可用/锁定</span><p className="text-sm text-gray-900">{detailUser.unlockedPoints} / {detailUser.lockedPoints}</p></div>
              </div>

              {/* 等级调整 */}
              <Section title="等级调整" open={openSections.level} onToggle={() => toggleSection('level')}>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-400">当前等级</span>
                    <p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[detailUser.level]}`}>{detailUser.level} - {LEVEL_NAMES[detailUser.level]}</span></p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">调整至</label>
                      <select value={newLevel} onChange={e => setNewLevel(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        {Array.from({ length: 8 }, (_, i) => (
                          <option key={i} value={i}>{i} - {LEVEL_NAMES[i]}</option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => {
                      if (!canUpdate) { showMessage('error', '你没有修改权限,请联系超级管理员'); return }
                      handleUpdateLevel()
                    }} disabled={savingLevel || newLevel === detailUser.level || !canUpdate}
                      title={!canUpdate ? '无修改权限' : '调整用户等级'}
                      className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingLevel || newLevel === detailUser.level || !canUpdate ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                      {savingLevel ? '保存中...' : '确认调整'}
                    </button>
                  </div>
                </div>
              </Section>

              {/* 积分调整 */}
              <Section title="积分调整" open={openSections.points} onToggle={() => toggleSection('points')}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">调整字段</label>
                      <select value={pointsType} onChange={e => setPointsType(e.target.value as 'totalPoints' | 'unlockedPoints' | 'lockedPoints')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="totalPoints">总积分</option>
                        <option value="unlockedPoints">可用积分</option>
                        <option value="lockedPoints">锁定积分</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">当前值</label>
                      <p className="text-sm font-medium text-gray-900 py-2">
                        {pointsType === 'totalPoints' ? detailUser.totalPoints :
                         pointsType === 'unlockedPoints' ? detailUser.unlockedPoints : detailUser.lockedPoints}
                      </p>
                      <p className="text-xs text-gray-400">总积分 {detailUser.totalPoints} = 可用 {detailUser.unlockedPoints} + 锁定 {detailUser.lockedPoints}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">调整数量（正数=增加，负数=扣减）</label>
                    <input type="number" value={pointsAmount} onChange={e => setPointsAmount(e.target.value)}
                      placeholder="例如：100 或 -50"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">调整原因（至少 5 字）</label>
                    <textarea value={pointsReason} onChange={e => setPointsReason(e.target.value)} rows={2}
                      placeholder="请输入调整原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleAdjustPoints} disabled={savingPoints || !pointsAmount || pointsReason.trim().length < 5 || !canApprove}
                    title={!canApprove ? '无审批权限' : '积分调整'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPoints || !pointsAmount || pointsReason.trim().length < 5 || !canApprove ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 shadow-sm'}`}>
                    {savingPoints ? '处理中...' : '确认调整'}
                  </button>
                </div>
              </Section>

              {/* 基础资料修改 */}
              <Section title="基础资料修改" open={openSections.profile} onToggle={() => toggleSection('profile')}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">手机号</label>
                      <input type="text" value={profilePhone} onChange={e => setProfilePhone(e.target.value)}
                        placeholder={detailUser.phone}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">昵称</label>
                      <input type="text" value={profileNickname} onChange={e => setProfileNickname(e.target.value)}
                        placeholder={detailUser.nickname || '未设置'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">邮箱</label>
                      <input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)}
                        placeholder={detailUser.email || '未设置'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">角色</label>
                      <select value={profileRole} onChange={e => setProfileRole(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="">不修改</option>
                        <option value="user" selected={detailUser.role === 'user'}>普通用户</option>
                        <option value="auditor" selected={detailUser.role === 'auditor'}>审计员</option>
                        <option value="support_admin" selected={detailUser.role === 'support_admin'}>客服管理员</option>
                        <option value="goods_admin" selected={detailUser.role === 'goods_admin'}>商品管理员</option>
                        <option value="finance_admin" selected={detailUser.role === 'finance_admin'}>财务管理员</option>
                        <option value="super_admin" selected={detailUser.role === 'super_admin'}>超级管理员</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      修改原因{((profilePhone && profilePhone !== detailUser.phone) || profileRole) ? '（必填，≥5字）' : '（选填）'}
                    </label>
                    <textarea value={profileReason} onChange={e => setProfileReason(e.target.value)} rows={2}
                      placeholder="请输入修改原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={() => {
                    if (!canUpdate) { showMessage('error', '你没有修改权限,请联系超级管理员'); return }
                    handleUpdateProfile()
                  }} disabled={savingProfile || !canUpdate}
                    title={!canUpdate ? '无修改权限' : '保存资料修改'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingProfile || !canUpdate ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                    {savingProfile ? '保存中...' : '确认修改'}
                  </button>
                </div>
              </Section>

              {/* 状态管理 */}
              <Section title="状态管理" open={openSections.status} onToggle={() => toggleSection('status')}>
                <div className="space-y-4">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-xs text-gray-400">当前状态</span>
                      <p><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${detailUser.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {detailUser.status === 'active' ? '正常' : detailUser.status === 'frozen' ? '已冻结' : detailUser.status}
                      </span></p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">切换至</label>
                      <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                        <option value="">请选择</option>
                        <option value="active" disabled={detailUser.status === 'active'}>正常（解封）</option>
                        <option value="frozen" disabled={detailUser.status === 'frozen'}>冻结</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">变更原因（至少 5 字）</label>
                    <textarea value={statusReason} onChange={e => setStatusReason(e.target.value)} rows={2}
                      placeholder="请输入变更原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleChangeStatus} disabled={savingStatus || !newStatus || statusReason.trim().length < 5 || !canUpdate}
                    title={!canUpdate ? '无修改权限' : '变更用户状态'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingStatus || !newStatus || statusReason.trim().length < 5 || !canUpdate ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 shadow-sm'}`}>
                    {savingStatus ? '处理中...' : '确认变更'}
                  </button>
                </div>
              </Section>

              {/* 密码重置 */}
              <Section title="密码重置" open={openSections.password} onToggle={() => toggleSection('password')}>
                <div className="space-y-4">
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-700"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 重置后用户需使用新密码登录，请务必通知用户。</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">新密码（8-20 位，必须包含字母和数字）</label>
                    <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                      placeholder="请输入新密码"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">重置原因（至少 5 字）</label>
                    <textarea value={passwordReason} onChange={e => setPasswordReason(e.target.value)} rows={2}
                      placeholder="请输入重置原因..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                  </div>
                  <button onClick={handleResetPassword} disabled={savingPassword || !resetPassword || passwordReason.trim().length < 5 || !canApprove}
                    title={!canApprove ? '无审批权限' : '重置用户密码'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPassword || !resetPassword || passwordReason.trim().length < 5 ? 'bg-orange-400 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 shadow-sm'}`}>
                    {savingPassword ? '处理中...' : '确认重置密码'}
                  </button>
                </div>
              </Section>
                </>
              )}

              {/* === 资金账户 === */}
              {detailTab === 'finance' && (
                <>
                  {/* 余额账户 */}
                  <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wallet className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold text-gray-900">余额账户</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <span className="text-xs text-gray-400">余额</span>
                        <p className="text-sm font-medium text-gray-900">¥{detailUser.balance.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">冻结余额</span>
                        <p className="text-sm font-medium text-gray-700">¥{detailUser.frozenBalance.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">消费余额</span>
                        <p className="text-sm font-medium text-gray-700">¥{formatMoney(detailUser.consumeBalance ?? 0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* 收益账户 */}
                  <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wallet className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-semibold text-gray-900">收益账户</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <span className="text-xs text-gray-400">可用收益</span>
                        <p className="text-sm font-medium text-green-600">¥{formatMoney(detailUser.earningsAvailable ?? 0)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">冻结收益</span>
                        <p className="text-sm font-medium text-gray-700">¥{formatMoney(detailUser.earningsFrozen ?? 0)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">待结算收益</span>
                        <p className="text-sm font-medium text-gray-700">¥{formatMoney(detailUser.earningsPending ?? 0)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-400">作废收益</span>
                        <p className="text-sm font-medium text-red-600">¥{formatMoney(detailUser.earningsVoided ?? 0)}</p>
                      </div>
                    </div>
                  </div>

                  {/* 资金调整 */}
                  <Section title="资金调整" open={openSections.balance} onToggle={() => toggleSection('balance')}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">调整字段</label>
                          <select value={balanceType} onChange={e => setBalanceType(e.target.value as 'balance' | 'frozenBalance' | 'earnings_add' | 'earnings_void')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors">
                            <option value="balance">余额</option>
                            <option value="frozenBalance">冻结余额</option>
                            <option value="earnings_add">可用收益（增加）</option>
                            <option value="earnings_void">作废收益</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">当前{balanceType === 'balance' ? '余额' : balanceType === 'frozenBalance' ? '冻结余额' : balanceType === 'earnings_void' ? '可用收益' : '可用收益'}</label>
                          <p className="text-sm font-medium text-gray-900 py-2">¥{(balanceType === 'balance' ? detailUser.balance : balanceType === 'frozenBalance' ? detailUser.frozenBalance : (detailUser.earningsAvailable ?? 0)).toFixed(2)}</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">{balanceType === 'earnings_add' ? '增加金额（只允许正数）' : balanceType === 'earnings_void' ? '作废金额（只允许正数）' : '调整金额（正数=增加，负数=扣减）'}</label>
                        <input type="number" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)}
                          placeholder={balanceType === 'earnings_add' ? '例如：100' : balanceType === 'earnings_void' ? '例如：40' : '例如：100 或 -50'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors" />
                        {balanceType === 'earnings_add' && (
                          <p className="text-xs text-orange-600 mt-1"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 本次只允许增加可用收益，不可减少或作废。</p>
                        )}
                        {balanceType === 'earnings_void' && (
                          <p className="text-xs text-red-600 mt-1"><AlertTriangle className="w-4 h-4 text-amber-500 inline" /> 作废收益将从可用收益中扣除并计入累计作废，不可逆操作。</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">调整原因（至少 5 字）</label>
                        <textarea value={balanceReason} onChange={e => setBalanceReason(e.target.value)} rows={2}
                          placeholder="请输入调整原因..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                      </div>
                      <button onClick={handleAdjustBalance} disabled={savingBalance || !balanceAmount || balanceReason.trim().length < 5 || !canApprove}
                        title={!canApprove ? '无审批权限' : '余额调整'}
                        className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingBalance || !balanceAmount || balanceReason.trim().length < 5 || !canApprove ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'}`}>
                        {savingBalance ? '处理中...' : '确认调整'}
                      </button>
                    </div>
                  </Section>

                  {/* v018: 支付安全区域 */}
                  <Section title="支付安全" open={openSections.paymentPassword} onToggle={() => toggleSection('paymentPassword')}>
                    <div className="space-y-4">
                      <div className="flex items-center gap-6">
                        <div>
                          <span className="text-xs text-gray-400">支付密码状态</span>
                          <p>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${detailUser.hasPaymentPassword ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {detailUser.hasPaymentPassword ? '已设置' : '未设置'}
                            </span>
                          </p>
                        </div>
                      </div>
                      {detailUser.hasPaymentPassword && (
                        <>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">重置原因（至少 5 字）</label>
                            <textarea value={payPwdResetReason} onChange={e => setPayPwdResetReason(e.target.value)} rows={2}
                              placeholder="请输入重置原因..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors resize-none" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">手机号后 4 位（校验用）</label>
                            <input type="text" value={payPwdResetSuffix} onChange={e => setPayPwdResetSuffix(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder={detailUser.phone ? `用户手机号后 4 位: ${detailUser.phone.slice(-4)}` : '请输入 4 位数字'}
                              maxLength={4}
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-gray-400 transition-colors ${normalizedSuffix.length === 4 && normalizedSuffix !== actualPhoneSuffix ? 'border-red-400' : 'border-gray-300'}`} />
                            {normalizedSuffix.length === 4 && normalizedSuffix !== actualPhoneSuffix && (
                              <p className="mt-1 text-xs text-red-500">手机号后 4 位不匹配，请核对后重试</p>
                            )}
                          </div>
                          {userRole === 'super_admin' ? (
                            <button onClick={handleResetPaymentPassword} disabled={savingPayPwdReset || !payPwdResetReason.trim() || payPwdResetReason.trim().length < 5 || !suffixMatches}
                              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${savingPayPwdReset || !payPwdResetReason.trim() || payPwdResetReason.trim().length < 5 || !suffixMatches ? 'bg-red-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 shadow-sm'}`}>
                              {savingPayPwdReset ? '处理中...' : '重置支付密码'}
                            </button>
                          ) : (
                            <p className="text-xs text-gray-400">✓ 支付密码状态可查看，仅超级管理员可执行重置操作</p>
                          )}
                        </>
                      )}
                      {!detailUser.hasPaymentPassword && (
                        <p className="text-xs text-gray-400">用户未设置支付密码，无需重置。</p>
                      )}
                    </div>
                  </Section>
                </>
              )}

              {/* === 经营统计 === */}
              {detailTab === 'stats' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div><span className="text-xs text-gray-400">升级产品累计</span><p className="text-sm font-medium text-gray-900">{detailUser.upgradeProductCount} 件</p></div>
                  <div><span className="text-xs text-gray-400">直推销售额</span><p className="text-sm font-medium text-gray-900">¥{detailUser.directSalesAmount.toFixed(2)}</p></div>
                  <div><span className="text-xs text-gray-400">直推经销商数</span><p className="text-sm font-medium text-gray-900">{detailUser.directDistributorCount}</p></div>
                  <div><span className="text-xs text-gray-400">直推会员数</span><p className="text-sm font-medium text-gray-900">{detailUser.directReferralCount}</p></div>
                  <div><span className="text-xs text-gray-400">订单总数</span><p className="text-sm font-medium text-gray-900">{detailUser.orderCount}</p></div>
                  <div><span className="text-xs text-gray-400">订单总额</span><p className="text-sm font-medium text-gray-900">¥{detailUser.totalOrderAmount.toFixed(2)}</p></div>
                </div>
              )}

              {/* === 推荐关系 === */}
              {detailTab === 'relation' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-400">推荐人（上级）</span>
                      {detailUser.referrer ? (
                        <p className="text-sm text-gray-900">{detailUser.referrer.phone} <span className="text-gray-400">({detailUser.referrer.nickname || '-'})</span>
                          <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[detailUser.referrer.level]}`}>{LEVEL_NAMES[detailUser.referrer.level]}</span>
                        </p>
                      ) : <p className="text-sm text-gray-400">无</p>}
                    </div>
                    <div>
                      <span className="text-xs text-gray-400">安置上级</span>
                      {detailUser.parent ? (
                        <p className="text-sm text-gray-900">{detailUser.parent.phone} <span className="text-gray-400">({detailUser.parent.nickname || '-'})</span>
                          <span className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[detailUser.parent.level]}`}>{LEVEL_NAMES[detailUser.parent.level]}</span>
                        </p>
                      ) : <p className="text-sm text-gray-400">无</p>}
                    </div>
                  </div>

                  <Section title={`安置下级 (${detailUser.children.length})`} open={openSections.children} onToggle={() => toggleSection('children')}>
                    {detailUser.children.length === 0 ? (
                      <p className="text-sm text-gray-400 py-2">暂无安置下级</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        {detailUser.children.map((c: any) => (
                          <div key={c.id} className="p-3 border border-gray-100 rounded-lg bg-gray-50">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-900">{c.phone}</span>
                              {c.position != null && <span className="text-xs text-gray-400">位{c.position}</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">{c.nickname || '-'}</span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[c.level]}`}>{LEVEL_NAMES[c.level]}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>

                  <div className="flex justify-center">
                    <button onClick={() => { setTreeUserId(detailUser.id); setTreeUserName(detailUser.nickname || detailUser.phone.slice(-4)) }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors font-medium text-sm">
                      <Network className="w-4 h-4" />查看推荐关系树
                    </button>
                  </div>
                </>
              )}

              {/* === 直推列表 === */}
              {detailTab === 'referrals' && (
                <>
                  {detailUser.referrals.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">暂无直推会员</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-100">
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">手机号</th>
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">昵称</th>
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">等级</th>
                          <th className="py-2 text-left text-xs font-semibold text-gray-500">注册时间</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {detailUser.referrals.map((r: any) => (
                            <tr key={r.id}>
                              <td className="py-1.5 text-gray-900">{r.phone}</td>
                              <td className="py-1.5 text-gray-700">{r.nickname || '-'}</td>
                              <td className="py-1.5"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[r.level]}`}>{LEVEL_NAMES[r.level]}</span></td>
                              <td className="py-1.5 text-gray-500">{formatTime(r.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 底部 */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-200 flex justify-end rounded-b-2xl">
              <button onClick={closeDetailModal} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">关闭</button>
            </div>
          </div>
        </div>
  )
}
