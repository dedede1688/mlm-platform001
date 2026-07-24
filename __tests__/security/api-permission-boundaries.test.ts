import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

describe('Batch 2 API permission boundaries', () => {
  it('keeps the public product route read-only', () => {
    const source = read('src/app/api/products/route.ts')

    expect(source).toMatch(/export async function GET\s*\(/)
    expect(source).not.toMatch(/export async function POST\s*\(/)
    expect(source).not.toContain('prisma.product.create')
  })

  it('removes the legacy admin config route', () => {
    expect(existsSync(join(root, 'src/app/api/admin/config/route.ts'))).toBe(false)
  })

  it('keeps system parameters on the canonical super-admin route', () => {
    const source = read('src/app/api/admin/system-config/parameters/route.ts')

    expect(source).toMatch(/export async function GET\s*\(/)
    expect(source).toMatch(/export async function PUT\s*\(/)
    expect(source.match(/verifyPermission\(request, \['super_admin'\]\)/g)).toHaveLength(2)
  })

  it.each([
    '/api/admin/dashboard',
    '/api/admin/roles',
    '/api/admin/role-permissions',
  ])('maps %s in middleware', (prefix) => {
    const source = read('src/middleware.ts')
    expect(source).toContain(`'${prefix}'`)
  })
})