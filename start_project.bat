@echo off
echo Starting Project Document with Docker Compose...
echo Building and recreating containers...

docker compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo -----------------------------------------------------
    echo ERROR: Failed to start the project.
    echo Please make sure Docker Desktop is open and running.
    echo -----------------------------------------------------
    pause
    exit /b %errorlevel%
)

echo.
echo -----------------------------------------------------
echo SUCCESS! The project is now running in the background.
echo.
echo You can access the website at:
echo   Frontend:    http://localhost:3000
echo   Backend API: http://localhost:8080/healthz
echo.
echo To view logs, use: docker compose logs -f
echo To stop,     use: docker compose down
echo -----------------------------------------------------
pause
