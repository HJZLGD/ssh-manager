#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 SSH 管理面板启动中...${NC}"
echo ""

# 检查端口是否被占用，自动递增
PORT=${PORT:-3000}
while lsof -i :$PORT > /dev/null 2>&1; do
    echo -e "${YELLOW}⚠️  端口 $PORT 已被占用，尝试端口 $((PORT+1))${NC}"
    PORT=$((PORT+1))
done

# 获取本机局域网 IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

echo -e "${GREEN}✅ 服务启动成功！${NC}"
echo ""
echo -e "   ${GREEN}📌 本地访问:${NC}  http://127.0.0.1:${PORT}"
echo -e "   ${GREEN}🌐 局域网访问:${NC} http://${LOCAL_IP}:${PORT}"
echo ""
echo -e "   ${YELLOW}按 Ctrl+C 停止服务${NC}"
echo ""

# 用自带 Node.js 启动
exec ./node/bin/node server.js