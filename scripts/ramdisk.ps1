<#
.SYNOPSIS
  Verify (and optionally recreate) the R: RAM disk used for scratch space.

.DESCRIPTION
  Flight Focus keeps ephemeral build scratch on a RAM disk so the system SSD is
  not worn by npm/Vite/esbuild churn.

  This script is deliberately conservative. A RAM disk is volatile, so the one
  operation that loses data is recreating the volume. That only happens when you
  pass -Recreate, and only after an explicit warning.

  Recreating the volume requires administrator rights. The script prints the
  exact command to run elevated rather than trying to elevate itself.

.PARAMETER Recreate
  Recreate the R: volume if it is missing or the wrong size. DESTROYS any
  contents currently on R:.

.PARAMETER SizeMB
  Size for the recreated volume, in megabytes. Default 4096.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\ramdisk.ps1
#>
[CmdletBinding()]
param(
  [switch]$Recreate,
  [int]$SizeMB = 4096
)

$ErrorActionPreference = 'Stop'
$driveLetter = 'R'
$expectedLabel = 'RAMDISK'

function Get-RamDisk {
  param([string]$Letter)
  $vol = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${Letter}:'" -ErrorAction SilentlyContinue
  return $vol
}

$vol = Get-RamDisk -Letter $driveLetter

if ($vol) {
  Write-Host "[ramdisk] ${driveLetter}: is mounted" -ForegroundColor Green
  Write-Host "          label: $($vol.VolumeName)"
  Write-Host "          size : $([math]::Round($vol.Size / 1MB)) MB"
  Write-Host "          free : $([math]::Round($vol.FreeSpace / 1MB)) MB"

  if ($vol.VolumeName -ne $expectedLabel) {
    Write-Warning "[ramdisk] ${driveLetter}: is not labelled '$expectedLabel'. It may not be the RAM disk. Leaving it alone."
    exit 1
  }

  $scratch = "${driveLetter}:\Temp\ff"
  if (-not (Test-Path $scratch)) {
    New-Item -ItemType Directory -Path $scratch -Force | Out-Null
    Write-Host "[ramdisk] created scratch directory $scratch"
  } else {
    Write-Host "[ramdisk] scratch directory $scratch already present"
  }

  Write-Host "[ramdisk] OK - run scripts\dev-env.cmd to use it."
  exit 0
}

Write-Warning "[ramdisk] ${driveLetter}: is not mounted."

if (-not $Recreate) {
  Write-Host ""
  Write-Host "Nothing was changed. To create it, run this in an ADMIN terminal:"
  Write-Host ""
  Write-Host "  imdisk -a -t vm -s ${SizeMB}M -m ${driveLetter}: -p `"/fs:ntfs /q /y /v:$expectedLabel`""
  Write-Host ""
  Write-Host "Or re-run this script with -Recreate from an admin terminal."
  Write-Host ""
  Write-Host "Reminder: a RAM disk is volatile. Anything on it is lost on reboot."
  Write-Host "Use scripts\ramdisk-save.ps1 before shutting down if it holds real files."
  exit 1
}

Write-Warning "Recreating ${driveLetter}: will DESTROY everything currently on it."
$answer = Read-Host "Type 'yes' to continue"
if ($answer -ne 'yes') {
  Write-Host "Aborted. Nothing was changed."
  exit 1
}

$imdisk = Get-Command imdisk -ErrorAction SilentlyContinue
if (-not $imdisk) {
  Write-Error "[ramdisk] imdisk was not found on PATH. Install ImDisk Toolkit first."
  exit 1
}

& imdisk -a -t vm -s "${SizeMB}M" -m "${driveLetter}:" -p "/fs:ntfs /q /y /v:$expectedLabel"

if ($LASTEXITCODE -ne 0) {
  Write-Error "[ramdisk] imdisk exited with code $LASTEXITCODE. Administrator rights are required."
  exit $LASTEXITCODE
}

Write-Host "[ramdisk] ${driveLetter}: created." -ForegroundColor Green
