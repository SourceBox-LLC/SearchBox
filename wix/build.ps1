# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# Build the Windows MSI installer end-to-end:
#   1. Download the bundled Meilisearch binary into wix\payload\
#   2. Generate wix\License.rtf from LICENSE
#   3. Build the release searchbox.exe
#   4. Run cargo-wix to produce target\wix\SearchBox-<version>-x86_64.msi
#
# Run from the repo root in PowerShell:
#     .\wix\build.ps1
#     .\wix\build.ps1 -SkipBuild    # if you've already cargo-built + signed
#
# Prerequisites (see BUILD.md):
#   - Rust stable (x86_64-pc-windows-msvc)
#   - WiX Toolset v3.11+ on PATH (candle.exe, light.exe)
#   - cargo-wix  (install once:  cargo install cargo-wix)

param(
  # CI uses this to keep a pre-signed searchbox.exe around — calling
  # cargo build again would unsign it. Local devs leave this off.
  [switch]$SkipBuild,

  # Rust target triple. Defaults to x64; CI passes aarch64 for the ARM64 MSI.
  [string]$Target = 'x86_64-pc-windows-msvc'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Self-heal PATH when WiX was just installed and the user hasn't
# restarted their shell. `winget install WiXToolset.WiXToolset` sets
# the machine PATH, but existing terminals keep the old one.
if (-not (Get-Command candle.exe -ErrorAction SilentlyContinue)) {
  $wixBin = Get-ChildItem 'C:\Program Files (x86)\WiX Toolset v3*\bin' -Directory -ErrorAction SilentlyContinue `
    | Sort-Object Name -Descending | Select-Object -First 1
  if ($null -ne $wixBin) {
    Write-Host "==> Adding $($wixBin.FullName) to PATH (not yet picked up by this shell)"
    $env:Path = "$($wixBin.FullName);$env:Path"
  } else {
    throw "candle.exe not found on PATH and no 'WiX Toolset v3*' install detected. See BUILD.md."
  }
}

# Pinning Meilisearch to a known-good release. Bump as new versions
# ship; verify the binary runs against our `services::meili` client.
$MeiliVersion = 'v1.11.3'
$MeiliUrl     = "https://github.com/meilisearch/meilisearch/releases/download/$MeiliVersion/meilisearch-windows-amd64.exe"

$RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PayloadDir = Join-Path $RepoRoot 'wix\payload'
$MeiliExe   = Join-Path $PayloadDir 'meilisearch.exe'
$LicenseRtf = Join-Path $RepoRoot 'wix\License.rtf'
$LicenseSrc = Join-Path $RepoRoot 'LICENSE'

Write-Host "==> Ensuring payload dir"
New-Item -ItemType Directory -Force -Path $PayloadDir | Out-Null

if (Test-Path $MeiliExe) {
  Write-Host "==> meilisearch.exe already present, skipping download"
} else {
  Write-Host "==> Downloading Meilisearch $MeiliVersion"
  Invoke-WebRequest -Uri $MeiliUrl -OutFile $MeiliExe -UseBasicParsing
}

# Bundle the Visual C++ runtime app-local. searchbox.exe + meilisearch.exe are
# MSVC-linked and need vcruntime140.dll etc.; a fresh Windows without any VC++
# redistributable doesn't have them, so both exes fail to start with
# STATUS_DLL_NOT_FOUND (0xC0000135). Shipping the redist DLLs next to the exes
# makes Windows find them with no VCRedist install. (Match the build arch; the
# bundled meilisearch.exe is x64, so it relies on the system's x64 runtime on
# ARM64 — fine on any machine that's ever installed x64 software.)
$crtArch = if ($Target -like 'aarch64*') { 'arm64' } else { 'x64' }
Write-Host "==> Bundling the Visual C++ runtime ($crtArch)"
$crtNames = @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')
$crtSrc   = $null
$vswhere  = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
  $vsRoot = (& $vswhere -latest -products * -property installationPath) | Select-Object -First 1
  if ($vsRoot) {
    $crtSrc = Get-ChildItem (Join-Path $vsRoot "VC\Redist\MSVC\*\$crtArch\Microsoft.VC*.CRT") -Directory -ErrorAction SilentlyContinue `
      | Sort-Object FullName -Descending | Select-Object -First 1
  }
}
foreach ($dll in $crtNames) {
  $dst  = Join-Path $PayloadDir $dll
  $done = $false
  if ($null -ne $crtSrc) {
    $src = Join-Path $crtSrc.FullName $dll
    if (Test-Path $src) { Copy-Item $src $dst -Force; $done = $true }
  }
  if (-not $done -and $crtArch -eq 'x64') {
    $sys = Join-Path $env:WINDIR "System32\$dll"   # fall back to the runner's own x64 runtime
    if (Test-Path $sys) { Copy-Item $sys $dst -Force; $done = $true }
  }
  if (-not $done) { throw "VC++ runtime '$dll' ($crtArch) not found (VS redist$(if ($crtArch -eq 'x64') { ' / System32' })). Cannot build a self-contained MSI." }
  Write-Host "    + $dll"
}

Write-Host "==> Generating icon (searchbox.ico)"
# make-icon.ps1 uses $ErrorActionPreference='Stop' so it throws on
# failure — no explicit exit-code check needed (and $LASTEXITCODE
# isn't set by .ps1 invocations anyway).
& (Join-Path $PSScriptRoot 'make-icon.ps1')

Write-Host "==> Generating License.rtf from LICENSE"
# WiX's license dialog reads an RTF. Escape the three RTF-special chars
# and wrap each source line in a \par. UTF-8 text is written as-is; for
# fancier non-ASCII glyphs you'd need \u escapes, but AGPL is ASCII-only.
$rtfHeader = "{\rtf1\ansi\ansicpg1252\deff0\nouicompat\deflang1033{\fonttbl{\f0\fnil\fcharset0 Consolas;}}\viewkind4\uc1\pard\sa80\f0\fs18 "
$rtfFooter = "}"
$body = (Get-Content -Path $LicenseSrc -Raw) `
  -replace '\\', '\\\\' `
  -replace '\{', '\{' `
  -replace '\}', '\}' `
  -replace "`r`n", '\par ' `
  -replace "`n", '\par '
[System.IO.File]::WriteAllText($LicenseRtf, $rtfHeader + $body + $rtfFooter)

if ($SkipBuild) {
  Write-Host "==> -SkipBuild: reusing existing searchbox.exe"
  $exe = Join-Path $RepoRoot "target\$Target\release\searchbox.exe"
  if (-not (Test-Path $exe)) { throw "-SkipBuild set but $exe is missing" }
} else {
  Write-Host "==> cargo build --release --target $Target"
  cargo build --release --target $Target
  if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
}

Write-Host "==> cargo wix (target $Target)"
# -v makes the WiX invocation visible. --target forces the same triple as the
# build above so cargo-wix finds target\$Target\release\searchbox.exe AND
# auto-defines $(var.Platform) (x64 / arm64), which main.wxs uses for the
# Package Platform — so do NOT pass -dPlatform ourselves (a duplicate define is
# candle error CNDL0288). cargo-wix also auto-loads WixUIExtension *and*
# WixUtilExtension — don't pass them via -C/-L or candle errors on a duplicate
# namespace load.
cargo wix --no-build --nocapture --target $Target -v
if ($LASTEXITCODE -ne 0) { throw "cargo wix failed" }

$MsiOut = Get-ChildItem -Path (Join-Path $RepoRoot 'target\wix') -Filter '*.msi' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $MsiOut) {
  Write-Host ""
  Write-Host "Built: $($MsiOut.FullName)"
} else {
  Write-Warning "cargo wix reported success but no .msi found under target\wix"
}
