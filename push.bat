@echo off
echo === Sthara School OS — Git Push ===
cd /d "C:\Users\user\.gemini\antigravity\scratch\sthara_school_os"
echo.
echo [1/3] Staging all changes...
git add -A
echo.
echo [2/3] Committing...
git commit -m "fix: replace deprecated gemini-2.0-flash / gemini-2.5-pro model names with stable gemini-1.5-flash and gemini-1.5-pro"
echo.
echo [3/3] Pushing to origin/main (triggers Vercel auto-deploy)...
git push origin main
echo.
echo === Done! Check Vercel dashboard for deployment status ===
pause
