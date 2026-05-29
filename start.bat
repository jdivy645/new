@echo off
REM ===========================================================================
REM  Digital Hammerr — World Environment Day installation launcher (Windows).
REM  Serves the React landing at / and the gesture app at /app, and opens
REM  Chrome in fullscreen kiosk mode with the camera auto-allowed.
REM  (Build the landing once first:  cd landing  &&  npm install  &&  npm run build)
REM ===========================================================================
cd /d "%~dp0"
set PORT=8000
set URL=http://localhost:%PORT%

if not exist "landing\dist\index.html" (
  echo [note] Landing not built yet -- root will show the gesture app directly.
  echo        To build the Digital Hammerr home page:  cd landing  ^&^&  npm install  ^&^&  npm run build
)
echo Starting local server on %URL% ...

REM --- start the server (Node preferred; falls back to Python) ---
where node >nul 2>nul
if %errorlevel%==0 (
  start "WED server" /min cmd /c "node server.js"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    start "WED server" /min cmd /c "python -m http.server %PORT%"
  ) else (
    echo.
    echo  Neither Node.js nor Python found. Install one, or run:  npx serve
    echo  Then open %URL% in Chrome.
    pause
    exit /b 1
  )
)

REM give the server a moment
ping -n 2 127.0.0.1 >nul

REM --- launch Chrome in kiosk mode, camera auto-granted ---
set CHROME=
where chrome >nul 2>nul && set CHROME=chrome
if "%CHROME%"=="" if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if "%CHROME%"=="" if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

set FLAGS=--kiosk --app=%URL% --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream --start-fullscreen --disable-translate --disable-features=Translate --overscroll-history-navigation=0 --user-data-dir="%TEMP%\wed-kiosk-profile"

if "%CHROME%"=="" (
  echo Chrome not found - opening default browser instead.
  start "" %URL%
) else (
  start "" %CHROME% %FLAGS%
)

echo.
echo  Running. To stop: close Chrome (Alt+F4) and the minimized server window.
echo  Operator tips: M = mute, H = help, F = fullscreen, Ctrl+Alt+R (hold) = reset today's counters.
