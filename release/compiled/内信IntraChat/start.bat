@echo off
rem =====================================================
rem  内信 IntraChat - 生产启动（编译后免安装包 / v2 自定位版）
rem  正确用法：先把压缩包“全部解压”到普通磁盘目录，再双击本文件。
rem  切勿在压缩包预览窗口里直接双击，也不要自己开 CMD 手敲 node。
rem =====================================================
title 内信 IntraChat 服务（请勿关闭此窗口）
chcp 65001 >nul

rem 定位本脚本所在目录（%~dp0 一定是本 .bat 的真实绝对路径，带结尾反斜杠）
set "APP_DIR=%~dp0"

rem 无论从哪个工作目录被拉起（system32/服务/任务计划），都强制切到包根
cd /d "%APP_DIR%" 2>nul
if errorlevel 1 (
  echo [错误] 无法进入程序目录：%APP_DIR%
  echo 请先右键压缩包 -“全部解压”到如 D:\intranet-im，再进入该文件夹双击 start.bat
  pause
  exit /b 1
)

echo ============================================================
echo   内信 IntraChat 启动器（v2 自定位版）
echo   脚本所在目录（APP_DIR）= %APP_DIR%
echo   当前工作目录（CD）      = %CD%
echo ============================================================
echo.

if not exist "%APP_DIR%.env" (
  copy /y "%APP_DIR%.env.example" "%APP_DIR%.env" >nul
  echo [警告] 已为你生成 .env 配置文件，请先用记事本打开填写：
  echo    DB_USER / DB_PASSWORD  = 你的 MySQL 账号密码
  echo    JWT_SECRET             = 一段随机长字符串
  echo 改完保存后，再双击本文件启动。
  echo.
  pause
  exit /b
)

if not exist "%APP_DIR%dist-server\server.js" (
  echo [错误] 未找到文件：%APP_DIR%dist-server\server.js
  echo 这通常是因为你在压缩包窗口里直接运行，或解压不完整。
  echo 请右键压缩包 -“全部解压”到如 D:\intranet-im，再进入该文件夹双击 start.bat。
  echo.
  pause
  exit /b 1
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=5000

echo 正在启动内信 IntraChat（生产模式）...
echo 浏览器访问  http://localhost:%PORT%      管理后台  http://localhost:%PORT%/admin
echo 服务运行期间请保持本窗口打开，停止请按 Ctrl+C
echo.

node "%APP_DIR%dist-server\server.js"

echo.
echo [服务已退出] 退出码 = %ERRORLEVEL%
if exist "%APP_DIR%dist-server\server.js" (
  echo 若上方是 Node 报错，请把本黑窗口里“脚本所在目录（APP_DIR）=”那一行连同报错一起发给技术支持。
) else (
  echo 入口文件缺失，请重新完整解压后再启动。
)
echo.
pause
