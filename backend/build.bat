@echo off
echo [1/4] Cleaning PyInstaller artifacts (Protecting Frontend)...

:: ONLY delete the PyInstaller build folder and spec files
if exist build rmdir /s /q build
if exist *.spec del /f /q *.spec

:: Check if your frontend dist exists.
:: If not, warn the user.
if not exist dist (
    echo WARNING: Frontend 'dist' folder not found! 
    echo Please run 'npm run build' or 'vite build' first.
    pause
    exit /b
)

echo [2/4] Starting PyInstaller build...
:: Standard stable command
pyinstaller --noconfirm --onefile --windowed --name "ST_NeuraNote" ^
--add-data "dist;dist" ^
--add-data "splash.png;." ^
--hidden-import "uvicorn.logging" ^
--hidden-import "uvicorn.loops" ^
--hidden-import "uvicorn.loops.auto" ^
--hidden-import "uvicorn.protocols" ^
--hidden-import "uvicorn.protocols.http" ^
--hidden-import "uvicorn.protocols.http.auto" ^
--hidden-import "uvicorn.protocols.websockets" ^
--hidden-import "uvicorn.protocols.websockets.auto" ^
--hidden-import "uvicorn.lifespan" ^
--hidden-import "uvicorn.lifespan.on" ^
--hidden-import "win32com" ^
--hidden-import "pythoncom" ^
--hidden-import "pandas" ^
--hidden-import "sqlite3" ^
--hidden-import "openpyxl" ^
--collect-submodules "webview" ^
--icon "favicon.ico" ^
backendtest.py

echo [3/4] Build Complete!
dir dist\ST_NeuraNote.exe

echo [4/4] Data Path: %%LOCALAPPDATA%%\ST_NeuraNote
pause