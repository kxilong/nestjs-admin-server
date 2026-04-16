@echo off
setlocal ENABLEDELAYEDEXPANSION

cd /d "%~dp0"

echo [1/3] Build and start backend (app + db)...
docker compose up -d --build
if errorlevel 1 (
  echo [ERROR] docker compose up failed.
  exit /b 1
)

echo [2/3] Waiting for postgres healthcheck...
set "DB_OK="
for /l %%i in (1,1,30) do (
  set "DB_STATUS="
  for /f "delims=" %%s in ('docker inspect -f "{{.State.Health.Status}}" postgres-db 2^>nul') do set "DB_STATUS=%%s"
  if /i "!DB_STATUS!"=="healthy" (
    set "DB_OK=1"
    goto :db_ready
  )
  timeout /t 2 /nobreak >nul
)

:db_ready
if not defined DB_OK (
  echo [WARN] Postgres is not healthy yet, continue anyway.
) else (
  echo [OK] Postgres is healthy.
)

if /i "%~1"=="--backend-only" goto :done

echo [3/3] Start frontend dev server in a new window...
if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  call npm --prefix frontend install
  if errorlevel 1 (
    echo [ERROR] frontend npm install failed.
    exit /b 1
  )
)

start "frontend-dev" cmd /k "cd /d %~dp0frontend && npm run dev"

:done
echo.
echo [DONE]
echo Backend API: http://localhost:3000
echo Frontend:    http://localhost:5173
echo PostgreSQL:  127.0.0.1:5433
echo.
echo To stop backend containers: docker compose down

endlocal
