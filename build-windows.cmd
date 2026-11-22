@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "BOTC_WINDOWS_BUILD_ROOT=%~dp0project"
set "build_command=$root = $env:BOTC_WINDOWS_BUILD_ROOT; $scriptPath = Join-Path $root 'scripts\build-windows.ps1';"
rem Read the UTF-8 script explicitly for Windows PowerShell 5.1.
set "build_command=%build_command% & ([scriptblock]::Create([IO.File]::ReadAllText($scriptPath))) -ProjectRoot $root"

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "%build_command%"
set "build_status=%errorlevel%"
if not "%build_status%"=="0" echo Build failed. See the error above.
pause
exit /b %build_status%
