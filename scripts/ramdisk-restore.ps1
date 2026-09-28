<#
.SYNOPSIS
  Restore a RAM disk snapshot created by ramdisk-save.ps1.

.DESCRIPTION
  Copies the snapshot back onto the RAM disk. Existing files are never
  overwritten unless -Force is passed, so a partially changed RAM disk is not
  silently clobbered.

.PARAMETER Source
  Folder holding the snapshot. Defaults to the same location ramdisk-save.ps1
  uses.

.PARAMETER DriveLetter
  Drive letter of the RAM disk. Default R.

.PARAMETER Force
  Overwrite files that already exist on the RAM disk.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ramdisk-restore.ps1
#>
[CmdletBinding()]
param(
  [string]$Source = (Join-Path $env:USERPROFILE 'flight-focus-ramdisk-backup'),
  [string]$DriveLetter = 'R',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$target = "${DriveLetter}:\"

if (-not (Test-Path $target)) {
  Write-Error "[ramdisk-restore] $target is not mounted. Run scripts\ramdisk.ps1 first."
  exit 1
}

if (-not (Test-Path $Source)) {
  Write-Error "[ramdisk-restore] no snapshot found at $Source. Run ramdisk-save.ps1 first."
  exit 1
}

Write-Host "[ramdisk-restore] $Source -> $target"

$hasClobberRisk = $false
Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
  $dest = Join-Path $target $_.Name
  if ((Test-Path $dest) -and (-not $Force)) {
    Write-Warning "  exists  $($_.Name)  (pass -Force to overwrite)"
    $hasClobberRisk = $true
    return
  }

  Write-Host "  copy    $($_.Name)"
  Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
}

if ($hasClobberRisk) {
  Write-Host ""
  Write-Host "[ramdisk-restore] finished, with existing items left untouched." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "[ramdisk-restore] restore complete." -ForegroundColor Green
