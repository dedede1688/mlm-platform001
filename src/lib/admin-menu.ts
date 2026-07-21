import { LayoutDashboard, Image, FolderTree, Package, ShoppingCart, Users, DollarSign, Bell, Settings, Receipt, Sliders, FileText, Inbox, BarChart3, ScrollText, Shield, Wallet } from 'lucide-react';

// v65: 后台架构升级 - 6 大类 + 改名"数据中台" + 删"推荐关系图"独立菜单
// 6 大类:数据中台(首页) / 商品 / 财务 / 订单 / 会员 / 系统后台
// 后续阶段会把"轮播图/通知/日志"合到"系统后台"下作为子菜单
export const MENU_ITEMS = [
  // 1. 数据中台(首页)
  { id: 'dashboard', name: '数据中台', path: '/admin/dashboard', icon: LayoutDashboard },

  // 2. 商品
  { id: 'products', name: '商品管理', path: '/admin/products', icon: Package },
  { id: 'categories', name: '分类管理', path: '/admin/categories', icon: FolderTree },
  { id: 'banners', name: '轮播图管理', path: '/admin/banners', icon: Image },

  // 3. 财务
  { id: 'finance', name: '财务管理', path: '/admin/finance', icon: DollarSign },
  { id: 'refunds', name: '退款管理', path: '/admin/refunds', icon: Receipt },
  { id: 'dividends', name: '分红结算', path: '/admin/dividends', icon: Wallet },
  { id: 'withdrawal-templates', name: '拒绝理由模板', path: '/admin/withdrawal-templates', icon: FileText },

  // 4. 订单
  { id: 'orders', name: '订单管理', path: '/admin/orders', icon: ShoppingCart },

  // 5. 会员
  { id: 'users', name: '会员管理', path: '/admin/users', icon: Users },

  // 6. 系统后台
  { id: 'settings', name: '系统设置', path: '/admin/settings', icon: Settings },
  { id: 'system-parameters', name: '系统参数', path: '/admin/settings/system-parameters', icon: Sliders },
  { id: 'notifications', name: '通知模板', path: '/admin/notifications', icon: Bell },
  { id: 'notification-history', name: '通知发件箱', path: '/admin/notification-history', icon: Inbox },
  { id: 'logs', name: '操作日志', path: '/admin/logs', icon: ScrollText },

  // 7. 运营报表(归数据中台的高级分析,留独立入口便于深链)
  { id: 'reports', name: '运营报表', path: '/admin/reports', icon: BarChart3 },

  // 8. 角色与权限(v66 新增:super_admin 可视化配置每个角色能看哪些菜单)
  { id: 'roles', name: '角色与权限', path: '/admin/system/roles', icon: Shield },
];

export const ROLE_MENUS: Record<string, string[]> = {
  // 超级管理员:全部菜单
  super_admin: MENU_ITEMS.map(item => item.id),

  // 商品管理员:商品/订单/分类/轮播图 + 数据中台
  goods_admin: [
    'dashboard', 'banners', 'categories', 'products', 'orders', 'reports'
  ],

  // 财务管理员:财务/退款/拒绝模板 + 数据中台
  finance_admin: [
    'dashboard', 'finance', 'withdrawal-templates', 'refunds', 'reports'
  ],

  // 客服管理员:会员/通知发件箱 + 数据中台
  // v65:删 'referral-tree'(独立菜单已砍,功能改用 ReferralTreePanel 弹窗)
  support_admin: [
    'dashboard', 'users', 'notification-history'
  ],

  // 审计员:数据中台 + 日志(只读)
  auditor: [
    'dashboard', 'logs'
  ],
};

// v66:默认角色菜单配置(layout 启动时会从 API 拉 DB 覆盖)
// 这个常量是兜底值,真正生效的是 DB 里 role_menus 这一行
export const DEFAULT_ROLE_MENUS = ROLE_MENUS;