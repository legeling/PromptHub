@echo off
rem PromptHub release build launcher (double-click friendly).
rem Runs build-release.ps1 via Windows PowerShell with script policy bypass.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release.ps1"
