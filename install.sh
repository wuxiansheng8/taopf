#!/bin/bash
set -e

# Interactive installation script for TAOPF Subnet Monitor on Ubuntu
echo "☯===================================================☯"
echo "        Bittensor (TAO) 子网排放监控系统安装向导 (taopf)"
echo "☯===================================================☯"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ 错误: 请使用 sudo 权限运行此脚本 (sudo ./install.sh)"
  exit 1
fi

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
DB_PATH="$PROJECT_DIR/taopf.db"

# 1. Gather Interactive Configurations
read -p "👉 请输入 Web 运行端口 [默认: 8000]: " WEB_PORT
WEB_PORT=${WEB_PORT:-8000}

read -p "👉 请设置管理员登录账号 [默认: admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

while true; do
  read -s -p "👉 请设置管理员登录密码 (不可为空): " ADMIN_PASS
  echo ""
  if [ -n "$ADMIN_PASS" ]; then
    break
  fi
  echo "⚠️ 密码不能为空，请重新输入。"
done

read -p "👉 请输入 WSS API 地址 [默认: wss://entrypoint-finney.opentensor.ai:443]: " RPC_URL
RPC_URL=${RPC_URL:-"wss://entrypoint-finney.opentensor.ai:443"}

read -p "👉 可选: 请输入 Telegram Bot Token (直接回车跳过): " TG_TOKEN
read -p "👉 可选: 请输入 Telegram Chat ID (直接回车跳过): " TG_CHAT

# 2. Install Node.js and NPM
if ! command -v node &> /dev/null; then
  echo "🔄 正在配置 Node.js 20.x 官方源并进行安装..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    echo "⚠️ 检测到当前 Node.js 版本低于 18，正在升级到 Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
fi

echo "🔄 正在安装 SQLite3、Unzip 和 Rsync 依赖..."
apt-get install -y sqlite3 unzip rsync

# 3. Build Backend
echo "🔄 正在配置并编译后端依赖..."
cd "$PROJECT_DIR/backend"
npm install --no-audit --no-fund
npm run build

# 4. Build Frontend
echo "🔄 正在配置并编译前端界面..."
cd "$PROJECT_DIR/frontend"
npm install --no-audit --no-fund
npm run build

# 5. Initialize SQLite Database
PASS_HASH=$(echo -n "$ADMIN_PASS" | sha256sum | awk '{print $1}')
echo "🔄 正在配置数据库初始化参数..."

# Run DDL to create tables
sqlite3 "$DB_PATH" < "$PROJECT_DIR/backend/src/db/schema.sql"

# Seed Settings
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_username', '$ADMIN_USER');"
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_hash', '$PASS_HASH');"
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('rpc_endpoints', '$RPC_URL');"
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_token', '$TG_TOKEN');"
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_chat_id', '$TG_CHAT');"

# 6. Configure Systemd Service
echo "🔄 正在注册并启动 Systemd 守护服务..."
SERVICE_FILE="/etc/systemd/system/taopf.service"

cp "$PROJECT_DIR/systemd/taopf.service" "$SERVICE_FILE"
sed -i "s|{{PROJECT_DIR}}|$PROJECT_DIR|g" "$SERVICE_FILE"
sed -i "s|{{PORT}}|$WEB_PORT|g" "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable taopf.service
systemctl restart taopf.service

# 7. Setup permissions
chmod +x "$PROJECT_DIR/install.sh"
chmod +x "$PROJECT_DIR/update.sh"
chmod +x "$PROJECT_DIR/uninstall.sh"

echo "☯===================================================☯"
echo "            🎉 恭喜！监控系统 taopf 已成功安装！"
echo "☯===================================================☯"
echo "• 管理员账号: $ADMIN_USER"
echo "• 监控服务端口: $WEB_PORT"
echo "• 数据库路径: $DB_PATH"
echo "• Web 访问地址: http://YOUR_SERVER_IP:$WEB_PORT"
echo "• 状态检查命令: sudo systemctl status taopf"
echo "• 实时日志命令: sudo journalctl -u taopf -f"
echo "☯===================================================☯"
