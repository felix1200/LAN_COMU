@echo off
rem =====================================================
rem  内信 IntraChat - 生产启动（编译后免安装包）
rem  双击本文件即可启动；停止用 Ctrl+C
rem =====================================================
chcp 65001 >nul
rem 切到本脚本所在目录（%~dp0 末尾带反斜杠），无论从哪个工作目录/管理员窗口启动都正确
cd /d "%~dp0"
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

if not exist "%APP_DIR%\dist-server\server.js" (
  echo [错误] 找不到 dist-server\server.js
  echo 请确认本 start.bat 与 dist-server 文件夹在同一目录，当前目录：%APP_DIR%
  echo.
  pause
  exit /b 1
)

if not exist "%APP_DIR%\.env" (
  copy /y "%APP_DIR%\.env.example" "%APP_DIR%\.env" >nul
  echo.
  echo [警告] 已为你生成 .env 配置文件，请先用记事本打开填写：
  echo    %APP_DIR%\.env
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
echo 程序目录：%APP_DIR%
echo 浏览器访问  http://localhost:%PORT%    管理后台  http://localhost:%PORT%/admin
echo 按 Ctrl+C 停止
echo.
rem 用绝对路径调用，避免当前工作目录是 C:\Windows\system32 时找不到文件
node "%APP_DIR%\dist-server\server.js"
pause