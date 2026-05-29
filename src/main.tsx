import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Edit3,
  FileCode2,
  History,
  Home,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  X
} from "lucide-react";
import type { ChatMessage, ConversationRecord, FileRecord, ImageGeneration, ProjectRecord, TemplateKind, UserRecord } from "../shared/types";
import { templateOptions } from "../shared/templates";
import "./styles.css";

type WorkspaceTab = "preview" | "code" | "system";
type HealthState = { db?: { mode: string; ok: boolean; latencyMs: number; database: string; error?: string }; projects?: number; images?: number; chats?: number; server?: string; ai?: { brand: string; textModel: string; imageModel: string; imageProvider: string; configured: boolean } };
type AuthState = { user: UserRecord | null; ownerId?: string; loading?: boolean };
type ReferenceImageState = { dataUrl: string; mimeType: string; name: string } | null;

const CHAT_WIDTH_KEY = "lumina-pro-builder-width";
const DEFAULT_CHAT_WIDTH = 380;
const MIN_CHAT_WIDTH = 300;
const MAX_CHAT_WIDTH = 560;

function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function roleLabel(role: ChatMessage["role"]) { return role === "user" ? "You" : role === "assistant" ? "Lumina AI" : "System"; }
function formatTime(value: string) { try { return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) }
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text || "Invalid server response" }; }
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data as T;
}

function buildStaticPreview(files: FileRecord[]) {
  const htmlFile = files.find((file) => file.path === "index.html") || files.find((file) => file.path.endsWith(".html"));
  let html = htmlFile?.content || "<main><h1>No index.html yet</h1></main>";
  for (const file of files) {
    if (file.path.endsWith(".css")) {
      const safe = file.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(`<link[^>]+href=["']${safe}["'][^>]*>`, "g"), `<style data-lumina-path="${file.path}">${file.content}</style>`);
    }
    if (file.path.endsWith(".js")) {
      const safe = file.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(`<script[^>]+src=["']${safe}["'][^>]*></script>`, "g"), `<script data-lumina-path="${file.path}">${file.content}<\/script>`);
    }
    if (file.path.startsWith("assets/") && file.content.startsWith("data:image/")) html = html.replaceAll(file.path, file.content);
  }
  const bridge = `<script>(function(){const send=(type,payload)=>parent.postMessage({source:'lumina-preview',type,payload},'*');['log','warn','error'].forEach(level=>{const original=console[level];console[level]=function(...args){send('console',{level,message:args.map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join(' ')});original.apply(console,args)}});window.addEventListener('error',event=>send('runtime-error',{message:event.message,line:event.lineno,column:event.colno}));})();<\/script>`;
  return html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : `${html}${bridge}`;
}

function fileToDataUrl(file: File): Promise<ReferenceImageState> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please upload an image file."));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Reference image must be under 8 MB."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.onload = () => resolve({ dataUrl: String(reader.result), mimeType: file.type, name: file.name });
    reader.readAsDataURL(file);
  });
}

function useAuthState() {
  const [auth, setAuth] = useState<AuthState>({ user: null, loading: true });
  async function refresh() {
    try { setAuth({ ...(await api<AuthState>("/api/auth/me")), loading: false }); } catch { setAuth({ user: null, loading: false }); }
  }
  useEffect(() => {
    refresh();
    const onAuth = () => refresh();
    window.addEventListener("lumina-auth-changed", onAuth);
    return () => window.removeEventListener("lumina-auth-changed", onAuth);
  }, []);
  return { auth, refresh };
}

function AuthModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      await api("/api/auth/" + mode, { method: "POST", body: JSON.stringify({ name, email, password }) });
      window.dispatchEvent(new Event("lumina-auth-changed"));
      onDone(); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed"); }
    finally { setLoading(false); }
  }
  return <div className="modal-backdrop">
    <form className="auth-modal" onSubmit={submit}>
      <button className="icon-button modal-close" type="button" onClick={onClose}><X size={16} /></button>
      <img className="modal-logo" src="/lumina-logo-mark.png" alt="Lumina AI" />
      <h2>{mode === "login" ? "Sign in to Lumina AI" : "Create your Lumina AI account"}</h2>
      <p>Save your chat history, generated images, projects, commits, and linked assets to your profile.</p>
      {error && <p className="warning">{error}</p>}
      {mode === "signup" && <input className="field" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
      <input className="field" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
      <button className="btn primary wide" disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : <UserRound size={16} />} {mode === "login" ? "Sign in" : "Create account"}</button>
      <button className="text-button" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </form>
  </div>;
}


function NavArrows({ light = false }: { light?: boolean }) {
  return <div className={`nav-arrows ${light ? "light" : ""}`}>
    <button type="button" title="Back" onClick={() => window.history.back()}><ChevronLeft size={17} /></button>
    <button type="button" title="Forward" onClick={() => window.history.forward()}><ChevronRight size={17} /></button>
  </div>;
}

function AccountControls({ compact = false }: { compact?: boolean }) {
  const { auth, refresh } = useAuthState();
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await refresh();
    window.dispatchEvent(new Event("lumina-auth-changed"));
  }
  if (!auth.user) return null;
  return <div className={`account-pill ${compact ? "compact" : ""}`}><span className="avatar-small">{auth.user.name.slice(0, 1).toUpperCase()}</span><span>{auth.user.name}</span><button className="icon-button small" title="Sign out" onClick={logout}><LogOut size={14} /></button></div>;
}

function ProtectedPage({ active, children }: { active: "workspace" | "studio" | "chat"; children: React.ReactNode }) {
  const { auth, refresh } = useAuthState();
  const [showAuth, setShowAuth] = useState(false);
  useEffect(() => { if (!auth.loading && !auth.user) setShowAuth(true); }, [auth.loading, auth.user]);
  if (auth.loading) return <main className="locked-shell"><TopNav active="home" /><section className="locked-card"><Loader2 className="spin" size={28}/><h1>Loading Lumina AI…</h1><p>Checking your secure workspace session.</p></section></main>;
  if (!auth.user) return <main className="locked-shell"><TopNav active="home" /><section className="locked-card"><img src="/lumina-logo-mark.png" alt="Lumina AI"/><span className="status-pill"><span className="dot"/> Account required</span><h1>Sign in to use Lumina {active === "studio" ? "Image Studio" : active === "workspace" ? "Builder" : "Chat"}</h1><p>Create a Lumina AI account to save your chats, generated images, projects, code changes, and profile history.</p><div className="action-row"><button className="btn primary" onClick={() => setShowAuth(true)}><UserRound size={17}/> Sign in or create account</button><a className="btn ghost" href="/"><Home size={17}/> Go home</a></div></section>{showAuth && <AuthModal onClose={() => setShowAuth(false)} onDone={refresh}/>}</main>;
  return <>{children}</>;
}

function TopNav({ active }: { active: "home" | "workspace" | "studio" | "chat" }) {
  const { auth, refresh } = useAuthState();
  const [showAuth, setShowAuth] = useState(false);
  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    await refresh();
    window.dispatchEvent(new Event("lumina-auth-changed"));
  }
  return <header className="top-nav">
    <div className="brand-cluster"><NavArrows/><a className="brand" href="/"><img className="brand-logo" src="/lumina-logo-mark.png" alt="Lumina AI" /><span>Lumina Pro AI</span></a></div>
    <nav className="nav-links">
      <a className={`nav-link ${active === "home" ? "active" : ""}`} href="/">Home</a>
      <a className={`nav-link ${active === "chat" ? "active" : ""}`} href="/chat">Lumina Chat</a>
      <a className={`nav-link ${active === "workspace" ? "active" : ""}`} href="/workspace">Builder</a>
      <a className={`nav-link ${active === "studio" ? "active" : ""}`} href="/studio">Image Studio</a>
      {auth.user ? <div className="account-pill"><span className="avatar-small">{auth.user.name.slice(0, 1).toUpperCase()}</span><span>{auth.user.name}</span><button className="icon-button small" title="Sign out" onClick={logout}><LogOut size={14} /></button></div> : <button className="btn ghost compact" onClick={() => setShowAuth(true)}><UserRound size={15} /> Sign in</button>}
    </nav>
    {showAuth && <AuthModal onClose={() => setShowAuth(false)} onDone={refresh} />}
  </header>;
}

function LandingPage() {
  return <main className="page-shell home-shell"><TopNav active="home" />
    <section className="landing-hero">
      <div className="hero-copy">
        <span className="status-pill"><span className="dot" /> Lumina AI workspace online</span>
        <h1>The AI-native <span>software and media OS.</span></h1>
        <p>Lumina Pro AI combines a general assistant, a Lovable-style software builder, and a Nano-style image studio in one account-based workspace.</p>
        <div className="action-row"><a className="btn primary" href="/chat"><MessageCircle size={18}/> Open Lumina Chat</a><a className="btn" href="/workspace"><Rocket size={18}/> Open Builder</a><a className="btn" href="/studio"><ImageIcon size={18}/> Open Image Studio</a></div>
      </div>
      <div className="hero-card"><img src="/lumina-logo-banner.png" alt="Lumina AI" /><div className="home-grid"><div><b>Chat</b><span>Saved conversations</span></div><div><b>Builder</b><span>Prompt-to-app preview</span></div><div><b>Studio</b><span>Reference image generation</span></div></div></div>
    </section>
  </main>;
}

function ChatMessageBlock({ message, onCopy, onContinue }: { message: ChatMessage; onCopy: (text: string) => void; onContinue?: (text: string) => void }) {
  return <div className={`chat-row ${message.role === "user" ? "user" : "assistant"}`}>
    {message.role !== "user" && <div className="chat-avatar"><img src="/lumina-logo-mark.png" alt="Lumina AI" /></div>}
    <div className="chat-bubble">
      <div className="chat-text">{message.content}</div>
      <div className="chat-actions"><button onClick={() => onCopy(message.content)} title="Copy"><Copy size={15}/></button>{message.role === "assistant" && onContinue && <button onClick={() => onContinue(message.content)} title="Continue"><History size={15}/></button>}</div>
    </div>
  </div>;
}

function LuminaChatPage() {
  const { auth, refresh } = useAuthState();
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const feedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { loadConversations(); const onAuth = () => loadConversations(); window.addEventListener("lumina-auth-changed", onAuth); return () => window.removeEventListener("lumina-auth-changed", onAuth); }, []);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [conversation?.messages.length, loading]);
  async function loadConversations() {
    try {
      const data = await api<{ conversations: ConversationRecord[] }>("/api/chat/conversations?kind=general");
      setConversations(data.conversations);
      setConversation((current) => current ? data.conversations.find((item) => item.id === current.id) || data.conversations[0] || null : data.conversations[0] || null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load chat history"); }
  }
  async function newChat() {
    const data = await api<{ conversation: ConversationRecord }>("/api/chat/conversations", { method: "POST", body: JSON.stringify({ kind: "general", title: "New Lumina Chat" }) });
    setConversations((items) => [data.conversation, ...items]); setConversation(data.conversation); setPrompt("");
  }
  async function deleteChat(item: ConversationRecord) {
    if (!confirm("Delete this chat?")) return;
    await api(`/api/chat/conversations/${item.id}`, { method: "DELETE" });
    const next = conversations.filter((chat) => chat.id !== item.id);
    setConversations(next); setConversation(item.id === conversation?.id ? next[0] || null : conversation);
  }
  async function send() {
    if (!conversation || !prompt.trim()) return;
    const text = prompt.trim(); setPrompt(""); setLoading(true); setError("");
    const optimistic: ChatMessage = { id: uid(), role: "user", content: text, createdAt: new Date().toISOString() };
    setConversation({ ...conversation, messages: [...conversation.messages, optimistic] });
    try {
      const data = await api<{ conversation: ConversationRecord }>(`/api/chat/${conversation.id}/message`, { method: "POST", body: JSON.stringify({ message: text }) });
      setConversation(data.conversation); await loadConversations();
    } catch (err) { setError(err instanceof Error ? err.message : "Lumina Chat failed"); }
    finally { setLoading(false); }
  }
  async function logout() { await api("/api/auth/logout", { method: "POST", body: "{}" }); await refresh(); window.dispatchEvent(new Event("lumina-auth-changed")); }
  const filtered = conversations.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  const messages = conversation?.messages || [];
  return <main className="chatgpt-shell">
    <aside className="chatgpt-sidebar">
      <div className="sidebar-brand"><img src="/lumina-logo-mark.png" alt="Lumina AI"/><b>Lumina Chat</b><NavArrows light/><button className="icon-plain"><Menu size={17}/></button></div>
      <button className="sidebar-big" onClick={newChat}><Plus size={18}/> New chat</button>
      <label className="sidebar-search"><Search size={17}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search chats"/></label>
      <a className="sidebar-link" href="/"><Home size={18}/> Home</a>
      <a className="sidebar-link" href="/workspace"><FileCode2 size={18}/> Projects</a>
      <a className="sidebar-link" href="/studio"><ImageIcon size={18}/> Image Studio</a>
      <div className="sidebar-section">Recents</div>
      <div className="sidebar-history">{filtered.map((item) => <div key={item.id} className={`history-item ${item.id === conversation?.id ? "active" : ""}`}><button onClick={() => setConversation(item)}><span>{item.title}</span><small>{formatTime(item.updatedAt)}</small></button><button className="delete-mini" onClick={() => deleteChat(item)} title="Delete chat"><Trash2 size={14}/></button></div>)}</div>
      <div className="sidebar-user"><span>{(auth.user?.name || "U").slice(0,1).toUpperCase()}</span><div><b>{auth.user?.name || "Lumina User"}</b><small>Signed in</small></div><button className="icon-button small" title="Sign out" onClick={logout}><LogOut size={14}/></button></div>
    </aside>
    <section className="chatgpt-main">
      <header className="chat-header-light"><NavArrows/><button className="icon-plain"><Menu size={18}/></button><b>{conversation?.title || "Lumina Chat"}</b><div className="chat-top-actions"><a href="/workspace">Builder</a><a href="/studio">Image Studio</a><AccountControls compact/></div></header>
      <div className="chat-scroll" ref={feedRef}>{error && <p className="warning">{error}</p>}{messages.length === 0 ? <div className="chat-empty"><img src="/lumina-logo-mark.png" alt="Lumina AI"/><h1>What’s on your mind today?</h1><div className="prompt-suggestions"><button onClick={() => setPrompt("Help me design a portfolio website.")}>Plan a portfolio</button><button onClick={() => setPrompt("Explain this technical problem step by step.")}>Explain code</button><button onClick={() => setPrompt("Give me image ideas for a premium SaaS hero.")}>Image ideas</button></div></div> : messages.map((message) => <ChatMessageBlock key={message.id} message={message} onCopy={(text) => navigator.clipboard.writeText(text)} onContinue={(text) => setPrompt(`Continue and expand this: ${text.slice(0, 160)}`)} />)}{loading && <div className="chat-row assistant"><div className="chat-avatar"><img src="/lumina-logo-mark.png" alt="Lumina AI" /></div><div className="chat-bubble loading"><Loader2 className="spin" size={18}/> Lumina AI is thinking…</div></div>}</div>
      <form className="floating-composer" onSubmit={(e)=>{e.preventDefault();send();}}><button type="button" className="composer-plus" onClick={() => setPrompt((value) => `${value}${value ? "\n" : ""}Use clear steps and examples.`)}><Plus size={21}/></button><textarea placeholder="Ask anything" value={prompt} onChange={(e)=>setPrompt(e.target.value)} onKeyDown={(e)=>{ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); }}}/><button className="composer-send" disabled={loading || !prompt.trim()}><Send size={18}/></button></form>
    </section>
  </main>;
}

function WorkspacePage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("preview");
  const [activePath, setActivePath] = useState("index.html");
  const [codeSearch, setCodeSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState("");
  const [template, setTemplate] = useState<TemplateKind>("portfolio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chatWidth, setChatWidth] = useState(() => clamp(Number(localStorage.getItem(CHAT_WIDTH_KEY)) || DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH));
  const [health, setHealth] = useState<HealthState | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef<ProjectRecord | null>(null);
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { loadProjects(); loadHealth(); }, []);
  useEffect(() => { const file = project?.files.find((item) => item.path === activePath) || project?.files[0]; if (file) { setActivePath(file.path); setDraft(file.content); } }, [project?.id, activePath]);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" }); }, [project?.messages.length, loading]);
  useEffect(() => { const listener = (event: MessageEvent) => { if (event.data?.source !== "lumina-preview") return; console.log("Lumina preview", event.data); }; window.addEventListener("message", listener); return () => window.removeEventListener("message", listener); }, []);
  async function loadProjects() {
    try { const data = await api<{ projects: ProjectRecord[] }>("/api/projects"); setProjects(data.projects); setProject(data.projects[0] || null); } catch (err) { setError(err instanceof Error ? err.message : "Failed to load projects"); }
  }
  async function loadHealth() { try { setHealth(await api<HealthState>("/api/system/health")); } catch { /* noop */ } }
  async function createNewProject(kind = template) {
    const name = prompt.trim().slice(0, 54) || `New ${kind} project`;
    const data = await api<{ project: ProjectRecord }>("/api/projects", { method: "POST", body: JSON.stringify({ template: kind, name }) });
    setProjects((items) => [data.project, ...items]); setProject(data.project); setActiveTab("preview");
  }
  async function deleteProject(item: ProjectRecord) {
    if (!confirm(`Delete project "${item.name}"?`)) return;
    await api(`/api/projects/${item.id}`, { method: "DELETE" });
    const next = projects.filter((project) => project.id !== item.id);
    setProjects(next); setProject(item.id === project?.id ? next[0] || null : project);
  }
  async function sendBuilderPrompt() {
    if (!project || !prompt.trim()) return;
    const text = prompt.trim(); setPrompt(""); setLoading(true); setError("");
    const optimistic: ChatMessage = { id: uid(), role: "user", content: text, createdAt: new Date().toISOString() };
    setProject({ ...project, messages: [...project.messages, optimistic] });
    try {
      const data = await api<{ project: ProjectRecord }>("/api/ai/chat", { method: "POST", body: JSON.stringify({ projectId: project.id, message: text }) });
      setProject(data.project); setProjects((items) => items.map((item) => item.id === data.project.id ? data.project : item)); setActiveTab("preview");
    } catch (err) { setError(err instanceof Error ? err.message : "Builder failed"); }
    finally { setLoading(false); }
  }
  async function saveFile() {
    if (!project) return;
    const data = await api<{ project: ProjectRecord }>(`/api/projects/${project.id}/files`, { method: "PUT", body: JSON.stringify({ path: activePath, content: draft }) });
    setProject(data.project); setProjects((items) => items.map((item) => item.id === data.project.id ? data.project : item));
  }
  function startDrag(event: React.PointerEvent) {
    event.preventDefault();
    const startX = event.clientX; const startWidth = chatWidth;
    document.body.classList.add("is-resizing");
    const move = (moveEvent: PointerEvent) => { const next = clamp(startWidth + moveEvent.clientX - startX, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH); setChatWidth(next); localStorage.setItem(CHAT_WIDTH_KEY, String(next)); };
    const up = () => { document.body.classList.remove("is-resizing"); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  const file = project?.files.find((item) => item.path === activePath) || project?.files[0];
  const preview = useMemo(() => buildStaticPreview(project?.files || []), [project?.files]);
  const filteredFiles = useMemo(() => (project?.files || []).filter((item) => item.path.toLowerCase().includes(codeSearch.toLowerCase())), [project?.files, codeSearch]);
  const codeLines = useMemo(() => draft.split("\n"), [draft]);
  return <main className="lovable-shell">
    <aside className="lovable-sidebar" style={{ width: chatWidth }}>
      <div className="lovable-brand"><NavArrows/><img src="/lumina-logo-mark.png" alt="Lumina AI"/><div><b>{project?.name || "Lumina Builder"}</b><small>{project ? formatTime(project.updatedAt) : "AI app builder"}</small></div><button className="icon-plain" onClick={() => createNewProject()}><Plus size={18}/></button></div>
      <select className="lovable-select" value={project?.id || ""} onChange={(e)=>setProject(projects.find((item)=>item.id === e.target.value) || null)}>{projects.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <div className="template-row">{templateOptions.map((item) => <button key={item.value} className={template === item.value ? "active" : ""} onClick={() => { setTemplate(item.value); createNewProject(item.value); }}>{item.label}</button>)}</div>
      <div className="builder-chat-scroll" ref={feedRef}>{error && <p className="warning">{error}</p>}{project?.messages.map((message) => <div key={message.id} className={`builder-message ${message.role === "user" ? "user" : "assistant"}`}><div className="role-line">{roleLabel(message.role)}</div><p>{message.content}</p>{message.metadata?.changes && <div className="change-pills">{(message.metadata.changes as any[]).slice(0, 4).map((change, index) => <span key={index}>{change.action} {change.path}</span>)}</div>}</div>)}{loading && <div className="builder-message assistant"><Loader2 className="spin" size={16}/> Lumina AI is building…</div>}</div>
      <form className="builder-composer" onSubmit={(e)=>{e.preventDefault();sendBuilderPrompt();}}><textarea value={prompt} onChange={(e)=>setPrompt(e.target.value)} placeholder="Ask Lumina to build or modify..." onKeyDown={(e)=>{ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); sendBuilderPrompt(); }}}/><div className="composer-row"><button type="button" className="btn ghost compact" onClick={() => createNewProject()}><Plus size={14}/> New</button>{project && <button type="button" className="btn danger compact" onClick={() => deleteProject(project)}><Trash2 size={14}/> Delete</button>}<button className="btn primary compact" disabled={loading || !prompt.trim()}><Send size={14}/> Build</button></div></form>
    </aside>
    <div className="builder-resize" onPointerDown={startDrag} onDoubleClick={() => { setChatWidth(DEFAULT_CHAT_WIDTH); localStorage.setItem(CHAT_WIDTH_KEY, String(DEFAULT_CHAT_WIDTH)); }} />
    <section className="lovable-main">
      <header className="lovable-toolbar"><div className="tab-group"><button className={activeTab === "preview" ? "active" : ""} onClick={()=>setActiveTab("preview")}><MonitorPlay size={16}/> Preview</button><button className={activeTab === "code" ? "active" : ""} onClick={()=>setActiveTab("code")}><Code2 size={16}/> Code</button><button className={activeTab === "system" ? "active" : ""} onClick={()=>setActiveTab("system")}><Sparkles size={16}/> System</button></div><div className="toolbar-actions"><span className="status-pill light"><span className="dot"/> static browser</span><button className="btn ghost compact" onClick={() => setActiveTab("preview")}><RefreshCw size={14}/> Run</button>{project && <a className="btn primary compact" href={`/api/projects/${project.id}/export`}><Download size={14}/> Export</a>}<AccountControls compact/></div></header>
      <div className="preview-canvas">{activeTab === "preview" && <div className="browser-preview"><div className="browser-top"><span/><span/><span/><b>/</b></div><iframe className="preview-frame" sandbox="allow-scripts allow-modals" srcDoc={preview} title="Lumina preview" /></div>}{activeTab === "code" && <div className="lovable-code-shell"><aside className="lovable-file-tree"><div className="code-search"><Search size={15}/><input value={codeSearch} onChange={(e)=>setCodeSearch(e.target.value)} placeholder="Search code" /></div><div className="file-tree-scroll">{filteredFiles.map((item)=><button key={item.path} className={item.path === activePath ? "active" : ""} onClick={()=>{setActivePath(item.path);setDraft(item.content);}}><FileCode2 size={15}/><span>{item.path}</span><MoreHorizontal size={14}/></button>)}</div></aside><section className="lovable-editor"><header className="lovable-editor-top"><button className="file-tab active"><FileCode2 size={14}/>{file?.path || "index.html"}</button><div className="editor-toolbar"><span>Code</span><button className="btn ghost compact" onClick={saveFile}><Save size={14}/> Save</button>{project && <a className="btn ghost compact" href={`/api/projects/${project.id}/export`}><Download size={14}/> Download</a>}<button className="btn primary compact" onClick={()=>setActiveTab("preview")}>Close</button></div></header><div className="code-workbench"><pre className="line-numbers">{codeLines.map((_, index)=>index + 1).join("\n")}</pre><textarea className="lovable-code-editor" value={draft} onChange={(e)=>setDraft(e.target.value)} spellCheck={false}/></div></section></div>}{activeTab === "system" && <div className="system-board"><div><b>Database</b><span>{health?.db?.mode || "checking"}</span></div><div><b>Projects</b><span>{health?.projects ?? projects.length}</span></div><div><b>Images</b><span>{health?.images ?? 0}</span></div><div><b>Commits</b><span>{project?.commits.length || 0}</span></div><section className="commit-list">{project?.commits.slice(0, 8).map((commit) => <article key={commit.id}><b>{commit.message}</b><small>{commit.filesChanged.join(", ") || "No files"}</small>{commit.patches?.slice(0,3).map((patch)=><pre key={patch.id}>{patch.diff || patch.summary}</pre>)}</article>)}</section></div>}</div>
    </section>
  </main>;
}

function StudioPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Cinematic");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [images, setImages] = useState<ImageGeneration[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [targetProjectId, setTargetProjectId] = useState("");
  const [referenceImage, setReferenceImage] = useState<ReferenceImageState>(null);
  const [editImageId, setEditImageId] = useState("");
  const [conversation, setConversation] = useState<ConversationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [status, setStatus] = useState("Lumina AI visual engine ready");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const styles = ["Monochrome", "Colour block", "Runway", "Risograph", "Technicolour", "Gothic clay", "Dynamite", "Salon", "Cinematic", "Product", "Minimal"];
  const ratios = ["1:1", "16:9", "9:16", "4:3", "3:4"];
  useEffect(() => { loadImages(); loadProjects(); loadImageConversation(); }, []);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [conversation?.messages.length, images.length, loading]);
  async function loadProjects() { try { const data = await api<{ projects: ProjectRecord[] }>("/api/projects"); setProjects(data.projects || []); setTargetProjectId((current) => current || data.projects?.[0]?.id || ""); } catch (err) { setError(err instanceof Error ? err.message : "Failed to load projects"); } }
  async function loadImages() { const data = await api<{ images: ImageGeneration[] }>("/api/images"); setImages(data.images || []); }
  async function loadImageConversation() { const data = await api<{ conversations: ConversationRecord[] }>("/api/chat/conversations?kind=image"); setConversation(data.conversations[0] || null); }
  async function onFileChange(file?: File) { if (!file) return; try { setReferenceImage(await fileToDataUrl(file)); setStatus("Reference image attached — Lumina AI will prioritize it"); } catch (err) { setError(err instanceof Error ? err.message : "Image upload failed"); } }
  async function generateImage() {
    if (!prompt.trim()) return;
    const text = prompt.trim();
    setLoading(true); setError(""); setStatus(referenceImage ? "Lumina AI is analyzing your uploaded reference…" : editImageId ? "Lumina AI is editing the selected image…" : "Lumina AI is creating your image…");
    setPrompt("");
    try {
      const data = await api<{ image: ImageGeneration; conversation?: ConversationRecord }>("/api/images/generate", { method: "POST", body: JSON.stringify({ prompt: text, style, aspectRatio, referenceImage, editImageId: editImageId || undefined, conversationId: conversation?.id }) });
      setImages((items) => [data.image, ...items]); if (data.conversation) setConversation(data.conversation); setStatus("Generated by Lumina AI"); setEditImageId("");
    } catch (err) { setPrompt(text); setStatus("Lumina AI generation failed"); setError(err instanceof Error ? err.message : "Generation failed"); }
    finally { setLoading(false); }
  }
  async function useImageInProject(image: ImageGeneration) {
    if (!targetProjectId) { setStatus("Create a builder project first, then link the image."); return; }
    setLinkingId(image.id);
    try { await api<{ project: ProjectRecord }>(`/api/images/${image.id}/use-in-project`, { method: "POST", body: JSON.stringify({ projectId: targetProjectId }) }); setStatus("Image inserted into Builder project"); await loadImages(); }
    catch (err) { setError(err instanceof Error ? err.message : "Image link failed"); }
    finally { setLinkingId(null); }
  }
  async function saveGeneratedImage(image: ImageGeneration) { const data = await api<{ image: ImageGeneration }>(`/api/images/${image.id}/save`, { method: "POST", body: "{}" }); setImages((items) => items.map((item) => item.id === image.id ? data.image : item)); setStatus("Image saved"); }
  async function deleteGeneratedImage(image: ImageGeneration) { if (!confirm("Delete this generated image?")) return; await api(`/api/images/${image.id}`, { method: "DELETE" }); setImages((items) => items.filter((item) => item.id !== image.id)); setStatus("Image deleted"); }
  function copyUrl(url: string) { navigator.clipboard.writeText(url); setStatus("Image URL copied"); }
  function startEdit(image: ImageGeneration) { setEditImageId(image.id); setPrompt(`Edit this image: ${image.prompt}`); setStatus(referenceImage ? "Edit mode active; uploaded reference has priority" : "Edit mode active"); }
  const editImage = images.find((image) => image.id === editImageId);
  const imageById = useMemo(() => new Map(images.map((image) => [image.id, image])), [images]);
  const usedImageIds = new Set<string>();
  const messages = conversation?.messages || [];
  function ImageResultCard({ image }: { image: ImageGeneration }) {
    usedImageIds.add(image.id);
    return <article className="nano-output-card"><div className="nano-image-wrap"><img src={image.imageUrl} alt={image.prompt}/><div className="image-hover-actions"><button onClick={()=>copyUrl(image.imageUrl)} title="Copy"><Copy size={16}/></button><button onClick={()=>saveGeneratedImage(image)} title="Save"><Save size={16}/></button><button onClick={()=>deleteGeneratedImage(image)} title="Delete"><Trash2 size={16}/></button><a download={`lumina-${image.id}.png`} href={image.imageUrl} title="Download"><Download size={16}/></a></div></div><div className="nano-card-actions"><button onClick={()=>startEdit(image)}><Edit3 size={14}/> Edit with Lumina AI</button><button onClick={()=>useImageInProject(image)} disabled={linkingId === image.id}>{linkingId === image.id ? <Loader2 className="spin" size={14}/> : <Link2 size={14}/>} Use in Builder</button><button onClick={()=>deleteGeneratedImage(image)} className="danger-text"><Trash2 size={14}/> Delete</button></div><p>{image.prompt}</p>{image.referenceImageUrl && <span className="nano-badge">reference guided</span>}</article>;
  }
  const orphanedImages = images.filter((image) => !messages.some((message) => message.metadata?.imageId === image.id));
  return <main className="nano-shell">
    <aside className="nano-rail"><a href="/"><img src="/lumina-logo-mark.png" alt="Lumina AI"/></a><NavArrows light/><a href="/chat"><MessageCircle size={20}/></a><a href="/workspace"><Code2 size={20}/></a><button onClick={() => fileInputRef.current?.click()}><Upload size={20}/></button></aside>
    <section className="nano-main">
      <header className="nano-top"><div className="nano-title"><b>Lumina Image Studio</b><span>{status}</span></div><div className="nano-top-actions"><a href="/workspace">Open Builder</a><a href="/chat">Lumina Chat</a><AccountControls compact/></div></header>
      <div className="nano-scroll nano-thread-scroll" ref={threadRef}>
        {error && <p className="warning nano-warning">{error}</p>}
        {messages.length === 0 && images.length === 0 ? <div className="nano-start"><img className="nano-logo" src="/lumina-logo-mark.png" alt="Lumina AI"/><h1>Create images</h1><p>Describe an image or upload a reference. Lumina AI will analyze the request, prioritize your latest reference image, then return the visual in this same conversation.</p><div className="style-gallery">{styles.slice(0,8).map((item)=><button key={item} onClick={()=>setStyle(item)} className={style===item ? "active" : ""}><span>{item}</span></button>)}</div></div> : <div className="nano-thread">
          {messages.map((message) => {
            const image = typeof message.metadata?.imageId === "string" ? imageById.get(message.metadata.imageId) : undefined;
            if (message.role === "user") return <div key={message.id} className="nano-turn user"><span>{message.content}</span></div>;
            return <div key={message.id} className="nano-turn ai">{image ? <ImageResultCard image={image}/> : <span className="nano-ai-note">{message.content}</span>}</div>;
          })}
          {orphanedImages.map((image) => <div key={image.id} className="nano-turn ai"><ImageResultCard image={image}/></div>)}
          {loading && <div className="nano-turn ai"><span className="nano-ai-note"><Loader2 className="spin" size={17}/> Lumina AI is generating your image…</span></div>}
        </div>}
      </div>
      <form className="nano-composer" onSubmit={(e)=>{e.preventDefault();generateImage();}}>
        <button type="button" className="composer-plus" onClick={()=>fileInputRef.current?.click()}><Plus size={22}/></button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e)=>onFileChange(e.target.files?.[0])}/>
        <div className="composer-body"><textarea placeholder="Describe your image" value={prompt} onChange={(e)=>setPrompt(e.target.value)} onKeyDown={(e)=>{ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); generateImage(); }}}/>{referenceImage && <div className="reference-chip"><img src={referenceImage.dataUrl} alt="Reference"/><span>{referenceImage.name}</span><button type="button" onClick={()=>setReferenceImage(null)}><X size={13}/></button></div>}</div>
        <select value={style} onChange={(e)=>setStyle(e.target.value)}>{styles.map((item)=><option key={item}>{item}</option>)}</select>
        <select value={aspectRatio} onChange={(e)=>setAspectRatio(e.target.value)}>{ratios.map((item)=><option key={item}>{item}</option>)}</select>
        <button className="composer-send" disabled={loading || !prompt.trim()}>{loading ? <Loader2 className="spin" size={18}/> : <Sparkles size={18}/>}</button>
      </form>
      {editImage && <div className="edit-floating"><img src={editImage.imageUrl} alt="Editing"/><span>Editing selected image. Uploaded reference overrides it.</span><button onClick={()=>setEditImageId("")}><X size={14}/></button></div>}
    </section>
  </main>;
}

function App() {
  const path = window.location.pathname;
  if (path.startsWith("/workspace")) return <ProtectedPage active="workspace"><WorkspacePage /></ProtectedPage>;
  if (path.startsWith("/studio")) return <ProtectedPage active="studio"><StudioPage /></ProtectedPage>;
  if (path.startsWith("/chat")) return <ProtectedPage active="chat"><LuminaChatPage /></ProtectedPage>;
  return <LandingPage />;
}

createRoot(document.getElementById("root")!).render(<App />);
