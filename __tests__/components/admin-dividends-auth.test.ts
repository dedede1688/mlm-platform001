import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/app/admin/dividends/page.tsx'),
  'utf8'
)

describe('后台分红结算页面鉴权', () => {
  it('使用统一 token，并在缺失时跳转到有效登录页', () => {
    expect(source).toContain("getAuthToken()")
    expect(source).not.toContain("localStorage.getItem('adminToken')")
    expect(source).toContain('/login?redirect=')
    expect(source).not.toContain("router.push('/admin/login')")
  })
})
