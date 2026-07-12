// src/lib/api-response.ts
import { NextResponse } from 'next/server'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
}

export function successResponse<T>(data: T, message?: string): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    ...(message && { message }),
  })
}

export function errorResponse(
  error: string,
  status: number = 400,
  options?: { code?: string; data?: unknown }
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(options?.code && { code: options.code }),
      ...(options?.data !== undefined && { data: options.data }),
    },
    { status }
  )
}
