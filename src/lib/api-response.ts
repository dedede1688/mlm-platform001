import { NextResponse } from 'next/server'

interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
}

interface ApiErrorResponse {
  success: false
  error: string
  code?: number
}

export function successResponse<T>(data: T, message?: string, status: number = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    { success: true, data, ...(message ? { message } : {}) },
    { status }
  )
}

export function errorResponse(error: string, code: number = 400): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    { success: false, error, code },
    { status: code }
  )
}