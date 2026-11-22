@echo off
setlocal EnableExtensions DisableDelayedExpansion

pushd "%~dp0project"
if errorlevel 1 (
    echo Could not open the project directory.
    pause
    exit /b 1
)

call npm.cmd run build
if "%errorlevel%"=="0" node.exe dist\web\server.js --open

set "web_status=%errorlevel%"
popd
if not "%web_status%"=="0" pause
exit /b %web_status%
