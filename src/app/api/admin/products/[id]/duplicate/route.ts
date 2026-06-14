import { NextRequest, NextResponse } from 'next/server'
import { verifyPermission } from '@/lib/utils/admin-auth'
import { prisma } from '@/lib/prisma'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logOperation } from '@/lib/utils/operation-log'

// POST /api/admin/products/[id]/duplicate — 复制商品
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: admin, error: authError } = await verifyPermission(request, ['super_admin'])
    if (authError || !admin) return authError!

    const { id } = await params

    // 1. 查找原商品
    const originalProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
      },
    })

    if (!originalProduct) {
      return NextResponse.json(
        { success: false, message: '商品不存在' },
        { status: 404 }
      )
    }

    // 2. 复制图片到新 Storage 路径
    let newImageUrl = originalProduct.imageUrl

    if (originalProduct.imageUrl) {
      try {
        const supabase = getSupabaseServerClient()

        // 解析原图 URL 提取路径（格式: bucket/object）
        try {
          const url = new URL(originalProduct.imageUrl)
          const pathname = url.pathname // 如: /storage/v1/object/bucket/path/to/image.jpg
          
          // 提取 bucket 和 object path
          const pathParts = pathname.split('/object/')
          if (pathParts.length === 2) {
            const [, objectPath] = pathParts
            
            // 生成新的文件路径（加时间戳避免冲突）
            const ext = objectPath.split('.').pop() || 'jpg'
            const timestamp = Date.now()
            const random = Math.random().toString(36).substring(2, 8)
            const newObjectPath = objectPath.replace(/[^/]+$/, `${timestamp}-${random}.${ext}`)

            // 提取 bucket 名称
            const bucketMatch = pathParts[0].replace('/storage/v1/bucket/', '')
            
            // 执行复制
            const { data, error } = await supabase.storage
              .from(bucketMatch)
              .copy(objectPath, newObjectPath)

            if (!error && data) {
              // 构建新 URL
              const { data: publicUrlData } = supabase.storage
                .from(bucketMatch)
                .getPublicUrl(newObjectPath)
              
              newImageUrl = publicUrlData.publicUrl
            }
          }
        } catch (e) {
          console.error('[Duplicate] 解析图片 URL 失败:', e)
          // 图片复制失败不阻止复制操作，只是没有图片
        }
      } catch (e) {
        console.error('[Duplicate] Supabase 客户端初始化失败:', e)
      }
    }

    // 3. 创建副本商品
    const newProduct = await prisma.product.create({
      data: {
        name: `${originalProduct.name} - 副本`,
        description: originalProduct.description,
        imageUrl: newImageUrl,
        retailPrice: originalProduct.retailPrice,
        memberPrice: originalProduct.memberPrice,
        stock: 0, // 库存归零
        isUpgradeProduct: false, // 默认不是升级产品
        maxPointsRatio: originalProduct.maxPointsRatio,
        benefits: originalProduct.benefits ? JSON.parse(JSON.stringify(originalProduct.benefits)) : null,
        specs: originalProduct.specs ? JSON.parse(JSON.stringify(originalProduct.specs)) : null,
        research: originalProduct.research,
        images: originalProduct.images ? JSON.parse(JSON.stringify(originalProduct.images)) : null,
        videoUrl: originalProduct.videoUrl,
        status: 'draft', // 默认下架
        sortOrder: originalProduct.sortOrder + 1,
        categoryId: originalProduct.categoryId,
      },
    })

    // 4. 记录操作日志
    await logOperation({
      userId: admin.id,
      action: 'CREATE',
      module: 'product',
      targetId: newProduct.id,
      newValue: { name: newProduct.name, originalId: id },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: newProduct.id,
        name: newProduct.name,
        message: '商品复制成功',
      },
    })
  } catch (error) {
    console.error('复制商品失败:', error)
    return NextResponse.json(
      { success: false, error: '复制商品失败' },
      { status: 500 }
    )
  }
}
