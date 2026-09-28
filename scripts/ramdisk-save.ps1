<#
.SYNOPSIS
  Snapshot the volatile R: RAM disk to durable storage.

.DESCRIPTION
  A RAM disk is erased on every reboot. Anything real kept on it -- notes,
  papers, media -- is one shutdown away from being lost. This script copies the
  contents somewhere durable so they can be restored with ramdisk-restore.ps1.

  Scratch directories (Temp, tmp) are skipped: they are regenerated, not
  valuable, and copying them would defeat the point of the RAM disk.

.PARAMETER Destination
  Where to write the snapshot. Defaults to a folder under the user profile.

.PARAMETER DriveLetter
  Drive letter of the RAM disk. Default R.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ramdisk-save.ps1
#>
[CmdletBinding()]
param(
  [string]$Destination = (Join-Path $env:USERPROFILE 'flight-focus-ramdisk-backup'),
  [string]$DriveLetter = 'R'
)

$ErrorActionPreference = 'Stop'

$source = "${DriveLetter}:\"

if (-not (Test-Path $source)) {
  Write-Error "[ramdisk-save] $source is not mounted. Nothing to save."
  exit 1
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null

Write-Host "[ramdisk-save] $source -> $Destination"

$copied = 0
$skipped = 0

Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
  if ($_.Name -in @('Temp', 'tmp')) {
    Write-Host "  skip  $($_.Name)  (scratch)"
    $skipped++
    return
  }

  Write-Host "  copy  $($_.Name)"
  Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
  $copied++
}

Write-Host ""
Write-Host "[ramdisk-save] copied $copied item(s), skipped $skipped scratch item(s)." -ForegroundColor Green
Write-Host "[ramdisk-save] restore later with: powershell -File scripts\ramdisk-restore.ps1"
