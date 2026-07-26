// src/lib/api-response.ts
import { NextResponse } from "next/server"

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function successResponse<T>(data: T, message?: string, pagination?: ApiResponse["pagination"]): NextResponse<ApiResponse<T>> {
  return NextResponse.json({
    success: true,
    data,
    ...(message && { message }),
    ...(pagination && { pagination }),
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
