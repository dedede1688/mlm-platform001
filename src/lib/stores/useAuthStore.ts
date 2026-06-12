import { create } from 'zustand'

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
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
    set({ token })
  },

  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      localStorage.removeItem('user')
    }
    set({ user })
  },

  login: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
    // 触发自定义事件通知其他组件
    window.dispatchEvent(new Event('auth-change'))
  },

  syncFromStorage: () => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    let user: UserInfo | null = null
    if (userStr) {
      try {
        user = JSON.parse(userStr)
      } catch {
        user = null
      }
    }
    set({ token, user })
  },
}))
