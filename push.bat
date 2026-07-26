@echo off
echo === Sthara School OS — Git Push ===
cd /d "C:\Users\user\.gemini\antigravity\scratch\sthara_school_os"
echo.
echo [1/3] Staging all changes...
git add -A
echo.
echo [2/3] Committing...
git commit -m "fix: migrate all AI routes from @google/generative-ai to @google/genai v2 SDK using gemini-2.0-flash"
echo.
echo [3/3] Pushing to origin/main (triggers Vercel auto-deploy)...
git push origin main
echo.
echo === Done! Check Vercel dashboard for deployment status ===
pause
