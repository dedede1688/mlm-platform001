import { create } from 'zustand'
import { getAuthToken, setAuthToken, removeAuthToken, getAuthUser, setAuthUser, removeAuthUser, migrateFromLegacyStorage } from '@/lib/utils/auth-token'

interface UserInfo {
  id?: string
  nickname?: string | null
  phone: string
  level?: number
  role?: string
  unlockedPoints?: number
  balance?: number
}

interface AuthState {
  token: string | null
  user: UserInfo | null
  setToken: (token: string | null) => void
  setUser: (user: UserInfo | null) => void
  login: (token: string, user: UserInfo) => void
  logout: () => void
  syncFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,

  setToken: (token) => {
    if (token) {
      setAuthToken(token)
    } else {
      removeAuthToken()
    }
    set({ token })
  },

  setUser: (user) => {
    if (user) {
      setAuthUser(user as any)
    } else {
      removeAuthUser()
    }
    set({ user })
  },

  login: (token, user) => {
    setAuthToken(token)
    setAuthUser(user as any)
    set({ token, user })
  },

  logout: () => {
    removeAuthToken()
    removeAuthUser()
    set({ token: null, user: null })
    // 触发自定义事件通知其他组件
    window.dispatchEvent(new Event('auth-change'))
  },

  syncFromStorage: () => {
    migrateFromLegacyStorage()
    const token = getAuthToken()
    let user: UserInfo | null = null
    try {
      user = getAuthUser() as UserInfo | null
    } catch {
      user = null
    }
    set({ token, user })
  },
}))
