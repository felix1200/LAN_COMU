# ============================================================
#  内信 IntraChat —— Windows + 本地 MySQL 一键部署脚本
#  用法（在项目根目录的 PowerShell 中执行）：
#      powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1         # 安装+构建+前台启动
#      powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Start  # 仅前台启动（跳过安装/构建）
#      powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Service nssm   # 构建并注册为 Windows 服务
#      powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -Service pm2    # 构建后用 pm2 常驻
# ============================================================
[CmdletBinding()]
param(
  [switch]$Start,          # 跳过依赖安装与构建，直接启动（需已构建过）
  [string]$Service = "",   # "" | "nssm" | "pm2"
  [int]$Port = 0           # 指定端口（默认读 .env 的 PORT，缺省 5000）
)
$ErrorActionPreference = "Stop"

$workspace = $PSScriptRoot | Split-Path -Parent
Set-Location $workspace
Write-Host "`n===== 内信 IntraChat 部署 @ $workspace =====" -ForegroundColor Cyan

function Ensure-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "未检测到 Node.js，请先安装 Node.js 20+ LTS（https://nodejs.org）。"
  }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "未检测到 npm，请重装 Node.js LTS（npm 随附）。"
  }
  Write-Host ("node: " + (node --version) + "  /  npm: " + (npm --version))
}

function Ensure-Env {
  $envPath = Join-Path $workspace ".env"
  if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $workspace ".env.example") $envPath
    Write-Host "[配置] 已从 .env.example 生成 .env，请务必编辑其中的 DB_USER/DB_PASSWORD 与 JWT_SECRET！" -ForegroundColor Yellow
  }
  # 生成随机 JWT 密钥：自动替换占位值
  foreach ($line in @('JWT_SECRET=please-change-to-a-long-random-string','JWT_SECRET=please-change-me')) {
    if (Select-String -Path $envPath -Pattern [regex]::Escape($line) -Quiet) {
      $rand = -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
      (Get-Content $envPath) -replace [regex]::Escape($line), "JWT_SECRET=$rand" | Set-Content $envPath
      Write-Host "[配置] 已为 JWT_SECRET 生成随机密钥" -ForegroundColor Green
    }
  }
  Write-Host "[配置] 请确认 .env 中 MySQL 连接（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）正确。" -ForegroundColor Yellow
}

function Step-Build {
  Write-Host "[步骤1] 安装依赖 ..."
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install 失败（退出码 $LASTEXITCODE）。若网络较慢可加 --registry=https://registry.npmmirror.com" }
  Write-Host "[步骤2] 构建前端 + 后端 ..."
  npx vite build
  if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }
  npx tsup server/server.ts --format cjs --platform node --target node20 --outDir dist-server --no-splitting --no-minify --external vite --shims
  if ($LASTEXITCODE -ne 0) { throw "后端构建失败" }
  Write-Host "[步骤2] 构建完成：dist/（前端）、dist-server/server.js（后端）" -ForegroundColor Green
}

function Resolve-Port {
  if ($Port -gt 0) { return $Port }
  $envPath = Join-Path $workspace ".env"
  if (Test-Path $envPath) {
    foreach ($l in Get-Content $envPath) {
      if ($l -match '^PORT\s*=\s*(\d+)\s*$') { return [int]$Matches[1] }
    }
  }
  return 5000
}

function Step-Run {
  $p = Resolve-Port
  Write-Host "`n[启动] http://localhost:$p  (聊天)  /  http://localhost:$p/admin  (管理后台)" -ForegroundColor Cyan
  $env:NODE_ENV = "production"
  $env:PORT = "$p"
  & node dist-server/server.js
}

# ---------- 主流程 ----------
Ensure-Node

if ($Start) {
  if (-not (Test-Path "dist-server/server.js")) { throw "未发现 dist-server\\server.js，请先不带 -Start 运行一次完成构建。" }
  Step-Run
  exit
}

Ensure-Env
Step-Build

if ($Service -eq "nssm") {
  if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) { throw "未安装 NSSM，请先安装并加入 PATH（官网 nssm.cc）。" }
  $p = Resolve-Port
  nssm install IntraChat "$env:ComSpec" "/c `"set NODE_ENV=production && set PORT=$p && cd /d `"$workspace`" && node dist-server/server.js`""
  nssm set IntraChat AppDirectory $workspace
  nssm start IntraChat
  Write-Host "[服务] 已注册并启动 Windows 服务 IntraChat（端口 $p）。开机自启，http://localhost:$p" -ForegroundColor Green
  exit
}
if ($Service -eq "pm2") {
  if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { throw "未安装 pm2，请先：npm i -g pm2 pm2-windows-startup" }
  $p = Resolve-Port
  $env:NODE_ENV="production"; $env:PORT="$p"
  pm2 start dist-server/server.js --name intrachat --update-env
  pm2 save
  pm2-startup install | Out-Null
  Write-Host "[服务] 已用 pm2 常驻（开机自启），端口 $p。http://localhost:$p" -ForegroundColor Green
  exit
}

Step-Run