const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function check() {
  // 1. 查所有 system_config 相关表
  const tables = await p.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE '%config%' OR table_name LIKE '%system%'
    ORDER BY table_name
  `
  console.log('找到的表:', tables)

  // 2. 查 companyAddress 字段
  const columns = await p.$queryRaw`
    SELECT table_name, column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE column_name IN ('company_name', 'company_address', 'site_name')
    ORDER BY table_name, column_name
  `
  console.log('相关字段:')
  columns.forEach(row => {
    console.log(`  ${row.table_name}.${row.column_name}: ${row.data_type}${row.character_maximum_length ? '(' + row.character_maximum_length + ')' : ''}`)
  })
}

check().catch(console.error).finally(() => p.$disconnect())
