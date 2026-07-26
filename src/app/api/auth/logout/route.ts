import { successResponse } from '@/lib/api-response'

const COOKIE_NAME = 'auth_token'

export async function POST() {
  const response = successResponse(null)
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  })
  return response
}
