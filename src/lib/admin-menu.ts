import { LayoutDashboard, Image, FolderTree, Package, ShoppingCart, Users, DollarSign, Bell, Settings, Receipt, Network, Sliders, FileText, Inbox } from 'lucide-react';

export const MENU_ITEMS = [
  { id: 'dashboard', name: '仪表盘', path: '/admin', icon: LayoutDashboard },
  { id: 'banners', name: '轮播图管理', path: '/admin/banners', icon: Image },
  { id: 'categories', name: '分类管理', path: '/admin/categories', icon: FolderTree },
  { id: 'products', name: '商品管理', path: '/admin/products', icon: Package },
  { id: 'orders', name: '订单管理', path: '/admin/orders', icon: ShoppingCart },
  { id: 'users', name: '会员管理', path: '/admin/users', icon: Users },
  { id: 'referral-tree', name: '推荐关系图', path: '/admin/referral-tree', icon: Network },
  { id: 'refunds', name: '退款管理', path: '/admin/refunds', icon: Receipt },
  { id: 'finance', name: '财务管理', path: '/admin/finance', icon: DollarSign },
  { id: 'withdrawal-templates', name: '拒绝理由模板', path: '/admin/withdrawal-templates', icon: FileText },
  { id: 'notifications', name: '通知模板', path: '/admin/notifications', icon: Bell },
  { id: 'notification-history', name: '通知发件箱', path: '/admin/notification-history', icon: Inbox },
  { id: 'settings', name: '系统设置', path: '/admin/settings', icon: Settings },
  { id: 'system-parameters', name: '系统参数', path: '/admin/settings/system-parameters', icon: Sliders },
];

export const ROLE_MENUS: Record<string, string[]> = {
  // 超级管理员：全部菜单
  super_admin: MENU_ITEMS.map(item => item.id),

  // 商品管理员：商品/订单/分类/轮播图
  goods_admin: [
    'dashboard', 'banners', 'categories', 'products', 'orders'
  ],

  // 财务管理员：财务/提现/退款
  finance_admin: [
    'dashboard', 'finance', 'withdrawal-templates', 'refunds'
  ],

  // 客服管理员：用户/推荐树/通知发件箱
  support_admin: [
    'dashboard', 'users', 'referral-tree', 'notification-history'
  ],

  // 审计员：只看仪表盘和日志（只读）
  auditor: [
    'dashboard', 'logs'
  ],
};