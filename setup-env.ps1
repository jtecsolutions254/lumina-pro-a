$ErrorActionPreference = "Stop"
$key = Read-Host "Paste your NEW Gemini API key"
@"
PORT=8080
MONGODB_URI=mongodb://127.0.0.1:27017/lumina_pro_ai
MONGODB_DB=lumina_pro_ai
GEMINI_API_KEY=$key
LUMINA_AI_MODEL=gemini-3.5-flash
LUMINA_CHAT_MODEL=gemini-3.5-flash
LUMINA_PROMPT_MODEL=gemini-3.5-flash
LUMINA_AI_FALLBACK_MODELS=gemini-3-flash-preview,gemini-2.5-flash,gemini-1.5-flash
LUMINA_IMAGE_PROVIDER=auto
LUMINA_IMAGE_MODEL=gemini-3.1-flash-image-preview
LUMINA_IMAGE_FALLBACK_PROVIDER=pollinations
LUMINA_POLLINATIONS_MODEL=flux
LUMINA_LOCAL_SD_ENDPOINT=http://127.0.0.1:7860/sdapi/v1/txt2img
LUMINA_LOCAL_SD_STEPS=28
LUMINA_LOCAL_SD_CFG=7
LUMINA_LOCAL_SD_DENOISE=0.55
"@ | Set-Content -Path .env -Encoding UTF8
Write-Host ".env created. Now run: npm run dev"
