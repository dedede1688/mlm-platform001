#!/bin/bash

echo "=================================="
echo "多级分销电商平台启动脚本"
echo "=================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误：未安装 Node.js"
    exit 1
fi

echo "Node.js 版本: $(node -v)"
echo ""

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖..."
    npm install
fi

# 检查 Prisma Client
if [ ! -d "node_modules/@prisma/client" ]; then
    echo "正在生成 Prisma Client..."
    npx prisma generate
fi

echo ""
echo "=================================="
echo "启动开发服务器..."
echo "=================================="
echo ""

npm run dev
