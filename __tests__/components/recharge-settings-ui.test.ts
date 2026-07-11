import fs from 'node:fs'
import path from 'node:path'

/**
 * 充值设置第二包界面契约测试
 *
 * 锁定：
 * 1. 后台财务页接入独立充值设置组件并增加第四个标签页
 * 2. 后台充值审核删除支付方式筛选并兼容二维码历史显示
 * 3. 用户端不再选择或提交支付方式
 * 4. 用户端停用时隐藏申请表单但保留充值记录
 * 5. 两个独立组件包含二维码上传、查看和保存入口
 *
 * 通过"读取源码"方式锁定关键字符串 / 标识符，业务逻辑由运行时测试覆盖。
 */

const read = (file: string) =>
  fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

describe('充值设置第二包界面契约', () => {
  it('后台财务页接入独立充值设置组件并增加第四个标签页', () => {
    const source = read('src/app/admin/finance/page.tsx')

    // 1. 导入独立组件
    expect(source).toContain(
      "import RechargeSettingsPanel from '@/components/admin/RechargeSettingsPanel'"
    )

    // 2. activeTab 增加 'settings' 标签
    expect(source).toContain("'settings'")

    // 3. 标签按钮文案"充值设置"
    expect(source).toContain('充值设置')

    // 4. 渲染独立组件
    expect(source).toContain('<RechargeSettingsPanel')
  })

  it('后台充值审核删除支付方式筛选并兼容二维码历史显示', () => {
    const source = read('src/app/admin/finance/page.tsx')

    // 1. 删除 paymentMethod 筛选状态
    expect(source).not.toContain('rechargePaymentMethod')

    // 2. 删除 paymentMethod 筛选下拉框常量
    expect(source).not.toContain('RECHARGE_PAYMENT_METHOD_OPTIONS')

    // 3. 中文映射必须包含 qr_code
    expect(source).toContain("qr_code: '二维码扫码充值'")
  })

  it('用户端不再选择或提交支付方式', () => {
    const source = read('src/app/dashboard/recharge/page.tsx')

    // 1. 不再有 setPaymentMethod 调用
    expect(source).not.toContain('setPaymentMethod')

    // 2. 不再有"请选择支付方式"提示
    expect(source).not.toContain('请选择支付方式')

    // 3. 提交请求体不再包含 paymentMethod 字段
    expect(source).not.toContain('paymentMethod,')

    // 4. 中文映射必须包含 qr_code
    expect(source).toContain("qr_code: '二维码扫码充值'")
  })

  it('用户端停用时隐藏申请表单但保留充值记录', () => {
    const source = read('src/app/dashboard/recharge/page.tsx')

    // 1. 停用提示文案
    expect(source).toContain('充值服务暂时关闭，请联系客服')

    // 2. 充值记录区块保留
    expect(source).toContain('充值记录')

    // 3. 启用状态判断字段
    expect(source).toContain('settings?.enabled')
  })

  it('两个独立组件包含二维码上传、查看和保存入口', () => {
    const admin = read('src/components/admin/RechargeSettingsPanel.tsx')
    const user = read('src/components/recharge/RechargeQrPanel.tsx')

    // 后台组件：调用接口、复用图片上传、复用凭证弹窗
    expect(admin).toContain('/api/admin/recharge-settings')
    expect(admin).toContain('ImageUpload')
    expect(admin).toContain('ProofViewerModal')

    // 用户组件：查看大图 + 保存二维码入口
    expect(user).toContain('查看大图')
    expect(user).toContain('保存二维码')
  })
})
