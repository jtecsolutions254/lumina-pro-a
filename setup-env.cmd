@echo off
cd /d "%~dp0"
(
  echo PORT=8080
  echo MONGODB_URI=mongodb://127.0.0.1:27017/lumina_pro_ai
  echo MONGODB_DB=lumina_pro_ai
  echo GEMINI_API_KEY=PASTE_YOUR_NEW_GEMINI_KEY_HERE
  echo LUMINA_AI_MODEL=gemini-3.5-flash
  echo LUMINA_CHAT_MODEL=gemini-3.5-flash
  echo LUMINA_PROMPT_MODEL=gemini-3.5-flash
  echo LUMINA_AI_FALLBACK_MODELS=gemini-3-flash-preview,gemini-2.5-flash,gemini-1.5-flash
  echo LUMINA_IMAGE_PROVIDER=auto
  echo LUMINA_IMAGE_MODEL=gemini-3.1-flash-image-preview
  echo LUMINA_IMAGE_FALLBACK_PROVIDER=pollinations
  echo LUMINA_POLLINATIONS_MODEL=flux
  echo LUMINA_LOCAL_SD_ENDPOINT=http://127.0.0.1:7860/sdapi/v1/txt2img
  echo LUMINA_LOCAL_SD_STEPS=28
  echo LUMINA_LOCAL_SD_CFG=7
  echo LUMINA_LOCAL_SD_DENOISE=0.55
) > .env
echo Created .env. Open it and replace PASTE_YOUR_NEW_GEMINI_KEY_HERE with your new Gemini API key.
