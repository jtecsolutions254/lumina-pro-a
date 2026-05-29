import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import {
  addChatMessages,
  addConversationMessages,
  appendImageEdit,
  checkDatabase,
  createConversation,
  createImageGeneration,
  createProject,
  createSession,
  createUser,
  deleteImage,
  deleteProject,
  deleteConversation,
  deleteSession,
  findUserByEmail,
  getConversation,
  getImage,
  getProject,
  getUserBySession,
  GUEST_OWNER_ID,
  linkImageToProject,
  listConversations,
  listImages,
  listProjects,
  patchProject,
  replaceFile,
  saveImage,
  updateProjectFiles
} from "./db";
import { callImageProvider, chatWithGemini, enhancePromptWithGemini, generateCodeWithGemini } from "./providers";
import type { ChatMessage, ConversationKind, ReferenceImageInput, TemplateKind, UserRecord } from "../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SESSION_COOKIE = "lumina_session";

function loadLocalEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadLocalEnv();

const port = Number(process.env.PORT || 8080);
const isProduction = process.env.NODE_ENV === "production";
const app = express();
app.use(express.json({ limit: "45mb" }));

declare global {
  namespace Express {
    interface Request { user?: UserRecord | null; ownerId?: string; }
  }
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

function setSessionCookie(res: express.Response, token: string) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
}

function clearSessionCookie(res: express.Response) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function attachUser(req: express.Request, _res: express.Response, next: express.NextFunction) {
  loadLocalEnv();
  const cookieToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  const authHeader = String(req.headers.authorization || "");
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const token = bearerToken || cookieToken;
  req.user = await getUserBySession(token);
  req.ownerId = req.user?.id || GUEST_OWNER_ID;
  next();
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", String(req.headers.origin || "*"));
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(attachUser);

function asyncRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function publicProviderStatus() {
  return {
    brand: "Lumina AI",
    textModel: process.env.LUMINA_AI_MODEL || "gemini-3.5-flash",
    imageModel: "Lumina visual engine",
    imageProvider: "Lumina AI",
    configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.LUMINA_AI_API_KEY)
  };
}

function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sign in required. Create a Lumina AI account or sign in to access this feature." });
  req.ownerId = req.user.id;
  next();
}

function safeReferenceImage(value: any): ReferenceImageInput | undefined {
  if (!value?.dataUrl || typeof value.dataUrl !== "string") return undefined;
  if (!value.dataUrl.startsWith("data:image/")) throw new Error("Reference image must be a PNG, JPEG, WebP, or other browser image data URL.");
  if (value.dataUrl.length > 12_000_000) throw new Error("Reference image is too large. Use an image under roughly 8 MB.");
  return { dataUrl: value.dataUrl, mimeType: String(value.mimeType || ""), name: String(value.name || "reference image") };
}

app.get("/api/auth/me", asyncRoute(async (req, res) => {
  res.json({ user: req.user || null, ownerId: req.ownerId });
}));

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email.includes("@")) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const user = await createUser(name, email, hashPassword(password));
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.json({ user, token });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const stored = await findUserByEmail(email);
  if (!stored || !verifyPassword(password, stored.passwordHash)) return res.status(401).json({ error: "Invalid email or password." });
  const token = await createSession(stored.id);
  setSessionCookie(res, token);
  res.json({ user: { id: stored.id, name: stored.name, email: stored.email, createdAt: stored.createdAt }, token });
}));

app.post("/api/auth/logout", asyncRoute(async (req, res) => {
  const cookieToken = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  const authHeader = String(req.headers.authorization || "");
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  await deleteSession(bearerToken || cookieToken);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.use(["/api/system", "/api/projects", "/api/ai", "/api/chat", "/api/images"], requireUser);

app.get("/api/system/health", asyncRoute(async (req, res) => {
  const db = await checkDatabase();
  const ownerId = req.ownerId || GUEST_OWNER_ID;
  const [projects, images, chats] = await Promise.all([listProjects(ownerId), listImages(ownerId), listConversations(ownerId, "general")]);
  res.json({ db, projects: projects.length, images: images.length, chats: chats.length, server: "vite-express", time: new Date().toISOString(), ai: publicProviderStatus() });
}));

app.get("/api/projects", asyncRoute(async (req, res) => res.json({ projects: await listProjects(req.ownerId) })));

app.post("/api/projects", asyncRoute(async (req, res) => {
  const allowed = ["portfolio", "saas", "dashboard", "ecommerce", "blog", "admin"];
  const template: TemplateKind = allowed.includes(req.body?.template) ? req.body.template : "saas";
  const project = await createProject(req.ownerId, req.body?.name || "Untitled Lumina Project", req.body?.description || "AI-generated workspace", template);
  res.json({ project });
}));

app.get("/api/projects/:id", asyncRoute(async (req, res) => {
  const project = await getProject(req.ownerId, req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json({ project });
}));


app.delete("/api/projects/:id", asyncRoute(async (req, res) => {
  await deleteProject(req.ownerId || GUEST_OWNER_ID, req.params.id);
  res.json({ ok: true });
}));

app.put("/api/projects/:id/files", asyncRoute(async (req, res) => res.json({ project: await replaceFile(req.ownerId || GUEST_OWNER_ID, req.params.id, req.body) })));

app.get("/api/projects/:id/export", asyncRoute(async (req, res) => {
  const project = await getProject(req.ownerId, req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const zip = new JSZip();
  for (const file of project.files) zip.file(file.path, file.content);
  zip.file("lumina-project.json", JSON.stringify(project, null, 2));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "lumina-project";
  res.setHeader("content-type", "application/zip");
  res.setHeader("content-disposition", `attachment; filename="${safeName}.zip"`);
  res.send(buffer);
}));

app.post("/api/ai/chat", asyncRoute(async (req, res) => {
  const ownerId = req.ownerId || GUEST_OWNER_ID;
  const { projectId, message } = req.body || {};
  if (!projectId || !message) return res.status(400).json({ error: "projectId and message are required" });
  const project = await getProject(ownerId, String(projectId));
  if (!project) return res.status(404).json({ error: "Project not found" });
  const messageText = String(message).trim();
  const userMessage: ChatMessage = { id: randomUUID(), role: "user", content: messageText, createdAt: new Date().toISOString() };
  await addChatMessages(ownerId, project.id, [userMessage]);
  const agent = await generateCodeWithGemini({ message: messageText, projectName: project.name, files: project.files });
  const updatedProject = await updateProjectFiles(ownerId, project.id, agent.changes, `Lumina AI generated: ${messageText.slice(0, 76)}`);
  const assistantMessage: ChatMessage = { id: randomUUID(), role: "assistant", content: agent.reply, createdAt: new Date().toISOString(), metadata: { changes: agent.changes.map(({ path, action, summary }) => ({ path, action, summary })) } };
  const finalProject = await patchProject(ownerId, project.id, { messages: [...updatedProject.messages, assistantMessage].slice(-180), tasks: agent.tasks.length ? agent.tasks : updatedProject.tasks, updatedAt: new Date().toISOString() });
  res.json({ project: finalProject, reply: assistantMessage, changes: agent.changes });
}));

app.get("/api/chat/conversations", asyncRoute(async (req, res) => {
  const kind: ConversationKind = req.query.kind === "image" ? "image" : "general";
  let conversations = await listConversations(req.ownerId, kind);
  if (conversations.length === 0) conversations = [await createConversation(req.ownerId, kind, kind === "image" ? "Lumina Image Studio" : "New Lumina Chat")];
  res.json({ conversations });
}));

app.post("/api/chat/conversations", asyncRoute(async (req, res) => {
  const kind: ConversationKind = req.body?.kind === "image" ? "image" : "general";
  const conversation = await createConversation(req.ownerId, kind, String(req.body?.title || (kind === "image" ? "Lumina Image Studio" : "New Lumina Chat")));
  res.json({ conversation });
}));


app.delete("/api/chat/conversations/:id", asyncRoute(async (req, res) => {
  await deleteConversation(req.ownerId || GUEST_OWNER_ID, req.params.id);
  res.json({ ok: true });
}));

app.post("/api/chat/:id/message", asyncRoute(async (req, res) => {
  const ownerId = req.ownerId || GUEST_OWNER_ID;
  const conversation = await getConversation(ownerId, req.params.id, "general");
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  const text = String(req.body?.message || "").trim();
  if (!text) return res.status(400).json({ error: "Message is required." });
  const userMessage: ChatMessage = { id: randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() };
  const replyText = await chatWithGemini([...conversation.messages, userMessage]);
  const assistantMessage: ChatMessage = { id: randomUUID(), role: "assistant", content: replyText, createdAt: new Date().toISOString() };
  const updated = await addConversationMessages(ownerId, conversation.id, [userMessage, assistantMessage]);
  res.json({ conversation: updated, reply: assistantMessage });
}));

app.get("/api/images", asyncRoute(async (req, res) => res.json({ images: await listImages(req.ownerId) })));

app.post("/api/images/generate", asyncRoute(async (req, res) => {
  const ownerId = req.ownerId || GUEST_OWNER_ID;
  const prompt = String(req.body?.prompt || "").trim();
  const style = String(req.body?.style || "Cinematic");
  const aspectRatio = String(req.body?.aspectRatio || "1:1");
  const conversationId = String(req.body?.conversationId || "");
  const editImageId = req.body?.editImageId ? String(req.body.editImageId) : "";
  if (prompt.length < 3) return res.status(400).json({ error: "Prompt must be at least 3 characters." });
  const conversation = conversationId ? await getConversation(ownerId, conversationId, "image") : await getConversation(ownerId, null, "image");
  const editTarget = editImageId ? await getImage(ownerId, editImageId) : null;
  const referenceImage = safeReferenceImage(req.body?.referenceImage);
  const priorMessages = conversation?.messages || [];
  const enhancedPrompt = await enhancePromptWithGemini({ prompt, style, aspectRatio, referenceImage, editTargetImageUrl: editTarget?.imageUrl, priorMessages });
  const providerImage = await callImageProvider({ prompt, enhancedPrompt, style, aspectRatio, referenceImage, editTargetImageUrl: editTarget?.imageUrl, priorMessages });
  const image = await createImageGeneration(ownerId, { prompt, enhancedPrompt, style, aspectRatio, imageUrl: providerImage.imageUrl, provider: "lumina-ai", referenceImageUrl: referenceImage?.dataUrl, parentImageId: editImageId || undefined, linkedProjectIds: [], saved: true, editHistory: [] });
  if (editImageId) await appendImageEdit(ownerId, editImageId, image.id, prompt);
  let updatedConversation = conversation;
  if (conversation) {
    const userMessage: ChatMessage = { id: randomUUID(), role: "user", content: editImageId ? `Edit image: ${prompt}` : prompt, createdAt: new Date().toISOString(), metadata: { referenceImage: Boolean(referenceImage), editImageId: editImageId || undefined } };
    const assistantMessage: ChatMessage = { id: randomUUID(), role: "assistant", content: editImageId ? "I edited the selected visual with Lumina AI and saved the new version." : "I generated and saved a new Lumina AI visual asset.", createdAt: new Date().toISOString(), metadata: { imageId: image.id } };
    updatedConversation = await addConversationMessages(ownerId, conversation.id, [userMessage, assistantMessage]);
  }
  res.json({ image, conversation: updatedConversation });
}));

app.post("/api/images/:id/use-in-project", asyncRoute(async (req, res) => {
  if (!req.body?.projectId) return res.status(400).json({ error: "projectId is required" });
  const project = await linkImageToProject(req.ownerId || GUEST_OWNER_ID, String(req.body.projectId), req.params.id);
  res.json({ project });
}));

app.post("/api/images/:id/save", asyncRoute(async (req, res) => res.json({ image: await saveImage(req.ownerId || GUEST_OWNER_ID, req.params.id) })));
app.delete("/api/images/:id", asyncRoute(async (req, res) => { await deleteImage(req.ownerId || GUEST_OWNER_ID, req.params.id); res.json({ ok: true }); }));

if (isProduction) {
  const clientDist = path.join(root, "dist", "client");
  app.use(express.static(clientDist));
  app.use((_req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    try {
      let template = fs.readFileSync(path.join(root, "index.html"), "utf-8");
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "content-type": "text/html" }).end(template);
    } catch (error) { vite.ssrFixStacktrace(error as Error); next(error); }
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  console.error(message);
  res.status(500).json({ error: message });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Lumina Pro AI running at http://localhost:${port}`);
  console.log("Builder: http://localhost:" + port + "/workspace");
  console.log("Image Studio: http://localhost:" + port + "/studio");
  console.log("Lumina Chat: http://localhost:" + port + "/chat");
  console.log("Gemini configured:", Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.LUMINA_AI_API_KEY) ? "yes" : "no");
  console.log("Text model:", process.env.LUMINA_AI_MODEL || "gemini-3.5-flash");
  console.log("Image provider: Lumina AI");
});
