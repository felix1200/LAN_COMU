@echo off
rem =====================================================
rem  内信 IntraChat - 生产启动（编译后免安装包）
rem  双击本文件即可启动；停止用 Ctrl+C
rem =====================================================
chcp 65001 >nul
rem 定位本脚本所在目录（无论从哪个目录运行都指向包根），一律用绝对路径
set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

if not exist "%APP_DIR%.env" (
  copy /y "%APP_DIR%.env.example" "%APP_DIR%.env" >nul
  echo.
  echo [警告] 已为你生成 .env 配置文件，请先用记事本打开填写：
  echo    DB_USER / DB_PASSWORD  = 你的 MySQL 账号密码
  echo    JWT_SECRET             = 一段随机长字符串
  echo 改完后再双击本文件启动。
  echo.
  pause
  exit /b
)

if not exist "%APP_DIR%dist-server\server.js" (
  echo [错误] 未找到 dist-server\server.js，请确认已把本压缩包完整解压后再运行本脚本。
  echo 当前脚本目录：%APP_DIR%
  pause
  exit /b 1
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=5000

echo 正在启动内信 IntraChat（生产模式）...
echo 程序目录：%APP_DIR%
echo 浏览器访问  http://localhost:%PORT%    管理后台  http://localhost:%PORT%/admin
echo 按 Ctrl+C 停止
echo.
node "%APP_DIR%dist-server\server.js"
pause