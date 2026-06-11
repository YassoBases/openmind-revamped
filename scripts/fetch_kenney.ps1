# OpenMind — Kenney CC0 asset fetcher (Windows).
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\fetch_kenney.ps1
#
# Kenney's direct download URLs change occasionally. This script tries the
# conventional URL; when a download fails it tells you exactly which page to
# visit and where to drop the zip, then re-run. Already-downloaded zips in
# scripts\downloads\ are reused. The shells are fully playable WITHOUT these
# assets (programmatic art is primary).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$downloads = Join-Path $PSScriptRoot 'downloads'
New-Item -ItemType Directory -Force $downloads | Out-Null

$mapping = Get-Content (Join-Path $PSScriptRoot 'kenney_mapping.json') -Raw | ConvertFrom-Json
$missing = @()

foreach ($pack in $mapping.packs) {
    $zipPath = Join-Path $downloads $pack.zip
    if (-not (Test-Path $zipPath)) {
        $tryUrl = "https://kenney.nl/media/pages/assets/$($pack.name)/$($pack.zip)"
        Write-Host "[kenney] downloading $($pack.name)..."
        try {
            Invoke-WebRequest -Uri $tryUrl -OutFile $zipPath -UseBasicParsing
        } catch {
            Write-Warning "[kenney] auto-download failed for $($pack.name)."
            Write-Host  "         1. open  $($pack.url)"
            Write-Host  "         2. click Download, save as  $zipPath"
            Write-Host  "         3. re-run this script"
            $missing += $pack.name
            continue
        }
    }

    $extract = Join-Path $downloads $pack.name
    if (-not (Test-Path $extract)) {
        Expand-Archive -Path $zipPath -DestinationPath $extract -Force
    }

    foreach ($file in $pack.files) {
        $src = Join-Path $extract $file.from
        $dst = Join-Path $root $file.to
        if (Test-Path $src) {
            New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
            Copy-Item $src $dst -Force
            Write-Host "[kenney]   + $($file.to)"
        } else {
            Write-Warning "[kenney]   MISSING in pack: $($file.from) — fix the path in kenney_mapping.json"
        }
    }
}

if ($missing.Count -gt 0) {
    Write-Host "`n[kenney] packs needing manual download: $($missing -join ', ')" -ForegroundColor Yellow
} else {
    Write-Host "`n[kenney] done. Rebuild the shells to pick assets up:  npm -w shells run build" -ForegroundColor Green
}
