# IntraChat - production launcher (PowerShell / v2, self-locating)
param(
  [int]$Port = 5000
)
$appDir = $PSScriptRoot
Set-Location $appDir
$Host.UI.RawUI.WindowTitle = "IntraChat Server (keep this window open)"
Write-Host "============================================================"
Write-Host "  IntraChat launcher (v2, self-locating)"
Write-Host "  appDir = $appDir"
Write-Host "  CWD    = $(Get-Location)"
Write-Host "============================================================"
if (-not (Test-Path (Join-Path $appDir '.env'))) {
  Copy-Item (Join-Path $appDir '.env.example') (Join-Path $appDir '.env')
  Write-Host "[WARN] Created .env. Edit it with your MySQL account / JWT_SECRET, then rerun." -ForegroundColor Yellow
  return
}
if (-not (Test-Path (Join-Path $appDir 'dist-server\server.js'))) {
  Write-Host "[ERROR] dist-server\server.js not found. Extract the zip fully, then rerun." -ForegroundColor Red
  return
}
$env:NODE_ENV = "production"
$env:PORT = "$Port"
Write-Host "Starting IntraChat (production)... appDir=$appDir  http://localhost:$Port  (admin /admin)"
& node (Join-Path $appDir 'dist-server\server.js')