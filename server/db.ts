import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { createInitialTasks, createTemplateFiles } from "../shared/templates";
import type { ChatMessage, CommitRecord, ConversationKind, ConversationRecord, FileChange, FilePatchRecord, FileRecord, ImageGeneration, ProjectRecord, TemplateKind, UserRecord } from "../shared/types";
import { inferLanguage, normalizeProjectPath, shortDiff } from "./utils";

type StoredProject = Omit<ProjectRecord, "id"> & { _id?: ObjectId; id?: string };
type StoredImage = Omit<ImageGeneration, "id"> & { _id?: ObjectId; id?: string };
type StoredUser = UserRecord & { _id?: ObjectId; passwordHash: string };
type StoredSession = { _id?: ObjectId; token: string; userId: string; createdAt: string; expiresAt: string };
type StoredConversation = Omit<ConversationRecord, "id"> & { _id?: ObjectId; id?: string };

type MemoryStore = {
  users: StoredUser[];
  sessions: StoredSession[];
  projects: ProjectRecord[];
  images: ImageGeneration[];
  conversations: ConversationRecord[];
};

declare global {
  // eslint-disable-next-line no-var
  var __luminaMongoClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __luminaMemoryStore: MemoryStore | undefined;
}

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lumina_pro_ai";
const dbName = process.env.MONGODB_DB || "lumina_pro_ai";

export const GUEST_OWNER_ID = "guest";

function memoryStore() {
  if (!globalThis.__luminaMemoryStore) {
    globalThis.__luminaMemoryStore = { users: [], sessions: [], projects: [], images: [], conversations: [] };
  }
  return globalThis.__luminaMemoryStore;
}

async function getDb(): Promise<Db | null> {
  if (!uri) return null;
  try {
    const client = globalThis.__luminaMongoClient || new MongoClient(uri, { serverSelectionTimeoutMS: 350 });
    if (!globalThis.__luminaMongoClient) {
      await client.connect();
      globalThis.__luminaMongoClient = client;
    }
    await client.db(dbName).command({ ping: 1 });
    return client.db(dbName);
  } catch {
    return null;
  }
}

function objectIdQuery(id: string) { return ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id }; }
function ownerFilter(ownerId?: string) { return { ownerId: ownerId || GUEST_OWNER_ID }; }

function fromStoredProject(project: StoredProject): ProjectRecord {
  const id = project._id ? project._id.toHexString() : String(project.id);
  return { ...project, id, ownerId: project.ownerId || GUEST_OWNER_ID, linkedImageIds: project.linkedImageIds || [] } as ProjectRecord;
}

function fromStoredImage(image: StoredImage): ImageGeneration {
  const id = image._id ? image._id.toHexString() : String(image.id);
  return { ...image, id, ownerId: image.ownerId || GUEST_OWNER_ID, linkedProjectIds: image.linkedProjectIds || [], editHistory: image.editHistory || [], saved: image.saved !== false } as ImageGeneration;
}

function fromStoredConversation(conversation: StoredConversation): ConversationRecord {
  const id = conversation._id ? conversation._id.toHexString() : String(conversation.id);
  return { ...conversation, id, ownerId: conversation.ownerId || GUEST_OWNER_ID, messages: conversation.messages || [] } as ConversationRecord;
}

function publicUser(user: StoredUser): UserRecord {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

export async function checkDatabase() {
  const started = Date.now();
  const db = await getDb();
  if (!db) return { mode: "memory", ok: false, latencyMs: Date.now() - started, database: dbName, error: "MongoDB not reachable; using in-memory fallback." };
  return { mode: "mongodb", ok: true, latencyMs: Date.now() - started, database: dbName };
}

export async function createUser(name: string, email: string, passwordHash: string): Promise<UserRecord> {
  const cleanEmail = email.trim().toLowerCase();
  const now = new Date().toISOString();
  const user: StoredUser = { id: randomUUID(), name: name.trim() || cleanEmail.split("@")[0] || "Lumina User", email: cleanEmail, passwordHash, createdAt: now };
  const db = await getDb();
  if (!db) {
    const store = memoryStore();
    if (store.users.some((item) => item.email === cleanEmail)) throw new Error("An account with that email already exists.");
    store.users.push(user);
    return publicUser(user);
  }
  const exists = await db.collection<StoredUser>("users").findOne({ email: cleanEmail });
  if (exists) throw new Error("An account with that email already exists.");
  await db.collection<StoredUser>("users").insertOne(user);
  return publicUser(user);
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  const db = await getDb();
  if (!db) return memoryStore().users.find((item) => item.email === cleanEmail) || null;
  return db.collection<StoredUser>("users").findOne({ email: cleanEmail });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = await getDb();
  if (!db) {
    const user = memoryStore().users.find((item) => item.id === id);
    return user ? publicUser(user) : null;
  }
  const user = await db.collection<StoredUser>("users").findOne({ id });
  return user ? publicUser(user) : null;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID() + randomUUID();
  const now = new Date();
  const session: StoredSession = { token, userId, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString() };
  const db = await getDb();
  if (!db) memoryStore().sessions.push(session);
  else await db.collection<StoredSession>("sessions").insertOne(session);
  return token;
}

export async function getUserBySession(token?: string | null): Promise<UserRecord | null> {
  if (!token) return null;
  const db = await getDb();
  const now = new Date().toISOString();
  const session = !db ? memoryStore().sessions.find((item) => item.token === token && item.expiresAt > now) : await db.collection<StoredSession>("sessions").findOne({ token, expiresAt: { $gt: now } });
  if (!session) return null;
  return findUserById(session.userId);
}

export async function deleteSession(token?: string | null) {
  if (!token) return;
  const db = await getDb();
  if (!db) memoryStore().sessions = memoryStore().sessions.filter((item) => item.token !== token);
  else await db.collection<StoredSession>("sessions").deleteOne({ token });
}

export async function listProjects(ownerId = GUEST_OWNER_ID): Promise<ProjectRecord[]> {
  const db = await getDb();
  if (!db) {
    const store = memoryStore();
    if (!store.projects.some((project) => project.ownerId === ownerId)) await createProject(ownerId, "Lumina Pro Starter", "Unified AI software builder and image studio starter project.", "saas");
    return store.projects.filter((project) => project.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const items = await db.collection<StoredProject>("projects").find(ownerFilter(ownerId)).sort({ updatedAt: -1 }).toArray();
  if (items.length === 0) return [await createProject(ownerId, "Lumina Pro Starter", "Unified AI software builder and image studio starter project.", "saas")];
  return items.map(fromStoredProject);
}

export async function createProject(ownerId = GUEST_OWNER_ID, name = "Untitled Lumina Project", description = "AI-generated product workspace", template: TemplateKind = "saas"): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const cleanName = name.trim() || "Untitled Lumina Project";
  const project: ProjectRecord = {
    id: randomUUID(), ownerId, name: cleanName, description, runtime: "static-browser", template,
    files: createTemplateFiles(template, cleanName),
    messages: [{ id: randomUUID(), role: "assistant", content: `I created a ${template} workspace for ${cleanName}. Tell me what to build, redesign, debug, or connect with Image Studio assets.`, createdAt: now }],
    commits: [{ id: randomUUID(), message: `Create ${template} project`, author: "system", filesChanged: ["index.html", "styles.css", "app.js"], createdAt: now, patches: [] }],
    tasks: createInitialTasks(), linkedImageIds: [], createdAt: now, updatedAt: now
  };
  const db = await getDb();
  if (!db) { memoryStore().projects.unshift(project); return project; }
  const { id: _drop, ...stored } = project;
  const result = await db.collection<StoredProject>("projects").insertOne(stored);
  return { ...project, id: String(result.insertedId) };
}

export async function getProject(ownerId = GUEST_OWNER_ID, id?: string | null): Promise<ProjectRecord | null> {
  const db = await getDb();
  if (!db) {
    const projects = memoryStore().projects.filter((project) => project.ownerId === ownerId);
    if (projects.length === 0) await createProject(ownerId, "Lumina Pro Starter", "Unified AI software builder and image studio starter project.", "saas");
    return id ? memoryStore().projects.find((project) => project.ownerId === ownerId && project.id === id) || null : memoryStore().projects.find((project) => project.ownerId === ownerId) || null;
  }
  const query = id ? { ...objectIdQuery(id), ...ownerFilter(ownerId) } : ownerFilter(ownerId);
  const item = await db.collection<StoredProject>("projects").findOne(query, { sort: { updatedAt: -1 } });
  return item ? fromStoredProject(item) : null;
}

export async function deleteProject(ownerId: string, projectId: string) {
  const db = await getDb();
  if (!db) {
    const store = memoryStore();
    const before = store.projects.length;
    store.projects = store.projects.filter((project) => !(project.ownerId === ownerId && project.id === projectId));
    if (store.projects.length === before) throw new Error("Project not found");
    return;
  }
  const result = await db.collection<StoredProject>("projects").deleteOne({ ...objectIdQuery(projectId), ...ownerFilter(ownerId) });
  if (!result.deletedCount) throw new Error("Project not found");
}

export async function patchProject(ownerId: string, projectId: string, updates: Partial<ProjectRecord>) {
  const normalizedUpdates = { ...updates, updatedAt: updates.updatedAt || new Date().toISOString() };
  const db = await getDb();
  if (!db) {
    const store = memoryStore();
    const index = store.projects.findIndex((project) => project.ownerId === ownerId && project.id === projectId);
    if (index < 0) throw new Error("Project not found");
    store.projects[index] = { ...store.projects[index], ...normalizedUpdates };
    return store.projects[index];
  }
  await db.collection<StoredProject>("projects").updateOne({ ...objectIdQuery(projectId), ...ownerFilter(ownerId) }, { $set: normalizedUpdates });
  const project = await getProject(ownerId, projectId);
  if (!project) throw new Error("Project not found after update");
  return project;
}

export async function addChatMessages(ownerId: string, projectId: string, messages: ProjectRecord["messages"]) {
  const project = await getProject(ownerId, projectId);
  if (!project) throw new Error("Project not found");
  return patchProject(ownerId, projectId, { messages: [...project.messages, ...messages].slice(-180), updatedAt: new Date().toISOString() });
}

export async function updateProjectFiles(ownerId: string, projectId: string, changes: FileChange[], commitMessage = "Update files", author: CommitRecord["author"] = "ai") {
  const project = await getProject(ownerId, projectId);
  if (!project) throw new Error("Project not found");
  const now = new Date().toISOString();
  const nextFiles = [...project.files];
  const patches: FilePatchRecord[] = [];
  const changedPaths: string[] = [];
  for (const change of changes) {
    const cleanPath = normalizeProjectPath(change.path);
    const index = nextFiles.findIndex((file) => file.path === cleanPath);
    const oldContent = index >= 0 ? nextFiles[index].content : "";
    changedPaths.push(cleanPath);
    if (change.action === "delete") {
      if (index >= 0) nextFiles.splice(index, 1);
      patches.push({ id: randomUUID(), path: cleanPath, action: "delete", summary: change.summary, oldContent, diff: shortDiff(oldContent, "") });
      continue;
    }
    const newContent = change.content || "";
    const record: FileRecord = { path: cleanPath, content: newContent, language: inferLanguage(cleanPath), updatedAt: now };
    if (index >= 0) nextFiles[index] = record; else nextFiles.push(record);
    patches.push({ id: randomUUID(), path: cleanPath, action: index >= 0 ? "update" : "create", summary: change.summary, oldContent, newContent, diff: shortDiff(oldContent, newContent) });
  }
  const commit: CommitRecord = { id: randomUUID(), message: commitMessage, author, createdAt: now, filesChanged: Array.from(new Set(changedPaths)), patches };
  return patchProject(ownerId, project.id, { files: nextFiles, commits: [commit, ...project.commits].slice(0, 100), updatedAt: now });
}

export async function replaceFile(ownerId: string, projectId: string, file: FileRecord) {
  const cleanPath = normalizeProjectPath(file.path);
  const project = await getProject(ownerId, projectId);
  if (!project) throw new Error("Project not found");
  const exists = project.files.some((item) => item.path === cleanPath);
  return updateProjectFiles(ownerId, projectId, [{ path: cleanPath, content: file.content, action: exists ? "update" : "create", summary: "Manual file save from Code tab." }], `Manual save: ${cleanPath}`, "user");
}

export async function listImages(ownerId = GUEST_OWNER_ID): Promise<ImageGeneration[]> {
  const db = await getDb();
  if (!db) return memoryStore().images.filter((image) => image.ownerId === ownerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = await db.collection<StoredImage>("images").find(ownerFilter(ownerId)).sort({ createdAt: -1 }).toArray();
  return items.map(fromStoredImage);
}

export async function getImage(ownerId: string, id: string): Promise<ImageGeneration | null> {
  const db = await getDb();
  if (!db) return memoryStore().images.find((image) => image.ownerId === ownerId && image.id === id) || null;
  const item = await db.collection<StoredImage>("images").findOne({ ...objectIdQuery(id), ...ownerFilter(ownerId) });
  return item ? fromStoredImage(item) : null;
}

export async function createImageGeneration(ownerId: string, input: Omit<ImageGeneration, "id" | "ownerId" | "createdAt" | "updatedAt">): Promise<ImageGeneration> {
  const now = new Date().toISOString();
  const image: ImageGeneration = { id: randomUUID(), ownerId, createdAt: now, updatedAt: now, linkedProjectIds: [], editHistory: [], saved: true, ...input };
  const db = await getDb();
  if (!db) { memoryStore().images.unshift(image); return image; }
  const { id: _drop, ...stored } = image;
  const result = await db.collection<StoredImage>("images").insertOne(stored);
  return { ...image, id: String(result.insertedId) };
}

export async function saveImage(ownerId: string, id: string) {
  const db = await getDb();
  const updates = { saved: true, updatedAt: new Date().toISOString() };
  if (!db) {
    const index = memoryStore().images.findIndex((image) => image.ownerId === ownerId && image.id === id);
    if (index < 0) throw new Error("Image not found");
    memoryStore().images[index] = { ...memoryStore().images[index], ...updates };
    return memoryStore().images[index];
  }
  await db.collection<StoredImage>("images").updateOne({ ...objectIdQuery(id), ...ownerFilter(ownerId) }, { $set: updates });
  const image = await getImage(ownerId, id);
  if (!image) throw new Error("Image not found");
  return image;
}

export async function deleteImage(ownerId: string, id: string) {
  const db = await getDb();
  if (!db) {
    const before = memoryStore().images.length;
    memoryStore().images = memoryStore().images.filter((image) => !(image.ownerId === ownerId && image.id === id));
    if (memoryStore().images.length === before) throw new Error("Image not found");
    return;
  }
  const result = await db.collection<StoredImage>("images").deleteOne({ ...objectIdQuery(id), ...ownerFilter(ownerId) });
  if (!result.deletedCount) throw new Error("Image not found");
}

export async function appendImageEdit(ownerId: string, parentImageId: string, childImageId: string, prompt: string) {
  const parent = await getImage(ownerId, parentImageId);
  if (!parent) return;
  const edit = { id: childImageId, prompt, sourceImageId: parentImageId, createdAt: new Date().toISOString() };
  const nextHistory = [edit, ...(parent.editHistory || [])].slice(0, 30);
  const db = await getDb();
  if (!db) {
    const idx = memoryStore().images.findIndex((image) => image.ownerId === ownerId && image.id === parentImageId);
    if (idx >= 0) memoryStore().images[idx] = { ...memoryStore().images[idx], editHistory: nextHistory, updatedAt: new Date().toISOString() };
    return;
  }
  await db.collection<StoredImage>("images").updateOne({ ...objectIdQuery(parentImageId), ...ownerFilter(ownerId) }, { $set: { editHistory: nextHistory, updatedAt: new Date().toISOString() } });
}

export async function linkImageToProject(ownerId: string, projectId: string, imageId: string) {
  const project = await getProject(ownerId, projectId);
  const image = await getImage(ownerId, imageId);
  if (!project) throw new Error("Project not found");
  if (!image) throw new Error("Image not found");
  const safeName = image.prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50) || "lumina-image";
  const extension = image.imageUrl.startsWith("data:image/jpeg") ? "jpg" : image.imageUrl.startsWith("data:image/webp") ? "webp" : image.imageUrl.startsWith("data:image/svg") ? "svg" : "png";
  const assetPath = normalizeProjectPath(`assets/${safeName}-${image.id.slice(-6)}.${extension}`);
  const html = project.files.find((file) => file.path === "index.html")?.content || "";
  const alt = image.prompt.replace(/"/g, "'");
  const assetSection = `<section class="section" id="linked-assets"><h2>Linked Lumina visual asset</h2><div class="panel"><img src="${assetPath}" alt="${alt}" style="width:100%;border-radius:24px;border:1px solid rgba(255,255,255,.14)"/><p>${image.enhancedPrompt}</p></div></section>`;
  const nextHtml = html.includes(`src="${assetPath}"`) ? html : html.replace("<script src=\"app.js\"></script>", `${assetSection}<script src="app.js"></script>`);
  const updated = await updateProjectFiles(ownerId, projectId, [
    { path: assetPath, action: "create", content: image.imageUrl, summary: "Added Lumina-generated image as a project asset." },
    { path: "index.html", action: "update", content: nextHtml, summary: "Inserted the image asset into the live project preview." }
  ], `Link image asset: ${image.prompt.slice(0, 48)}`, "user");
  await patchProject(ownerId, projectId, { linkedImageIds: Array.from(new Set([...(updated.linkedImageIds || []), imageId])), updatedAt: new Date().toISOString() });
  const linkedProjectIds = Array.from(new Set([...(image.linkedProjectIds || []), projectId]));
  const db = await getDb();
  if (!db) {
    const idx = memoryStore().images.findIndex((item) => item.ownerId === ownerId && item.id === imageId);
    if (idx >= 0) memoryStore().images[idx] = { ...memoryStore().images[idx], linkedProjectIds };
    return getProject(ownerId, projectId);
  }
  await db.collection<StoredImage>("images").updateOne({ ...objectIdQuery(imageId), ...ownerFilter(ownerId) }, { $set: { linkedProjectIds } });
  return getProject(ownerId, projectId);
}

export async function listConversations(ownerId = GUEST_OWNER_ID, kind: ConversationKind = "general") {
  const db = await getDb();
  if (!db) return memoryStore().conversations.filter((item) => item.ownerId === ownerId && item.kind === kind).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const items = await db.collection<StoredConversation>("conversations").find({ ownerId, kind }).sort({ updatedAt: -1 }).toArray();
  return items.map(fromStoredConversation);
}

export async function createConversation(ownerId = GUEST_OWNER_ID, kind: ConversationKind = "general", title = kind === "image" ? "Image Studio conversation" : "New Lumina Chat") {
  const now = new Date().toISOString();
  const conversation: ConversationRecord = { id: randomUUID(), ownerId, kind, title, messages: [], createdAt: now, updatedAt: now };
  const db = await getDb();
  if (!db) { memoryStore().conversations.unshift(conversation); return conversation; }
  const { id: _drop, ...stored } = conversation;
  const result = await db.collection<StoredConversation>("conversations").insertOne(stored);
  return { ...conversation, id: String(result.insertedId) };
}

export async function getConversation(ownerId = GUEST_OWNER_ID, id?: string | null, kind: ConversationKind = "general") {
  const existing = await listConversations(ownerId, kind);
  if (id) return existing.find((item) => item.id === id) || null;
  return existing[0] || createConversation(ownerId, kind);
}

export async function deleteConversation(ownerId: string, conversationId: string) {
  const db = await getDb();
  if (!db) {
    const store = memoryStore();
    const before = store.conversations.length;
    store.conversations = store.conversations.filter((item) => !(item.ownerId === ownerId && item.id === conversationId));
    if (store.conversations.length === before) throw new Error("Conversation not found");
    return;
  }
  const result = await db.collection<StoredConversation>("conversations").deleteOne({ ...objectIdQuery(conversationId), ownerId });
  if (!result.deletedCount) throw new Error("Conversation not found");
}

export async function addConversationMessages(ownerId: string, conversationId: string, messages: ChatMessage[]) {
  const conversation = await getConversation(ownerId, conversationId, "general") || await getConversation(ownerId, conversationId, "image");
  if (!conversation) throw new Error("Conversation not found");
  const now = new Date().toISOString();
  const updates = { messages: [...conversation.messages, ...messages].slice(-180), updatedAt: now, title: conversation.title === "New Lumina Chat" && messages[0]?.content ? messages[0].content.slice(0, 54) : conversation.title };
  const db = await getDb();
  if (!db) {
    const idx = memoryStore().conversations.findIndex((item) => item.ownerId === ownerId && item.id === conversationId);
    if (idx < 0) throw new Error("Conversation not found");
    memoryStore().conversations[idx] = { ...memoryStore().conversations[idx], ...updates };
    return memoryStore().conversations[idx];
  }
  await db.collection<StoredConversation>("conversations").updateOne({ ...objectIdQuery(conversationId), ownerId }, { $set: updates });
  return getConversation(ownerId, conversationId, conversation.kind);
}
