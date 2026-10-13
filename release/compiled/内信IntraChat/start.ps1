# 内信 IntraChat - 生产启动（PowerShell）
param(
  [int]$Port = 5000
)
Set-Location $PSScriptRoot
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "[警告] 已生成 .env，请先编辑填写 MySQL 账号密码 / JWT_SECRET 后重新启动。" -ForegroundColor Yellow
  return
}
$env:NODE_ENV = "production"
$env:PORT = "$Port"
Write-Host "正在启动 内信 IntraChat (生产) ...  访问 http://localhost:$Port  (管理后台 /admin)"
node dist-server/server.js