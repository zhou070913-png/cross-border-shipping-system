$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '请先安装 Node.js 20 或更新版本，再启动本地测试。'
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/@electric-sql/pglite/package.json'))) {
    & npm.cmd ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
}
Write-Host '启动后请打开 http://127.0.0.1:4175/ ，保持此窗口开启。'
Write-Host '这是本地临时数据库；关闭后重新启动会清空测试数据。'
& npm.cmd run dev:forwarding
