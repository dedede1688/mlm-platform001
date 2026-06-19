/**
 * 全国省市区三级数据访问工具（服务端）
 *
 * 数据源：https://github.com/airyland/china-area-data (WTFPL 协议)
 * 数据文件：src/lib/data/pca-code.json
 *
 * 数据结构：
 * - "86" → { 省code: 省名, ... }          （34 个省级行政单位）
 * - "110000" → { 市code: 市名, ... }      （北京市下的市）
 * - "110100" → { 区code: 区名, ... }      （北京市市辖区下的区）
 *
 * 注意：4 个直辖市（北京/天津/上海/重庆）的"省"下只有"市辖区"一个"市"，
 *      选完"市辖区"后下面的"区"才是用户真正选的区。
 */

import { promises as fs } from 'fs'
import path from 'path'

// 原始数据结构
type RawData = Record<string, Record<string, string>>

// 转换后结构
export interface District {
  code: string
  name: string
}

export interface City {
  code: string
  name: string
  districts: District[]
}

export interface Province {
  code: string
  name: string
  cities: City[]
}

let cache: { provinces: Province[]; rawMap: Map<string, Province> } | null = null

async function loadData(): Promise<{ provinces: Province[]; rawMap: Map<string, Province> }> {
  if (cache) return cache

  const filePath = path.join(process.cwd(), 'src/lib/data/pca-code.json')
  const content = await fs.readFile(filePath, 'utf-8')
  const raw: RawData = JSON.parse(content)

  // 省级
  const provinceMap = raw['86'] || {}
  const provinces: Province[] = []

  for (const [pCode, pName] of Object.entries(provinceMap)) {
    const cityMap = raw[pCode] || {}
    const cities: City[] = []

    for (const [cCode, cName] of Object.entries(cityMap)) {
      const districtMap = raw[cCode] || {}
      const districts: District[] = Object.entries(districtMap).map(([dCode, dName]) => ({
        code: dCode,
        name: dName,
      }))

      cities.push({
        code: cCode,
        name: cName,
        districts,
      })
    }

    provinces.push({
      code: pCode,
      name: pName,
      cities,
    })
  }

  const rawMap = new Map<string, Province>()
  for (const p of provinces) rawMap.set(p.name, p)

  cache = { provinces, rawMap }
  return cache
}

/**
 * 获取所有省份（轻量，省级列表，不带城市/区）
 */
export async function getProvinces(): Promise<Array<{ code: string; name: string }>> {
  const { provinces } = await loadData()
  return provinces.map((p) => ({ code: p.code, name: p.name }))
}

/**
 * 获取指定省份的所有城市
 */
export async function getCities(provinceName: string): Promise<Array<{ code: string; name: string }>> {
  const { rawMap } = await loadData()
  const province = rawMap.get(provinceName)
  if (!province) return []
  return province.cities.map((c) => ({ code: c.code, name: c.name }))
}

/**
 * 获取指定城市的所有区/县
 */
export async function getDistricts(
  provinceName: string,
  cityName: string
): Promise<Array<{ code: string; name: string }>> {
  const { rawMap } = await loadData()
  const province = rawMap.get(provinceName)
  if (!province) return []
  const city = province.cities.find((c) => c.name === cityName)
  if (!city) return []
  return city.districts.map((d) => ({ code: d.code, name: d.name }))
}

/**
 * 获取完整三级数据（用于一次性 GET /api/regions）
 */
export async function getAllRegions(): Promise<Province[]> {
  const { provinces } = await loadData()
  return provinces
}