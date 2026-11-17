@echo off
REM Launcher for minecraft-clone. Starts the dev server and opens the browser.
REM ES modules will not load over file://, so this is the supported entry point --
REM double-clicking index.html does not work and never will.

cd /d "%~dp0"

where py >nul 2>&1
if %errorlevel%==0 (
    py -3 serve.py %*
    goto :end
)

where python >nul 2>&1
if %errorlevel%==0 (
    python serve.py %*
    goto :end
)

echo.
echo   Python was not found on your PATH.
echo.
echo   This project has no dependencies at all, but it does need Python to serve
echo   the files over http:// -- browsers refuse to load ES modules from disk.
echo.
echo   Install from https://www.python.org/downloads/ and tick
echo   "Add Python to PATH" during setup.
echo.
pause

:end
