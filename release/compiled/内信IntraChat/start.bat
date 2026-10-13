@echo off
rem =====================================================
rem  内信 IntraChat - 生产启动（编译后免安装包）
rem  双击本文件即可启动；停止用 Ctrl+C
rem =====================================================
chcp 65001 >nul
cd /d "%~dp0"

if not exist .env (
  copy /y .env.example .env >nul
  echo.
  echo [警告] 已为你生成 .env 配置文件，请先用记事本打开填写：
  echo    DB_USER / DB_PASSWORD  = 你的 MySQL 账号密码
  echo    JWT_SECRET             = 一段随机长字符串
  echo 改完后再双击本文件启动。
  echo.
  pause
  exit /b
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=5000

echo 正在启动内信 IntraChat（生产模式）...
echo 浏览器访问  http://localhost:%PORT%    管理后台  http://localhost:%PORT%/admin
echo 按 Ctrl+C 停止
echo.
node dist-server/server.js
pause