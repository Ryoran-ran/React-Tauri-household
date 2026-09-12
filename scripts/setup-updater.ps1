param([string]$Repository = 'Ryoran-ran/React-Tauri-household')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if ($Repository -notmatch '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') { throw 'Use an owner/repository name.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portableNode = Get-ChildItem -LiteralPath '.tools' -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $portableNode) { throw 'Install Node.js 22.12 or later first.' }
    $env:PATH = "$($portableNode.FullName);$env:PATH"
}
if (-not (Test-Path -LiteralPath 'node_modules/@tauri-apps/cli/tauri.js')) { throw 'Run npm ci first.' }
$secretDirectory = Join-Path $projectRoot '.local-secrets'
$keyPath = Join-Path $secretDirectory 'updater.key'
$passwordPath = Join-Path $secretDirectory 'updater-password.txt'
$publicPath = "$keyPath.pub"
$configPath = Join-Path $projectRoot 'src-tauri/tauri.conf.json'
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$utf8 = New-Object System.Text.UTF8Encoding($false)
if (-not (Test-Path -LiteralPath $keyPath)) {
    if ($config.plugins.updater.pubkey) { throw 'A public key is already configured. Restore its private key from your backup; do not generate a replacement.' }
    if ((Test-Path -LiteralPath $publicPath) -or (Test-Path -LiteralPath $passwordPath)) { throw 'Incomplete key files exist. Check .local-secrets before retrying.' }
    New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null
    $randomBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
    $signingPassword = [Convert]::ToBase64String($randomBytes)
    [IO.File]::WriteAllText($passwordPath, $signingPassword, $utf8)
    # Never print key-generation output or the password to the terminal/logs.
    try {
        & node 'node_modules/@tauri-apps/cli/tauri.js' signer generate --ci -p $signingPassword -w $keyPath *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Failed' }
    } catch { throw 'Key generation failed. Keep .local-secrets and inspect it locally before retrying.' }
    finally { $signingPassword = $null }
}
if (-not (Test-Path -LiteralPath $publicPath) -or -not (Test-Path -LiteralPath $passwordPath)) { throw 'Restore the matching public key and password from your backup.' }
$publicKey = (Get-Content -LiteralPath $publicPath -Raw -Encoding UTF8).Trim()
if ($config.plugins.updater.pubkey -and $config.plugins.updater.pubkey -ne $publicKey) { throw 'The existing public key differs. Refusing to change the update trust key.' }
$config.plugins.updater.pubkey = $publicKey
$config.plugins.updater.endpoints = @("https://github.com/$Repository/releases/latest/download/latest.json")
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 30) + "`n", $utf8)
Write-Output 'Updater configured. Commit src-tauri/tauri.conf.json (public key only).'
Write-Output 'Back up .local-secrets securely outside this project. Never commit or upload this directory.'
Write-Output 'GitHub secret TAURI_SIGNING_PRIVATE_KEY: contents of .local-secrets/updater.key'
Write-Output 'GitHub secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD: contents of .local-secrets/updater-password.txt'
