# 内信 IntraChat - 生产启动（PowerShell / v2 自定位版）
param(
  [int]$Port = 5000
)
# 定位脚本所在目录（即包根），一律用绝对路径，避免因工作目录在 system32 等位置而找不到
$appDir = $PSScriptRoot
Set-Location $appDir
$Host.UI.RawUI.WindowTitle = "内信 IntraChat 服务（请勿关闭此窗口）"
Write-Host "============================================================"
Write-Host "  内信 IntraChat 启动器（v2 自定位版）"
Write-Host "  脚本所在目录（appDir）= $appDir"
Write-Host "  当前工作目录（CWD）    = $(Get-Location)"
Write-Host "============================================================"
if (-not (Test-Path (Join-Path $appDir '.env'))) {
  Copy-Item (Join-Path $appDir '.env.example') (Join-Path $appDir '.env')
  Write-Host "[警告] 已生成 .env，请先编辑填写 MySQL 账号密码 / JWT_SECRET 后重新启动。" -ForegroundColor Yellow
  return
}
if (-not (Test-Path (Join-Path $appDir 'dist-server\server.js'))) {
  Write-Host "[错误] 未找到 dist-server\server.js，请确认已完整解压后再运行。" -ForegroundColor Red
  return
}
$env:NODE_ENV = "production"
$env:PORT = "$Port"
Write-Host "正在启动 内信 IntraChat (生产) ...  程序目录：$appDir  访问 http://localhost:$Port  (管理后台 /admin)"
& node (Join-Path $appDir 'dist-server\server.js')