param(
  [switch]$BuildBinary
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdkBin = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
$makeAppx = Join-Path $sdkBin 'makeappx.exe'
$stage = Join-Path $root 'work\msix'
$outputDir = Join-Path $root 'outputs'
$binary = Join-Path $root 'src-tauri\target\release\stickynote.exe'
$sourceIcon = Join-Path $root 'src-tauri\icons\app-icon-source.png'
$manifest = Join-Path $root 'store\msix\AppxManifest.xml'
$package = Join-Path $outputDir 'Desktop-Sticky-Note_1.0.6.0_x64.msix'

if (-not (Test-Path $makeAppx)) {
  throw "Windows SDK makeappx.exe was not found: $makeAppx"
}

if ($BuildBinary) {
  Push-Location $root
  try {
    # Tauri embeds the production frontend into the executable; a raw Cargo build uses devUrl.
    npx.cmd tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Tauri release build failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

if (-not (Test-Path $binary)) {
  throw "Release binary was not found. Run this script with -BuildBinary first."
}

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $stage 'stickynote.exe')
Copy-Item -LiteralPath $manifest -Destination (Join-Path $stage 'AppxManifest.xml')

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($sourceIcon)
try {
  $assets = @{
    'StoreLogo.png' = @(50, 50)
    'Square44x44Logo.png' = @(44, 44)
    'Square150x150Logo.png' = @(150, 150)
    'Wide310x150Logo.png' = @(310, 150)
    'Square310x310Logo.png' = @(310, 310)
  }
  foreach ($entry in $assets.GetEnumerator()) {
    $bitmap = New-Object System.Drawing.Bitmap($entry.Value[0], $entry.Value[1])
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($image, 0, 0, $bitmap.Width, $bitmap.Height)
      $bitmap.Save((Join-Path $stage "Assets\\$($entry.Key)"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $image.Dispose()
}

Remove-Item -LiteralPath $package -Force -ErrorAction SilentlyContinue
& $makeAppx pack /d $stage /p $package /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed with exit code $LASTEXITCODE" }

Write-Host "Created unsigned Store submission package: $package"
