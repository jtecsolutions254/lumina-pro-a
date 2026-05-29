@echo off
cd /d "%~dp0"
if not exist .env call create-env.cmd
npm install --registry=https://registry.npmjs.org/
npm run dev
pause
