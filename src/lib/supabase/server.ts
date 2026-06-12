import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Supabase 服务端客户端（使用 service_role key，拥有完全权限）
 * 仅在服务端 API 路由中使用，用于删除 Storage 中的文件等管理操作
 */
export function getSupabaseServerClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 服务端环境变量未配置（NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY）')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}