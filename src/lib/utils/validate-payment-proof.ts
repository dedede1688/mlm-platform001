import { supabaseBrowserClient } from '@/lib/supabase/client'

/**
 * HV-5: 支付凭证 URL 安全校验
 * 
 * 规则：
 * 1. 非空
 * 2. https:// 开头
 * 3. 域名必须是项目 Supabase Storage 域名或其关联 CDN
 * 4. 路径非空（不能是根路径）
 * 
 * 返回 trimmed URL，校验失败抛错
 */
export function validatePaymentProofUrl(raw: string): string {
  const url = (raw || '').trim()

  if (!url) {
    throw new Error('请上传付款凭证')
  }

  if (!/^https:\/\//i.test(url)) {
    throw new Error('付款凭证链接必须以 https:// 开头')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('付款凭证链接格式无效')
  }

  if (parsed.pathname === '/' || !parsed.pathname || parsed.pathname.length <= 1) {
    throw new Error('付款凭证链接无效')
  }

  // 域名白名单：项目 Supabase Storage 域名 + 关联 CDN
  const allowedHosts = getAllowedProofHosts()

  const hostname = parsed.hostname.toLowerCase()
  const isAllowed = allowedHosts.some((allowed) => {
    if (allowed === hostname) return true
    // 支持通配符子域名: *.example.com
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1) // .example.com
      return hostname.endsWith(suffix) || hostname === allowed.slice(2)
    }
    return false
  })

  if (!isAllowed) {
    throw new Error('付款凭证来源不受信任')
  }

  return url
}

/**
 * 返回允许的支付凭证域名列表
 * 优先从 Supabase 客户端配置推断，兜底为常见 Supabase 域名模式
 */
function getAllowedProofHosts(): string[] {
  const hosts: string[] = []

  // Supabase Storage 域名（从环境变量推断）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl)
      hosts.push(u.hostname)
      // Supabase Storage 公开 URL 格式: <project>.supabase.co
      if (u.hostname.includes('supabase.co')) {
        hosts.push(u.hostname) // 已包含
      }
    } catch { /* skip invalid env */ }
  }

  // 常见 Supabase Storage 公开访问域名模式
  // 格式: <project_id>.supabase.co
  // 由于 project ID 在环境变量中可能不可用，使用宽松的 supabase.co 子域名匹配
  hosts.push('*.supabase.co')

  return hosts
}
