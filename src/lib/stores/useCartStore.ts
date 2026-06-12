import { create } from 'zustand'

interface CartItem {
  id: string
  quantity: number
  createdAt: string
  product: {
    id: string
    name: string
    imageUrl: string | null
    retailPrice: number
    memberPrice: number
    stock: number
    status: string
    isUpgradeProduct: boolean
    maxPointsRatio: number | null
  }
}

interface CartState {
  items: CartItem[]
  itemCount: number
  setItems: (items: CartItem[]) => void
  addItem: (item: CartItem) => void
  removeItem: (itemId: string) => void
  clearCart: () => void
  updateItemCount: () => void
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  itemCount: 0,

  setItems: (items) => {
    set({ items, itemCount: items.length })
  },

  addItem: (item) => {
    const items = [...get().items, item]
    set({ items, itemCount: items.length })
  },

  removeItem: (itemId) => {
    const items = get().items.filter(item => item.id !== itemId)
    set({ items, itemCount: items.length })
  },

  clearCart: () => {
    set({ items: [], itemCount: 0 })
  },

  updateItemCount: () => {
    set({ itemCount: get().items.length })
  },
}))
