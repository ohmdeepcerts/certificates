# deploy.ps1 — build and sync all assets to root for GitHub Pages
# Run from D:\OneDrive\All Apps\Certificates\

Set-Location "$PSScriptRoot\vite-app"
Write-Host "Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit 1 }

$dist = "$PSScriptRoot\dist\assets"
$root = "$PSScriptRoot\assets"

Write-Host "Syncing assets..." -ForegroundColor Cyan
Get-ChildItem $dist | ForEach-Object {
    $dest = Join-Path $root $_.Name
    Copy-Item $_.FullName $dest -Force
}

# Get new main JS hash
$newJs = (Get-ChildItem "$dist\index-*.js" | Select-Object -First 1).Name

# Copy full dist/index.html to root so HTML structure changes are deployed
Copy-Item "$PSScriptRoot\dist\index.html" "$PSScriptRoot\index.html" -Force

Write-Host "Done. New JS: $newJs" -ForegroundColor Green

Set-Location $PSScriptRoot
git add dist/assets/ assets/ dist/index.html index.html sw.js version.json
Write-Host "Assets staged. Commit and push when ready (sw.js + version.json still need manual bump)." -ForegroundColor Yellow
