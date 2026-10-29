$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error '需要 Node.js 22 或更高版本。'
    exit 1
}
& node (Join-Path $PSScriptRoot 'scripts/install.mjs') @args
exit $LASTEXITCODE
