#!/bin/bash
set -e

echo "☯===================================================☯"
echo "        Bittensor (TAO) 子网排放监控系统卸载程序 (taopf)"
echo "☯===================================================☯"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ 错误: 请使用 sudo 权限运行此脚本 (sudo ./uninstall.sh)"
  exit 1
fi

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
DB_PATH="$PROJECT_DIR/taopf.db"

# 1. Stop and Disable Service
echo "🔄 正在停止并禁用 taopf 守护服务..."
systemctl stop taopf.service || true
systemctl disable taopf.service || true

# 2. Delete Systemd Service File
SERVICE_FILE="/etc/systemd/system/taopf.service"
if [ -f "$SERVICE_FILE" ]; then
  echo "🔄 正在删除 Systemd 服务文件..."
  rm -f "$SERVICE_FILE"
fi

systemctl daemon-reload

# 3. Handle Database deletion
read -p "❓ 是否同时删除本地数据库文件 taopf.db？此操作不可逆 [y/N]: " DELETE_DB
DELETE_DB=${DELETE_DB:-"n"}

if [[ "$DELETE_DB" =~ ^[Yy]$ ]]; then
  if [ -f "$DB_PATH" ]; then
    echo "🔄 正在删除数据库文件..."
    rm -f "$DB_PATH"
  fi
  # Clean WAL files if exist
  rm -f "${DB_PATH}-wal" || true
  rm -f "${DB_PATH}-shm" || true
  echo "✅ 数据库文件已彻底清理。"
else
  echo "⚠️ 数据库文件已保留在: $DB_PATH"
fi

echo "☯===================================================☯"
echo "            🎉 监控服务卸载工作已完成！"
echo "☯===================================================☯"
echo "• Systemd 服务已全部停用并清理。"
echo "• 您现在可以放心地使用 'rm -rf $PROJECT_DIR' 删除整个项目文件夹。"
echo "☯===================================================☯"
