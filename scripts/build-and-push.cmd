@echo off
REM Windows helper: Command Prompt opens .ps1 in Notepad; this actually runs it.
cd /d "%~dp0\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-and-push.ps1" %*
