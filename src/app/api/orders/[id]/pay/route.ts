import { NextResponse } from 'next/server'

// POST /api/orders/[id]/pay — 已废弃，返回 410 Gone
// 新接口：POST /api/orders/[id]/verify-payment（需支付密码）
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: '此接口已废弃，请使用 /api/orders/[id]/verify-payment',
    },
    { status: 410 }
  )
}
