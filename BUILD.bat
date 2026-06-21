@echo off
REM WinLauncher Build Script
REM Creates standalone .exe file using PyInstaller

setlocal enabledelayedexpansion

echo.
echo ================================================
echo    WinLauncher - Build Executable Script
echo ================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed!
    echo.
    echo Please install Python 3.8 or higher from:
    echo https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [OK] Python is installed
python --version
echo.

echo Installing required packages...
echo.

REM Install build dependencies
pip install PyInstaller >nul 2>&1

if errorlevel 1 (
    echo ERROR: Failed to install PyInstaller!
    echo.
    echo Please run manually:
    echo   pip install -r requirements.txt
    echo   pip install PyInstaller
    echo.
    pause
    exit /b 1
)

echo [OK] All build tools installed

echo.
echo ================================================
echo       Building Executable...
echo ================================================
echo.
echo This will take a few minutes...
echo Please wait...
echo.

REM Run build script
python build.py

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    echo.
    echo Please check the error messages above
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo        BUILD SUCCESSFUL!
echo ================================================
echo.
echo Your executable is ready at:
echo   dist/WinLauncher.exe
echo.
echo You can now:
echo   1. Double-click WinLauncher.exe to run
echo   2. Copy it to any location
echo   3. Create shortcuts to it
echo   4. Share it with others
echo.
echo No Python installation needed on other computers!
echo.

REM Open dist folder
explorer.exe dist

pause
