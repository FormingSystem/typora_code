@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall_windows.ps1" %*
set "uninstall_exit_code=%errorlevel%"
if not "%uninstall_exit_code%"=="0" (
    echo.
    echo Typora Code uninstall failed. Review the error above; no backup is deleted.
)
pause
exit /b %uninstall_exit_code%
