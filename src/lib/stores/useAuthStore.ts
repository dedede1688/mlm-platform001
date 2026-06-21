import { create } from 'zustand'

interface AuthUser {
  id: string
  phone: string
  nickname?: string
  role?: string
  level?: number
  avatarUrl?: string
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  setUser: (user: AuthUser | null) => void
  setToken: (token: string | null) => void
  logout: () => void
  syncFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    set({ user: null, token: null })
  },

  syncFromStorage: () => {
    if (typeof window === 'undefined') return
    try {
      const token = localStorage.getItem('token')
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null
      set({ token, user })
    } catch {
      set({ token: null, user: null })
    }
  },
}))