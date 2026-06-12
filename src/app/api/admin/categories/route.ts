import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'

// ---- 类型定义 ----

interface CategoryItem {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/** GET：获取所有分类 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError) return authError

    const categories = await prisma.category.findMany({
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    })

    const items: CategoryItem[] = categories.map(c => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))

    return NextResponse.json<ApiResponse<CategoryItem[]>>({
      success: true,
      data: items,
    })
  } catch (error) {
    console.error('获取分类列表失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '获取分类列表失败' },
      { status: 500 }
    )
  }
}

/** POST：创建分类 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyPermission(request, ['super_admin', 'goods_admin'])
    if (authError) return authError

    const body = await request.json() as {
      name?: string
      parentId?: string | null
      sortOrder?: number
    }

    if (!body.name || !body.name.trim()) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: '分类名称必填' },
        { status: 400 }
      )
    }

    // 如果指定了 parentId，验证父分类是否存在
    if (body.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: body.parentId } })
      if (!parent) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: '父分类不存在' },
          { status: 400 }
        )
      }
    }

    const category = await prisma.category.create({
      data: {
        name: body.name.trim(),
        parentId: body.parentId || null,
        sortOrder: body.sortOrder ?? 0,
      },
    })

    return NextResponse.json<ApiResponse<CategoryItem>>(
      { success: true, data: {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        sortOrder: category.sortOrder,
        createdAt: category.createdAt.toISOString(),
        updatedAt: category.updatedAt.toISOString(),
      } },
      { status: 201 }
    )
  } catch (error) {
    console.error('创建分类失败:', error)
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: '创建分类失败' },
      { status: 500 }
    )
  }
}