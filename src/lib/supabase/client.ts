import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Supabase 浏览器端客户端（用于前端直接上传文件到 Storage）
 * 如果环境变量未配置，值为 null，调用方需做判空处理
 */
export const supabaseBrowserClient: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null

/** 检查 Supabase 客户端是否可用 */
export function isSupabaseAvailable(): boolean {
  return supabaseBrowserClient !== null
}