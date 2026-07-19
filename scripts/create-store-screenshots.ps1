Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root 'store\screenshot'
$outputDir = Join-Path $sourceDir 'store-promo'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Convert-CodePoints([int[]]$points) {
  return -join ($points | ForEach-Object { [char]$_ })
}

function Draw-StoreScreenshot($sourceName, $outputName, $headline, $subheadline, $description) {
  $canvas = New-Object System.Drawing.Bitmap 1920, 1080
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    [System.Drawing.Rectangle]::new(0, 0, 1920, 1080),
    [System.Drawing.Color]::FromArgb(20, 86, 171),
    [System.Drawing.Color]::FromArgb(88, 186, 240),
    26
  )
  $graphics.FillRectangle($background, 0, 0, 1920, 1080)
  $background.Dispose()

  # Soft blue folds evoke a Windows desktop without using copyrighted wallpaper artwork.
  $foldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 220, 245, 255))
  $foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $foldPath.AddBezier(0, 880, 450, 530, 920, 1120, 1420, 430)
  $foldPath.AddBezier(1420, 430, 1640, 150, 1800, 280, 1920, 40)
  $foldPath.AddLine(1920, 1080, 0, 1080)
  $foldPath.CloseFigure()
  $graphics.FillPath($foldBrush, $foldPath)
  $foldPath.Dispose()
  $foldBrush.Dispose()

  $copyPath = New-RoundedPath 82 170 875 680 34
  $copyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(225, 247, 251, 255))
  $graphics.FillPath($copyBrush, $copyPath)
  $copyPath.Dispose()
  $copyBrush.Dispose()

  $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 246, 194, 75))
  $graphics.FillEllipse($accentBrush, 126, 220, 66, 66)
  $accentBrush.Dispose()

  $headlineFont = New-Object System.Drawing.Font 'DengXian', 52, ([System.Drawing.FontStyle]::Bold)
  $subheadlineFont = New-Object System.Drawing.Font 'DengXian', 32, ([System.Drawing.FontStyle]::Regular)
  $descriptionFont = New-Object System.Drawing.Font 'DengXian', 22, ([System.Drawing.FontStyle]::Regular)
  $brandFont = New-Object System.Drawing.Font 'DengXian', 24, ([System.Drawing.FontStyle]::Bold)
  $darkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 56, 83))
  $mutedBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(82, 105, 128))
  $graphics.DrawString((Convert-CodePoints @(0x684C, 0x9762, 0x4FBF, 0x7B7E)), $brandFont, $darkBrush, 210, 235)
  $graphics.DrawString($headline, $headlineFont, $darkBrush, [System.Drawing.RectangleF]::new(126, 350, 735, 145))
  $graphics.DrawString($subheadline, $subheadlineFont, $darkBrush, [System.Drawing.RectangleF]::new(126, 535, 720, 98))
  $graphics.DrawString($description, $descriptionFont, $mutedBrush, [System.Drawing.RectangleF]::new(126, 665, 660, 102))
  $headlineFont.Dispose(); $subheadlineFont.Dispose(); $descriptionFont.Dispose(); $brandFont.Dispose()
  $darkBrush.Dispose(); $mutedBrush.Dispose()

  $taskbarBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 16, 58, 108))
  $graphics.FillRectangle($taskbarBrush, 0, 1018, 1920, 62)
  $taskbarBrush.Dispose()
  $iconBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(215, 240, 248, 255))
  foreach ($x in 850, 905, 960, 1015) {
    $iconPath = New-RoundedPath $x 1034 32 32 7
    $graphics.FillPath($iconBrush, $iconPath)
    $iconPath.Dispose()
  }
  $iconBrush.Dispose()

  $source = [System.Drawing.Image]::FromFile((Join-Path $sourceDir $sourceName))
  try {
    $windowX = 1190; $windowY = 70; $windowWidth = 600; $windowHeight = 912
    $shadowPath = New-RoundedPath ($windowX + 12) ($windowY + 16) $windowWidth $windowHeight 20
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(58, 14, 33, 61))
    $graphics.FillPath($shadowBrush, $shadowPath)
    $shadowPath.Dispose(); $shadowBrush.Dispose()
    $clipPath = New-RoundedPath $windowX $windowY $windowWidth $windowHeight 18
    $graphics.SetClip($clipPath)
    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new($windowX, $windowY, $windowWidth, $windowHeight))
    $graphics.ResetClip()
    $windowPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 255, 255, 255)), 2
    $graphics.DrawPath($windowPen, $clipPath)
    $windowPen.Dispose(); $clipPath.Dispose()
  } finally {
    $source.Dispose()
  }

  try {
    $canvas.Save((Join-Path $outputDir $outputName), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $canvas.Dispose()
  }
}

$tasksHeadline = Convert-CodePoints @(0x5F85, 0x529E, 0x4E00, 0x76EE, 0x4E86, 0x7136)
$tasksSubheadline = Convert-CodePoints @(0x4EFB, 0x52A1, 0x6E05, 0x5355, 0x0020, 0x00B7, 0x0020, 0x7D27, 0x6025, 0x6807, 0x8BB0, 0x0020, 0x00B7, 0x0020, 0x622A, 0x6B62, 0x65F6, 0x95F4)
$tasksDescription = Convert-CodePoints @(0x628A, 0x4ECA, 0x5929, 0x7684, 0x91CD, 0x8981, 0x4E8B, 0x9879, 0x7559, 0x5728, 0x684C, 0x9762, 0xFF0C, 0x968F, 0x65F6, 0x67E5, 0x770B, 0x3001, 0x968F, 0x624B, 0x5B8C, 0x6210, 0x3002)
$progressHeadline = Convert-CodePoints @(0x8BB0, 0x5F55, 0x6BCF, 0x4E00, 0x6B65, 0x8FDB, 0x5C55)
$progressSubheadline = Convert-CodePoints @(0x8FDB, 0x5EA6, 0x7EF4, 0x62A4, 0x0020, 0x00B7, 0x0020, 0x751F, 0x547D, 0x5468, 0x671F, 0x8BB0, 0x5F55)
$progressDescription = Convert-CodePoints @(0x8BB0, 0x5F55, 0x8FDB, 0x5C55, 0x3001, 0x963B, 0x788D, 0x4E0E, 0x4E0B, 0x4E00, 0x6B65, 0x5B89, 0x6392, 0xFF0C, 0x8BA9, 0x4EFB, 0x52A1, 0x72B6, 0x6001, 0x6E05, 0x6670, 0x53EF, 0x8FFD, 0x6EAF, 0x3002)
$personalHeadline = Convert-CodePoints @(0x6309, 0x4F60, 0x7684, 0x65B9, 0x5F0F, 0x4F7F, 0x7528)
$personalSubheadline = Convert-CodePoints @(0x591A, 0x7528, 0x6237, 0x0020, 0x00B7, 0x0020, 0x591A, 0x4E3B, 0x9898, 0x0020, 0x00B7, 0x0020, 0x81EA, 0x7531, 0x5B9A, 0x4F4D)
$personalDescription = Convert-CodePoints @(0x5927, 0x5C0F, 0x3001, 0x4E3B, 0x9898, 0x3001, 0x4F4D, 0x7F6E, 0x548C, 0x6781, 0x7B80, 0x6A21, 0x5F0F, 0xFF0C, 0x8F7B, 0x91CF, 0x800C, 0x4E13, 0x6CE8, 0x5730, 0x966A, 0x4F34, 0x5DE5, 0x4F5C, 0x3002)

Draw-StoreScreenshot 'list.png' 'store-feature-tasks.png' $tasksHeadline $tasksSubheadline $tasksDescription
Draw-StoreScreenshot 'detail.png' 'store-feature-progress.png' $progressHeadline $progressSubheadline $progressDescription
Draw-StoreScreenshot 'menu.png' 'store-feature-personalization.png' $personalHeadline $personalSubheadline $personalDescription
