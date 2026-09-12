@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_windows.ps1" %*
set "install_exit_code=%errorlevel%"
if not "%install_exit_code%"=="0" (
    echo.
    echo Typora Code installation failed. Review the error above; no backup is deleted.
) else (
    echo.
    echo Typora Code installation completed. Keep the backup path shown above.
)
pause
exit /b %install_exit_code%
