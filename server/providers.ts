import { randomUUID } from "node:crypto";
import type { ChatMessage, FileChange, FileRecord, ProviderCodeOutput, ProviderImageInput, ProviderTextInput, TaskRecord } from "../shared/types";
import { normalizeProjectPath } from "./utils";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function requireGeminiKey() {
  const apiKey = env("GEMINI_API_KEY") || env("GOOGLE_API_KEY") || env("LUMINA_AI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required. Add it to .env so Lumina Pro AI can generate real code, chat replies, and image prompts.");
  }
  return apiKey;
}

function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts || data?.candidates?.[0]?.content?.Parts || [];
  return parts.map((part: any) => part.text || part.Text || "").join("\n").trim();
}

async function postGemini(model: string, body: unknown) {
  const apiKey = requireGeminiKey();
  const response = await fetch(geminiEndpoint(model), {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.raw || `Gemini request failed with HTTP ${response.status}`;
    throw new Error(`[${model}] ${message}`);
  }
  return data;
}

function textFromBody(body: any) {
  const systemText = body?.systemInstruction?.parts?.map((part: any) => part.text || "").join("\n") || "";
  const userText = body?.contents?.map((content: any) => content?.parts?.map((part: any) => part.text || "").join("\n")).join("\n\n") || "";
  return { systemText, userText, temperature: body?.generationConfig?.temperature };
}

function asGeminiLike(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

async function postOpenRouterText(body: unknown) {
  const apiKey = env("OPENROUTER_API_KEY") || env("LUMINA_OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  const { systemText, userText, temperature } = textFromBody(body as any);
  const model = env("LUMINA_OPENROUTER_CODE_MODEL") || env("LUMINA_OPENROUTER_MODEL") || "google/gemini-flash-1.5";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}`, "HTTP-Referer": "http://localhost:8080", "X-Title": "Lumina Pro AI" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: systemText }, { role: "user", content: userText }], temperature: temperature ?? 0.65 })
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.error?.message || data?.raw || `OpenRouter request failed with HTTP ${response.status}`);
  return asGeminiLike(data?.choices?.[0]?.message?.content || "");
}

async function postOllamaText(body: unknown) {
  const baseUrl = env("OLLAMA_BASE_URL") || env("LUMINA_OLLAMA_BASE_URL");
  if (!baseUrl) throw new Error("OLLAMA_BASE_URL is not configured.");
  const { systemText, userText, temperature } = textFromBody(body as any);
  const model = env("LUMINA_OLLAMA_CODE_MODEL") || env("LUMINA_OLLAMA_MODEL") || "qwen2.5-coder:7b";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages: [{ role: "system", content: systemText }, { role: "user", content: userText }], options: { temperature: temperature ?? 0.55 } })
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.error || data?.raw || `Ollama request failed with HTTP ${response.status}`);
  return asGeminiLike(data?.message?.content || data?.response || "");
}

function shouldTryNextTextProvider(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ["not found", "not supported", "permission", "unavailable", "404", "429", "quota", "rate", "billing", "limit", "high demand", "overloaded", "503", "500", "required"].some((term) => message.includes(term));
}

function textModelCandidates(primary: string) {
  const configured = env("LUMINA_AI_FALLBACK_MODELS").split(",").map((model) => model.trim()).filter(Boolean);
  const stableDefaults = ["gemini-3.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-1.5-flash"];
  return Array.from(new Set([primary, ...configured, ...stableDefaults].filter(Boolean)));
}

async function postGeminiTextWithFallback(primaryModel: string, body: unknown) {
  const errors: string[] = [];
  const hasGeminiKey = Boolean(env("GEMINI_API_KEY") || env("GOOGLE_API_KEY") || env("LUMINA_AI_API_KEY"));
  if (hasGeminiKey) {
    for (const model of textModelCandidates(primaryModel)) {
      try { return await postGemini(model, body); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        if (!shouldTryNextTextProvider(error)) break;
      }
    }
  } else {
    errors.push("Gemini key is not configured.");
  }
  if (env("OPENROUTER_API_KEY") || env("LUMINA_OPENROUTER_API_KEY")) {
    try { return await postOpenRouterText(body); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (env("OLLAMA_BASE_URL") || env("LUMINA_OLLAMA_BASE_URL")) {
    try { return await postOllamaText(body); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  throw new Error(`Lumina AI code generation failed across available providers. ${errors.join(" | ")}`);
}

function extractJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  throw new Error("Lumina AI returned text, but not valid JSON. Ask again with a more specific build request.");
}

function summarizeFiles(files: FileRecord[]) {
  return files.slice(0, 28).map((file) => `FILE: ${file.path}\n${file.content.slice(0, 14000)}`).join("\n\n---\n\n");
}

function normalizeAction(action: unknown): FileChange["action"] {
  if (action === "create" || action === "update" || action === "delete") return action;
  return "update";
}

function normalizeChanges(raw: unknown): FileChange[] {
  if (!Array.isArray(raw)) throw new Error("Lumina AI response must include a changes array.");
  const changes = raw.map((item: any) => {
    const path = normalizeProjectPath(String(item?.path || ""));
    const action = normalizeAction(item?.action);
    if (action !== "delete" && typeof item?.content !== "string") throw new Error(`Lumina AI change for ${path} is missing file content.`);
    return { path, action, content: action === "delete" ? undefined : String(item.content), summary: String(item?.summary || `${action} ${path}`) } satisfies FileChange;
  });
  const hasHtml = changes.some((change) => change.path.endsWith(".html") && change.action !== "delete");
  const hasCss = changes.some((change) => change.path.endsWith(".css") && change.action !== "delete");
  const hasJs = changes.some((change) => change.path.endsWith(".js") && change.action !== "delete");
  if (!hasHtml || !hasCss || !hasJs) throw new Error("Lumina AI must return at least one HTML file, one CSS file, and one JavaScript file so the preview can run.");
  return changes.slice(0, 22);
}

function normalizeTasks(raw: unknown): TaskRecord[] {
  const now = new Date().toISOString();
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((item: any) => ({
    id: randomUUID(),
    title: String(item?.title || "Review generated result"),
    status: item?.status === "todo" || item?.status === "in_progress" || item?.status === "blocked" || item?.status === "done" ? item.status : "done",
    priority: item?.priority === "low" || item?.priority === "medium" || item?.priority === "high" ? item.priority : "medium",
    createdAt: now
  }));
}

export async function generateCodeWithGemini(input: ProviderTextInput): Promise<ProviderCodeOutput> {
  const model = env("LUMINA_AI_MODEL") || "gemini-3.5-flash";
  const currentFiles = summarizeFiles(input.files);
  const prompt = `You are Lumina Pro AI, an autonomous software builder.

USER REQUEST:\n${input.message}

PROJECT NAME:\n${input.projectName}

CURRENT PROJECT FILES:\n${currentFiles}

Generate a complete, working, prompt-specific static browser application. The preview runs in a sandboxed iframe, so the app must run with plain HTML, CSS, and browser JavaScript. Never return generic default Lumina content unless the user explicitly asks for Lumina branding.

Rules:
- Return only valid JSON. No markdown. No code fences.
- Be specific to the user's names, niche, content, features, and tone.
- Include complete file contents, not partial patches.
- Always include index.html, styles.css, and app.js in changes.
- Use semantic HTML, responsive CSS, accessible labels, and polished product-level UI.
- app.js should add useful interactions that match the requested app.
- Preserve and use linked image assets from assets/ if they exist.
- Do not include credential exfiltration, unsafe network abuse, or same-origin assumptions.

JSON schema:
{
  "reply": "brief explanation of what was generated and what to review",
  "changes": [
    { "path": "index.html", "action": "update", "summary": "...", "content": "complete file content" },
    { "path": "styles.css", "action": "update", "summary": "...", "content": "complete file content" },
    { "path": "app.js", "action": "update", "summary": "...", "content": "complete file content" }
  ],
  "tasks": [
    { "title": "Analyze user request", "status": "done", "priority": "high" },
    { "title": "Generate app files", "status": "done", "priority": "high" },
    { "title": "Review preview and refine", "status": "todo", "priority": "medium" }
  ]
}`;

  const data = await postGeminiTextWithFallback(model, {
    systemInstruction: { parts: [{ text: "Return strict JSON only. You are Lumina Pro AI, a software builder that creates complete static browser apps from prompts." }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: Number(env("LUMINA_CODE_TEMPERATURE") || 0.72), thinkingConfig: { thinkingLevel: env("LUMINA_THINKING_LEVEL") || "medium" }, responseMimeType: "application/json" }
  });
  const parsed = extractJsonObject(extractText(data));
  return { reply: String(parsed?.reply || `Generated a custom application for: ${input.message}`), changes: normalizeChanges(parsed?.changes), tasks: normalizeTasks(parsed?.tasks) };
}

export async function chatWithGemini(messages: ChatMessage[]): Promise<string> {
  const model = env("LUMINA_CHAT_MODEL") || env("LUMINA_AI_MODEL") || "gemini-3.5-flash";
  const recent = messages.slice(-24).map((message) => `${message.role === "user" ? "User" : "Lumina AI"}: ${message.content}`).join("\n\n");
  const data = await postGeminiTextWithFallback(model, {
    systemInstruction: { parts: [{ text: "You are Lumina AI, a helpful general assistant for software, business, writing, research, and creative tasks. Be direct, practical, and conversational." }] },
    contents: [{ role: "user", parts: [{ text: recent }] }],
    generationConfig: { temperature: 0.65, thinkingConfig: { thinkingLevel: "medium" } }
  });
  return extractText(data) || "I’m ready. What would you like to work on next?";
}

function describeReference(input: ProviderImageInput) {
  const refs: string[] = [];
  if (input.referenceImage?.dataUrl) refs.push(`PRIMARY REFERENCE IMAGE: The user uploaded ${input.referenceImage.name || "a reference image"}. Treat this uploaded image as the strongest visual source for the next generation. Preserve its key subject, composition, palette, typography/logo direction, transparency cues, and visual identity unless the user explicitly asks to change them.`);
  if (input.editTargetImageUrl) refs.push(input.referenceImage?.dataUrl ? "The user also selected a previous generated image, but the newly uploaded reference image takes priority over the selected image." : "The user is editing a previous generated image. Preserve the core composition unless the edit prompt asks for a larger change.");
  if (input.priorMessages?.length) refs.push(`Recent Image Studio conversation:\n${input.priorMessages.slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n")}`);
  return refs.join("\n");
}

export async function enhancePromptWithGemini(input: ProviderImageInput): Promise<string> {
  const model = env("LUMINA_PROMPT_MODEL") || env("LUMINA_AI_MODEL") || "gemini-3.5-flash";
  const data = await postGeminiTextWithFallback(model, {
    systemInstruction: { parts: [{ text: "You are Lumina AI's visual art director. Expand user image prompts into concise production-ready prompts. Return only the enhanced prompt text." }] },
    contents: [{ role: "user", parts: [{ text: `Base prompt: ${input.prompt}\nStyle: ${input.style}\nAspect ratio: ${input.aspectRatio}\n${describeReference(input)}\nRewrite this as a high-quality image generation prompt. Keep the user's intent. Add composition, lighting, materials, camera, mood, and edit/reference guidance. Do not add copyrighted characters or living artist style names.` }] }],
    generationConfig: { temperature: 0.55, thinkingConfig: { thinkingLevel: "low" } }
  });
  return extractText(data) || `${input.prompt}. ${input.style} style, polished composition, high detail.`;
}

function normalizeAspectRatio(ratio: string) {
  if (["1:1", "16:9", "9:16", "4:3", "3:4"].includes(ratio)) return ratio;
  return "1:1";
}

function dimensionsForRatio(ratio: string) {
  const normalized = normalizeAspectRatio(ratio);
  if (normalized === "16:9") return { width: 1280, height: 720 };
  if (normalized === "9:16") return { width: 720, height: 1280 };
  if (normalized === "4:3") return { width: 1024, height: 768 };
  if (normalized === "3:4") return { width: 768, height: 1024 };
  return { width: 1024, height: 1024 };
}

function bytesToBase64(bytes: ArrayBuffer) { return Buffer.from(bytes).toString("base64"); }

function parseDataUrl(dataUrl?: string) {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function isRecoverableImageProviderError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ["quota", "paid", "billing", "limit", "rate", "permission", "not found", "not supported", "did not return image", "unavailable"].some((term) => message.includes(term));
}

function extractInlineImage(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;
    const mimeType = inlineData?.mimeType || inlineData?.mime_type || "image/png";
    const bytes = inlineData?.data;
    if (bytes) return `data:${mimeType};base64,${bytes}`;
  }
  return null;
}

async function callGeminiNativeImage(input: ProviderImageInput & { enhancedPrompt?: string }) {
  const model = env("LUMINA_IMAGE_MODEL") || "gemini-3.1-flash-image-preview";
  const prompt = input.enhancedPrompt || input.prompt;
  const parts: any[] = [{ text: `Create exactly one original image for this user request.\n\nPrompt: ${prompt}\nStyle: ${input.style}\nAspect ratio: ${input.aspectRatio}.\n\nUse the uploaded/reference image only as guidance when supplied. Return image data.` }];
  const reference = parseDataUrl(input.referenceImage?.dataUrl) || parseDataUrl(input.editTargetImageUrl);
  if (reference) parts.push({ inlineData: { mimeType: reference.mimeType, data: reference.data } });
  const data = await postGemini(model, { contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } });
  const imageUrl = extractInlineImage(data);
  if (!imageUrl) throw new Error(extractText(data) || `Lumina image model did not return image data. Your API key may not have image quota yet.`);
  return { imageUrl, provider: "lumina-ai" };
}

async function callPollinations(input: ProviderImageInput & { enhancedPrompt?: string }) {
  const prompt = input.enhancedPrompt || input.prompt;
  const { width, height } = dimensionsForRatio(input.aspectRatio);
  const model = env("LUMINA_POLLINATIONS_MODEL") || "flux";
  const seed = encodeURIComponent(`${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const referenceNote = input.referenceImage?.dataUrl ? " Uploaded reference image supplied and should be treated as the primary visual direction; preserve its subject, composition, colors, logo/brand cues, and transparency/background intent." : input.editTargetImageUrl ? " Previous generated image selected for editing; preserve key visual direction where possible." : "";
  const encodedPrompt = encodeURIComponent(`${prompt}.${referenceNote} Style: ${input.style}. Aspect ratio: ${input.aspectRatio}.`);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${encodeURIComponent(model)}&seed=${seed}&nologo=true&enhance=false&safe=true`;
  const response = await fetch(url, { headers: { accept: "image/png,image/jpeg,image/webp,*/*" } });
  const contentType = response.headers.get("content-type") || "image/png";
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || `Lumina image request failed with HTTP ${response.status}`);
  if (!contentType.startsWith("image/")) throw new Error((await response.text().catch(() => "")) || "Lumina image engine did not return image data.");
  const bytes = await response.arrayBuffer();
  return { imageUrl: `data:${contentType};base64,${bytesToBase64(bytes)}`, provider: "lumina-ai" };
}

async function callLocalStableDiffusion(input: ProviderImageInput & { enhancedPrompt?: string }) {
  const endpoint = env("LUMINA_LOCAL_SD_ENDPOINT") || "http://127.0.0.1:7860/sdapi/v1/txt2img";
  const ratio = normalizeAspectRatio(input.aspectRatio);
  const [wRatio, hRatio] = ratio.split(":").map(Number);
  const base = 768;
  const width = wRatio >= hRatio ? 1024 : Math.round(base * (wRatio / hRatio));
  const height = hRatio >= wRatio ? 1024 : Math.round(base * (hRatio / wRatio));
  const initImage = parseDataUrl(input.referenceImage?.dataUrl) || parseDataUrl(input.editTargetImageUrl);
  const body: any = {
    prompt: input.enhancedPrompt || input.prompt,
    negative_prompt: env("LUMINA_LOCAL_SD_NEGATIVE") || "low quality, blurry, distorted, watermark, extra text",
    width: Math.max(512, Math.min(1024, width)),
    height: Math.max(512, Math.min(1024, height)),
    steps: Number(env("LUMINA_LOCAL_SD_STEPS") || 28),
    cfg_scale: Number(env("LUMINA_LOCAL_SD_CFG") || 7)
  };
  let url = endpoint;
  if (initImage) {
    url = endpoint.replace("/txt2img", "/img2img");
    body.init_images = [initImage.data];
    body.denoising_strength = Number(env("LUMINA_LOCAL_SD_DENOISE") || 0.55);
  }
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.detail || data?.error || data?.raw || `Lumina local image request failed with HTTP ${response.status}`);
  const bytes = data?.images?.[0];
  if (!bytes) throw new Error("Lumina local image engine did not return image bytes.");
  return { imageUrl: `data:image/png;base64,${bytes}`, provider: "lumina-ai-local" };
}

export async function callImageProvider(input: ProviderImageInput & { enhancedPrompt?: string }): Promise<{ imageUrl: string; provider: string }> {
  const provider = (env("LUMINA_IMAGE_PROVIDER") || "auto").toLowerCase();
  if (provider === "local-sd" || provider === "stable-diffusion" || provider === "automatic1111") return callLocalStableDiffusion(input);
  if (provider === "gemini") return callGeminiNativeImage(input);
  if (provider === "pollinations" || provider === "pollinations-ai") return callPollinations(input);

  const errors: string[] = [];
  try { return await callGeminiNativeImage(input); }
  catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    if (!isRecoverableImageProviderError(error)) throw error;
  }
  const fallback = (env("LUMINA_IMAGE_FALLBACK_PROVIDER") || "pollinations").toLowerCase();
  try {
    if (fallback === "local-sd" || fallback === "stable-diffusion" || fallback === "automatic1111") return await callLocalStableDiffusion(input);
    return await callPollinations(input);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    throw new Error(`Lumina AI could not generate the image: ${errors.join(" | ")}`);
  }
}
