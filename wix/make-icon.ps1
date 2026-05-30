# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# Generates wix\assets\searchbox.ico as a multi-resolution icon
# (16/32/48/64/128/256) with a branded "S" on a dark rounded square.
# Drawn with System.Drawing/GDI+ and packed into ICO format manually.
# Runs once per build (fast; ~500ms) from build.ps1.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$RepoRoot  = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$AssetsDir = Join-Path $RepoRoot 'wix\assets'
$IcoPath   = Join-Path $AssetsDir 'searchbox.ico'
$Sizes     = @(16, 32, 48, 64, 128, 256)

New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null

# Brand palette — dark navy base + white mark. Matches the muted dark
# theme the web UI already uses (#0d1117 / #c9d1d9-ish range).
$BgColor = [System.Drawing.Color]::FromArgb(255, 13, 17, 23)
$FgColor = [System.Drawing.Color]::FromArgb(255, 88, 166, 255)  # GitHub-ish blue accent

function New-IconBitmap {
  param([int]$Size)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded-square background.
  $radius = [int]($Size * 0.22)
  $pad    = [int]($Size * 0.04)
  $rect   = New-Object System.Drawing.Rectangle $pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad)
  $path   = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d      = [int]($radius * 2)
  $path.AddArc($rect.X,                    $rect.Y,                    $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d,           $rect.Y,                    $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d,           $rect.Bottom - $d,          $d, $d, 0,   90)
  $path.AddArc($rect.X,                    $rect.Bottom - $d,          $d, $d, 90,  90)
  $path.CloseFigure()

  $bgBrush = New-Object System.Drawing.SolidBrush $BgColor
  $g.FillPath($bgBrush, $path)
  $bgBrush.Dispose()

  # Bright "S" mark centred. Arial Black gives the weight we want
  # without pulling in a custom font.
  $fontSize = [single]([Math]::Max($Size * 0.6, 4))
  $font     = New-Object System.Drawing.Font 'Arial Black', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fgBrush  = New-Object System.Drawing.SolidBrush $FgColor
  $fmt      = New-Object System.Drawing.StringFormat
  $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

  # Nudge the baseline up a hair — Arial Black sits heavy otherwise.
  $textRect = [System.Drawing.RectangleF]::new($rect.X, $rect.Y - [int]($Size * 0.02), $rect.Width, $rect.Height)
  $g.DrawString('S', $font, $fgBrush, $textRect, $fmt)

  $fgBrush.Dispose()
  $font.Dispose()
  $path.Dispose()
  $g.Dispose()
  return $bmp
}

# Render every size to PNG in memory.
$pngs = @{}
foreach ($size in $Sizes) {
  $bmp = New-IconBitmap -Size $size
  $ms  = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs[$size] = $ms.ToArray()
  $bmp.Dispose()
  $ms.Dispose()
}

# ICO format (Vista+): 6-byte ICONDIR header, N × 16-byte ICONDIRENTRY,
# then N × PNG blobs. Entry's width=height=0 signals "256px".
$fs = [System.IO.File]::Create($IcoPath)
try {
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0)           # reserved
  $bw.Write([uint16]1)           # type = ICO
  $bw.Write([uint16]$Sizes.Count)

  # First compute offsets (directory is always 6 + 16*N bytes).
  $dirSize   = 6 + 16 * $Sizes.Count
  $offsets   = @{}
  $runningOffset = $dirSize
  foreach ($size in $Sizes) {
    $offsets[$size] = [uint32]$runningOffset
    $runningOffset += $pngs[$size].Length
  }

  # Directory entries.
  foreach ($size in $Sizes) {
    $dim = if ($size -ge 256) { 0 } else { [byte]$size }
    $bw.Write([byte]$dim)        # width
    $bw.Write([byte]$dim)        # height
    $bw.Write([byte]0)           # color palette (0 for true-color)
    $bw.Write([byte]0)           # reserved
    $bw.Write([uint16]1)         # color planes
    $bw.Write([uint16]32)        # bits per pixel
    $bw.Write([uint32]$pngs[$size].Length)
    $bw.Write([uint32]$offsets[$size])
  }

  # PNG payloads.
  foreach ($size in $Sizes) {
    $bw.Write($pngs[$size])
  }
  $bw.Flush()
}
finally {
  $fs.Dispose()
}

Write-Host "Wrote $IcoPath ($([int]((Get-Item $IcoPath).Length / 1KB)) KB, sizes: $($Sizes -join ','))"
