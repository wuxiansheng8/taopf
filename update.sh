#!/bin/bash
set -e

echo "☯===================================================☯"
echo "        Bittensor (TAO) 子网排放监控系统升级程序 (taopf)"
echo "☯===================================================☯"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ 错误: 请使用 sudo 权限运行此脚本 (sudo ./update.sh)"
  exit 1
fi

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
DB_PATH="$PROJECT_DIR/taopf.db"
DB_BACKUP_PATH="$PROJECT_DIR/taopf.db.bak"
SERVICE_FILE="/etc/systemd/system/taopf.service"

get_service_port() {
  local current_port
  current_port=$(systemctl show taopf.service -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^PORT=//p' | head -n 1)
  if [ -z "$current_port" ] && [ -f "$SERVICE_FILE" ]; then
    current_port=$(sed -n 's/^Environment=PORT=//p' "$SERVICE_FILE" | head -n 1)
  fi
  echo "${current_port:-8000}"
}

ensure_service_workdir() {
  local expected_workdir="$PROJECT_DIR/backend"
  local current_workdir
  local service_port

  current_workdir=$(systemctl show taopf.service -p WorkingDirectory --value 2>/dev/null || true)
  if [ "$current_workdir" = "$expected_workdir" ]; then
    return
  fi

  service_port=$(get_service_port)
  echo "⚠️ 检测到 systemd 服务目录不一致，正在自动修正..."
  echo "   当前目录: ${current_workdir:-未设置}"
  echo "   正确目录: $expected_workdir"

  cp "$PROJECT_DIR/systemd/taopf.service" "$SERVICE_FILE"
  sed -i "s|{{PROJECT_DIR}}|$PROJECT_DIR|g" "$SERVICE_FILE"
  sed -i "s|{{PORT}}|$service_port|g" "$SERVICE_FILE"
  systemctl daemon-reload
  echo "✅ systemd 服务目录已修正，端口保持为 $service_port"
}

# 0. Setup failure recovery trap
cleanup_on_error() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "❌ 升级执行失败！状态码: $exit_code. 正在启动容错自愈恢复..."
    if [ -f "$DB_BACKUP_PATH" ] && [ ! -f "$DB_PATH" ]; then
      echo "🔄 正在从备份恢复数据库..."
      cp "$DB_BACKUP_PATH" "$DB_PATH"
    fi
    echo "🔄 正在重新拉起服务以保持可用性..."
    systemctl daemon-reload || true
    systemctl start taopf.service || true
    echo "✅ 容错恢复已完成，旧版服务已复活。"
  fi
}
trap cleanup_on_error EXIT

# 1. Backup DB
if [ -f "$DB_PATH" ]; then
  echo "🔄 正在备份本地数据库..."
  cp "$DB_PATH" "$DB_BACKUP_PATH"
fi

# 2. Stop Service
echo "🔄 正在暂停当前监控服务..."
systemctl stop taopf.service || true

# 3. Pull newest code
if [ -d "$PROJECT_DIR/.git" ]; then
  echo "🔄 检测到 Git 仓库，正在从 Git 仓库拉取最新代码..."
  git fetch --all
  git reset --hard origin/main
else
  # Retrieve update_zip_url from SQLite settings
  ZIP_URL=""
  if [ -f "$DB_BACKUP_PATH" ]; then
    ZIP_URL=$(sqlite3 "$DB_BACKUP_PATH" "SELECT value FROM settings WHERE key='update_zip_url';" 2>/dev/null || true)
  fi

  if [ -z "$ZIP_URL" ]; then
    echo "⚠️ 注意: 当前目录不是 Git 仓库，且数据库中未配置 'update_zip_url'。"
    read -p "👉 请输入升级代码 ZIP 下载 URL (直接回车跳过拉取并使用本地代码): " ZIP_URL
  fi

  if [ -n "$ZIP_URL" ]; then
    echo "🔄 正在从指定地址下载更新代码包: $ZIP_URL"
    TEMP_ZIP="/tmp/taopf_upgrade.zip"
    TEMP_UNPACK="/tmp/taopf_unpack"
    rm -rf "$TEMP_UNPACK" && mkdir -p "$TEMP_UNPACK"
    
    if curl -fsSL "$ZIP_URL" -o "$TEMP_ZIP"; then
      echo "🔄 下载成功，正在解压更新包..."
      unzip -q -o "$TEMP_ZIP" -d "$TEMP_UNPACK"
      
      # ZIP packages from GitHub often contain a nested root folder (e.g., taopf-main/)
      UNPACK_SOURCE=$(find "$TEMP_UNPACK" -mindepth 1 -maxdepth 1 -type d | head -n 1)
      if [ -z "$UNPACK_SOURCE" ]; then
        UNPACK_SOURCE="$TEMP_UNPACK"
      fi
      
      echo "🔄 正在覆盖本地代码..."
      # Exclude DB files and node_modules from overwrite
      rsync -av --exclude='taopf.db*' --exclude='*node_modules*' "$UNPACK_SOURCE/" "$PROJECT_DIR/"
      
      # Clean up
      rm -f "$TEMP_ZIP"
      rm -rf "$TEMP_UNPACK"
      echo "✅ 代码覆盖升级完成！"
    else
      echo "❌ 错误: 下载升级包失败，请检查网络或地址是否正确。"
      # Recovery: roll back DB and restart service before exiting
      if [ -f "$DB_BACKUP_PATH" ] && [ ! -f "$DB_PATH" ]; then
        cp "$DB_BACKUP_PATH" "$DB_PATH"
      fi
      systemctl start taopf.service || true
      exit 1
    fi
  else
    echo "⚠️ 跳过代码下载。请确保最新代码已手动放置在 $PROJECT_DIR 下。"
  fi
fi

# 4. Restore DB
if [ -f "$DB_BACKUP_PATH" ] && [ ! -f "$DB_PATH" ]; then
  echo "🔄 正在恢复本地数据库..."
  cp "$DB_BACKUP_PATH" "$DB_PATH"
fi

# 4.5 Ensure systemd points to this project directory
ensure_service_workdir

# 5. Rebuild Backend
echo "🔄 正在更新并重新编译后端依赖..."
cd "$PROJECT_DIR/backend"
npm install --no-audit --no-fund
npm run build

# 6. Rebuild Frontend
echo "🔄 正在更新并重新编译前端组件..."
cd "$PROJECT_DIR/frontend"
npm install --no-audit --no-fund
npm run build

# 7. Grant execution permissions (Pre-authorization)
echo "🔄 重新设置升级与管理脚本执行权限..."
chmod +x "$PROJECT_DIR/install.sh"
chmod +x "$PROJECT_DIR/update.sh"
chmod +x "$PROJECT_DIR/uninstall.sh"

# 8. Restart Service
echo "🔄 正在重启监控服务..."
systemctl daemon-reload
systemctl start taopf.service

echo "☯===================================================☯"
echo "            🎉 监控系统 taopf 已成功升级并重启！"
echo "☯===================================================☯"
echo "• 状态检查命令: sudo systemctl status taopf"
echo "☯===================================================☯"
