@echo off
setlocal DisableDelayedExpansion
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 goto missing_node
node "%~dp0skills\zhonghua-shisi\scripts\workbench.mjs" start "%~dp0."
if errorlevel 1 goto failed
exit /b 0
:missing_node
echo Node.js 22.13+ is required. See README.md, then reopen WorkBuddy.
:failed
pause
exit /b 1
