$ErrorActionPreference = "Stop"

$workspace = if ($env:COZE_WORKSPACE_PATH) { $env:COZE_WORKSPACE_PATH } else { (Get-Location).Path }
Set-Location $workspace

$lockfile = Join-Path $workspace "package-lock.json"
$modulesDirectory = Join-Path $workspace "node_modules"
$lockHashFile = Join-Path $modulesDirectory ".coze-lockfile-sha256"

$lockfile = if (Test-Path $lockfile) { $lockfile } else { Join-Path $workspace "package.json" }

$lockHash = (Get-FileHash -LiteralPath $lockfile -Algorithm SHA256).Hash
$cachedLockHash = if (Test-Path $lockHashFile) {
  (Get-Content -LiteralPath $lockHashFile -Raw).Trim()
} else {
  ""
}

if ((Test-Path $modulesDirectory) -and $cachedLockHash -eq $lockHash) {
  Write-Host "Dependencies already installed; skipping npm install."
  return
}

Write-Host "Installing dependencies (npm)..."
& npm install
if ($LASTEXITCODE -ne 0) {
  throw "npm install failed with exit code $LASTEXITCODE."
}

Set-Content -LiteralPath $lockHashFile -Value $lockHash -NoNewline
