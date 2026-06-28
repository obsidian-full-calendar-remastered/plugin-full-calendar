# tools/build-custom-libs.ps1
# Build script for custom compiled external dependencies: date-holidays and plotly.js

$ErrorActionPreference = "Stop"

# Paths
$RootDir = Get-Item .
$BuildCacheDir = Join-Path $RootDir "tools\build-cache"
$VendorDir = Join-Path $RootDir "vendor"

# Helper function to safely delete a directory on Windows (handling read-only git files)
function Remove-DirectorySafely ($Dir) {
    if (Test-Path $Dir) {
        Write-Host "Cleaning directory: $Dir"
        Get-ChildItem -Path $Dir -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Attributes -match "ReadOnly") {
                $_.Attributes = "Normal"
            }
        }
        Remove-Item -Path $Dir -Recurse -Force
    }
}

Write-Host "Creating vendor directory if not exists..."
if (-not (Test-Path $VendorDir)) {
    New-Item -ItemType Directory -Path $VendorDir | Out-Null
}

Write-Host "Creating build cache directory if not exists..."
if (-not (Test-Path $BuildCacheDir)) {
    New-Item -ItemType Directory -Path $BuildCacheDir | Out-Null
}

# --- 1. Custom Compile date-holidays ---
Write-Host "`n--- BUILDING date-holidays ---"
$DateHolidaysDir = Join-Path $BuildCacheDir "date-holidays"
Remove-DirectorySafely $DateHolidaysDir

Write-Host "Shallow cloning date-holidays (v3.30.2)..."
git clone --depth 1 --branch v3.30.2 https://github.com/commenthol/date-holidays.git $DateHolidaysDir

Write-Host "Installing date-holidays dependencies..."
Push-Location $DateHolidaysDir
npm install --no-audit --no-fund
Write-Host "Compiling YAML countries database..."
npm run yaml
Write-Host "Pruning non-English translations from the holiday database..."
node -e "const fs = require('fs'); const file = 'src/data.js'; let content = fs.readFileSync(file, 'utf8'); const jsonStr = content.substring(content.indexOf('{')); const data = JSON.parse(jsonStr); function strip(obj) { if (!obj || typeof obj !== 'object') return; if (obj.names) { const en = obj.names.en || Object.values(obj.names)[0]; obj.names = { en }; } Object.values(obj).forEach(v => strip(v)); } strip(data.holidays); fs.writeFileSync(file, 'export const data = ' + JSON.stringify(data), 'utf8');"
Pop-Location

Write-Host "Bundling and minifying date-holidays using esbuild (excluding moment and moment-timezone)..."
$DateHolidaysInput = Join-Path $DateHolidaysDir "src\index.js"
$DateHolidaysOutput = Join-Path $VendorDir "date-holidays-custom.min.js"
npx esbuild $DateHolidaysInput --bundle --minify --format=cjs --platform=node --external:moment --external:moment-timezone --outfile=$DateHolidaysOutput

# --- 2. Custom Compile plotly.js ---
Write-Host "`n--- BUILDING plotly.js ---"
$PlotlyDir = Join-Path $BuildCacheDir "plotly.js"
Remove-DirectorySafely $PlotlyDir

Write-Host "Shallow cloning plotly.js (v3.6.0)..."
git clone --depth 1 --branch v3.6.0 https://github.com/plotly/plotly.js.git $PlotlyDir

Write-Host "Installing plotly.js dependencies..."
Push-Location $PlotlyDir
npm install --no-audit --no-fund
Write-Host "Creating custom plotly.js bundle..."
# Run custom_bundle.mjs directly using node to bypass npm run argument stripping
node tasks/custom_bundle.mjs --traces scatter,bar,pie,sunburst,heatmap --strict --out custom
Pop-Location

Write-Host "Copying custom plotly bundle to vendor directory..."
Copy-Item (Join-Path $PlotlyDir "dist\plotly-custom.min.js") (Join-Path $VendorDir "plotly-custom.min.js") -Force

Write-Host "`n--- CLEANING UP ---"
Remove-DirectorySafely $BuildCacheDir

Write-Host "`nSuccessfully custom compiled external dependencies!"
Write-Host "Output files:"
Write-Host " - vendor\date-holidays-custom.min.js"
Write-Host " - vendor\plotly-custom.min.js"
