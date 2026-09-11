param([ValidateSet('dev', 'build', 'test', 'test-ui')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portableNode = Get-ChildItem -LiteralPath '.tools' -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $portableNode) { throw 'Node.js 22.12 or later is required.' }
    $env:PATH = "$($portableNode.FullName);$env:PATH"
}
switch ($Task) {
    'dev' { & npm.cmd run tauri dev }
    'build' {
        & npm.cmd run tauri build
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        New-Item -ItemType Directory -Force release | Out-Null
        $appVersion = (Get-Content -Raw -LiteralPath package.json | ConvertFrom-Json).version
        Copy-Item -LiteralPath 'src-tauri/target/release/hibi-kakeibo.exe' -Destination "release/HIBI-$appVersion.exe"
        try { Copy-Item -LiteralPath 'src-tauri/target/release/hibi-kakeibo.exe' -Destination 'release/HIBI.exe' }
        catch { Write-Warning "HIBI.exe is in use. Close the old app and launch release/HIBI-$appVersion.exe." }
        $installer = Get-ChildItem -LiteralPath 'src-tauri/target/release/bundle/nsis' -Filter '*-setup.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        Copy-Item -LiteralPath $installer.FullName -Destination 'release/HIBI-setup.exe'
    }
    'test' {
        & npm.cmd test
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        & cargo test --manifest-path src-tauri/Cargo.toml
    }
    'test-ui' { & npm.cmd run test:ui }
}
exit $LASTEXITCODE
