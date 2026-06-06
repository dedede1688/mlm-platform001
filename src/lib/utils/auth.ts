import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  userId: string
  phone: string
  role?: string
}

export async function verifyToken(request: NextRequest): Promise<AuthUser | null> {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return null

    const token = authHeader.replace('Bearer ', '')
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser

    return decoded
  } catch {
    return null
  }
}

export function generateToken(userId: string, phone: string, role?: string) {
  return jwt.sign(
    { userId, phone, role },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )
}
