import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

function ensureSecret(): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set')
  }
  return JWT_SECRET
}

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
    const decoded = jwt.verify(token, ensureSecret()) as AuthUser

    return decoded
  } catch {
    return null
  }
}

export function generateToken(userId: string, phone: string, role?: string) {
  return jwt.sign(
    { userId, phone, role },
    ensureSecret(),
    { expiresIn: '7d' }
  )
}

export function generateReferralCode(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}
