@echo off
REM ---------------------------------------------------------------------------
REM  Flight Focus - local development environment
REM
REM  Points TEMP/TMP at the RAM disk so Vite, esbuild and vitest scratch files
REM  never wear the system SSD, and reminds you that Rust is compiled in CI.
REM
REM  Usage:
REM    scripts\dev-env.cmd                     open a shell with the scrubbed env
REM    scripts\dev-env.cmd npm run dev          run a single command
REM ---------------------------------------------------------------------------

if not exist "R:\" (
  echo [dev-env] R: is not mounted.
  echo [dev-env] Run scripts\ramdisk.ps1 to check or recreate the RAM disk.
  exit /b 1
)

set "SCRATCH=R:\Temp\ff"
if not exist "%SCRATCH%" mkdir "%SCRATCH%" >nul 2>&1

set "TEMP=%SCRATCH%"
set "TMP=%SCRATCH%"
REM Node's default heap is comfortable on a 20 GB machine; raise it a little so
REM tsc never trips over transient memory pressure.
set "NODE_OPTIONS=--max-old-space-size=4096"

echo [dev-env] TEMP / TMP  -^> %SCRATCH%
echo [dev-env] Rust builds  -^> GitHub Actions only. Do not run cargo here.

if "%~1"=="" (
  echo [dev-env] Opening a shell with this environment...
  cmd /k
) else (
  %*
)
