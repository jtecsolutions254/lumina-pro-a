import type { FileRecord, TaskRecord, TemplateKind } from "./types";

export const templateOptions: { id: TemplateKind; label: string; description: string }[] = [
  { id: "portfolio", label: "Portfolio", description: "Personal portfolio with work, skills, and contact sections." },
  { id: "saas", label: "SaaS", description: "AI product landing page with features and pricing." },
  { id: "dashboard", label: "Dashboard", description: "Analytics command center with KPI cards." },
  { id: "ecommerce", label: "Ecommerce", description: "Premium product storefront and checkout CTA." },
  { id: "blog", label: "Blog", description: "Editorial publication layout with featured posts." },
  { id: "admin", label: "Admin", description: "Operations console with users, queues, and alerts." }
];

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) || "Lumina Pro";
}

function file(path: string, content: string, language: string): FileRecord {
  return { path, content, language, updatedAt: new Date().toISOString() };
}

const sharedCss = `:root{--bg:#05070d;--panel:#0a0f1d;--line:rgba(255,255,255,.13);--text:#f7f9ff;--muted:#9ba8bd;--brand:#9b5cff;--brand2:#2fd6ff;--good:#35e28a}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,rgba(155,92,255,.18),transparent 36%),radial-gradient(circle at 82% 22%,rgba(47,214,255,.12),transparent 35%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit;text-decoration:none}.nav{height:74px;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(22px,6vw,76px);border-bottom:1px solid var(--line);background:rgba(5,7,13,.74);backdrop-filter:blur(18px);position:sticky;top:0;z-index:5}.logo{display:flex;align-items:center;gap:12px;font-weight:950;letter-spacing:-.04em}.mark{width:34px;height:34px;border-radius:13px;background:linear-gradient(135deg,var(--brand),var(--brand2));box-shadow:0 0 40px rgba(155,92,255,.35)}.nav nav{display:flex;gap:24px;color:var(--muted);font-weight:850;font-size:14px}.hero{min-height:calc(100vh - 74px);padding:clamp(46px,8vw,96px) clamp(22px,7vw,96px);display:grid;grid-template-columns:1.02fr .98fr;gap:clamp(32px,6vw,78px);align-items:center}.eyebrow{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:rgba(255,255,255,.06);color:#ccd6e7;font-size:13px;font-weight:900}.dot{width:8px;height:8px;border-radius:999px;background:var(--good);box-shadow:0 0 18px var(--good)}h1{margin:24px 0;font-size:clamp(44px,7.5vw,94px);line-height:.92;letter-spacing:-.075em}.gradient{color:transparent;background:linear-gradient(90deg,#fff,var(--brand),var(--brand2));-webkit-background-clip:text;background-clip:text}p{color:var(--muted);line-height:1.7;font-size:18px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:30px}.btn{border:1px solid var(--line);border-radius:16px;padding:14px 18px;background:rgba(255,255,255,.06);color:#fff;font-weight:900;display:inline-flex;align-items:center;gap:8px}.btn.primary{border:0;background:linear-gradient(135deg,var(--brand),#7549f2);box-shadow:0 18px 50px rgba(117,73,242,.32)}.panel{border:1px solid var(--line);border-radius:34px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.035));padding:24px;box-shadow:0 34px 110px rgba(0,0,0,.42);overflow:hidden}.grid{display:grid;gap:16px}.card{border:1px solid var(--line);border-radius:24px;background:rgba(7,10,18,.78);padding:20px;backdrop-filter:blur(18px)}.card h3{margin:0 0 8px;letter-spacing:-.03em}.card p{margin:0;font-size:15px}.kpis,.feature-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.kpi{border:1px solid var(--line);border-radius:20px;padding:18px;background:rgba(255,255,255,.05)}.kpi strong{display:block;font-size:30px}.section{padding:80px clamp(22px,7vw,96px)}.section h2{font-size:clamp(32px,5vw,58px);letter-spacing:-.06em;margin:0 0 18px}.asset-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:24px}.asset-card{min-height:150px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(135deg,rgba(155,92,255,.22),rgba(47,214,255,.16));padding:18px;display:flex;flex-direction:column;justify-content:end}@media(max-width:900px){.hero{grid-template-columns:1fr}.feature-grid,.kpis{grid-template-columns:1fr}.nav nav{display:none}}`;

function shell(name: string, body: string, nav = `<a href="#work">Work</a><a href="#features">Features</a><a href="#contact">Contact</a>`) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${name}</title><link rel="stylesheet" href="styles.css"/></head><body><header class="nav"><div class="logo"><span class="mark"></span><span>${name}</span></div><nav>${nav}</nav></header>${body}<script src="app.js"></script></body></html>`;
}

function appJs(name: string) {
  return `console.log("${name} loaded inside Lumina Pro AI");\ndocument.querySelectorAll(".btn").forEach((button)=>button.addEventListener("click",()=>console.log("CTA clicked:",button.textContent?.trim())));`;
}

function newId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export function createInitialTasks(): TaskRecord[] {
  const now = new Date().toISOString();
  return [
    { id: newId(), title: "Plan request and inspect files", status: "done", priority: "high", createdAt: now },
    { id: newId(), title: "Generate controlled file changes", status: "done", priority: "high", createdAt: now },
    { id: newId(), title: "Preview result in sandbox", status: "in_progress", priority: "medium", createdAt: now },
    { id: newId(), title: "Review diff/history before export", status: "todo", priority: "medium", createdAt: now }
  ];
}

export function detectTemplateFromPrompt(prompt: string): TemplateKind {
  const lower = prompt.toLowerCase();
  if (/portfolio|resume|cv|personal site|profile/.test(lower)) return "portfolio";
  if (/dashboard|analytics|admin data|metrics|kpi/.test(lower)) return "dashboard";
  if (/shop|store|ecommerce|e-commerce|product page|checkout/.test(lower)) return "ecommerce";
  if (/blog|article|publication|magazine|news/.test(lower)) return "blog";
  if (/admin|crm|internal|operations|control panel/.test(lower)) return "admin";
  return "saas";
}

export function extractSubject(prompt: string, fallback = "Lumina Pro") {
  const patterns = [/for\s+([a-z][a-z\s.'-]{2,60})/i, /called\s+([a-z][a-z\s.'-]{2,60})/i, /named\s+([a-z][a-z\s.'-]{2,60})/i];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1]) return titleCase(match[1].replace(/\b(portfolio|website|site|app|dashboard|store|blog)\b/gi, "").trim());
  }
  return titleCase(fallback);
}

export function createTemplateFiles(kind: TemplateKind, subject: string): FileRecord[] {
  const name = titleCase(subject || "Lumina Pro");
  if (kind === "portfolio") {
    return [
      file("index.html", shell(name, `<main class="hero"><section><span class="eyebrow"><span class="dot"></span> Portfolio live</span><h1>${name}<br><span class="gradient">builds useful digital systems.</span></h1><p>A focused personal portfolio for ${name}, built around credibility, selected work, technical skill, and a clear contact path.</p><div class="actions"><a class="btn primary" href="#contact">Contact ${name.split(" ")[0]}</a><a class="btn" href="#work">View projects</a></div></section><aside class="panel"><div class="grid"><div class="card"><h3>Featured project</h3><p>AI-powered product interface with clean user flows, fast previews, and practical automation.</p></div><div class="card"><h3>Core skills</h3><p>Software design, frontend systems, data-backed apps, AI tooling, and product thinking.</p></div><div class="kpis"><div class="kpi"><strong>6+</strong><span>Projects</span></div><div class="kpi"><strong>3</strong><span>Stacks</span></div><div class="kpi"><strong>1</strong><span>Clear brand</span></div></div></div></aside></main><section class="section" id="work"><h2>Selected work</h2><div class="feature-grid"><div class="card"><h3>AI Builder</h3><p>Code generation workflow with preview, history, and export.</p></div><div class="card"><h3>Image Studio</h3><p>Visual asset generation for product and campaign pages.</p></div><div class="card"><h3>Dashboard UX</h3><p>Focused analytics screen for operational decisions.</p></div></div></section><section class="section" id="contact"><h2>Let’s build something useful.</h2><p>Add email, LinkedIn, GitHub, and project links here.</p></section>`), "html"),
      file("styles.css", sharedCss, "css"),
      file("app.js", appJs(name), "javascript")
    ];
  }
  if (kind === "dashboard") {
    return [file("index.html", shell(`${name} Dashboard`, `<main class="hero"><section><span class="eyebrow"><span class="dot"></span> Analytics online</span><h1>Command center for <span class="gradient">real-time decisions.</span></h1><p>${name} Dashboard turns activity, revenue, users, and alerts into a clear operating view.</p><div class="actions"><a class="btn primary">Sync data</a><a class="btn">Export report</a></div></section><aside class="panel"><div class="kpis"><div class="kpi"><strong>84%</strong><span>Health</span></div><div class="kpi"><strong>12.8k</strong><span>Users</span></div><div class="kpi"><strong>$48k</strong><span>MRR</span></div></div><div class="grid" style="margin-top:16px"><div class="card"><h3>Revenue trend</h3><p>Growth is up 18% compared with the last cycle.</p></div><div class="card"><h3>Priority alert</h3><p>Conversion drop detected on mobile onboarding.</p></div></div></aside></main>`), "html"), file("styles.css", sharedCss, "css"), file("app.js", appJs(`${name} Dashboard`), "javascript")];
  }
  if (kind === "ecommerce") {
    return [file("index.html", shell(`${name} Store`, `<main class="hero"><section><span class="eyebrow"><span class="dot"></span> Storefront ready</span><h1>Premium products, <span class="gradient">fast checkout.</span></h1><p>${name} Store presents curated products with strong visuals, clear value, and a simple buying path.</p><div class="actions"><a class="btn primary">Shop collection</a><a class="btn">View offers</a></div></section><aside class="panel"><div class="asset-strip"><div class="asset-card"><b>Signature Kit</b><span>$129</span></div><div class="asset-card"><b>Creator Bundle</b><span>$249</span></div><div class="asset-card"><b>Launch Pack</b><span>$399</span></div></div></aside></main><section class="section"><h2>Why buyers choose us</h2><div class="feature-grid"><div class="card"><h3>Clear quality</h3><p>Detailed product benefits without clutter.</p></div><div class="card"><h3>Secure checkout</h3><p>Trust-focused purchase flow.</p></div><div class="card"><h3>Fast delivery</h3><p>Designed for repeat orders and loyalty.</p></div></div></section>`), "html"), file("styles.css", sharedCss, "css"), file("app.js", appJs(`${name} Store`), "javascript")];
  }
  if (kind === "blog") {
    return [file("index.html", shell(`${name} Journal`, `<main class="hero"><section><span class="eyebrow"><span class="dot"></span> Editorial system</span><h1>Ideas with <span class="gradient">clear structure.</span></h1><p>${name} Journal is a modern publication layout for essays, updates, and long-form thinking.</p><div class="actions"><a class="btn primary">Read featured post</a><a class="btn">Browse topics</a></div></section><aside class="panel"><div class="grid"><div class="card"><h3>Featured article</h3><p>How AI-native workflows change product design.</p></div><div class="card"><h3>Latest note</h3><p>Lessons from building fast MVPs with human review.</p></div></div></aside></main><section class="section"><h2>Recent posts</h2><div class="feature-grid"><div class="card"><h3>Product</h3><p>Building sharper user flows.</p></div><div class="card"><h3>Engineering</h3><p>Reducing friction in local dev.</p></div><div class="card"><h3>Design</h3><p>Visual systems that scale.</p></div></div></section>`), "html"), file("styles.css", sharedCss, "css"), file("app.js", appJs(`${name} Journal`), "javascript")];
  }
  if (kind === "admin") {
    return [file("index.html", shell(`${name} Admin`, `<main class="hero"><section><span class="eyebrow"><span class="dot"></span> Operations live</span><h1>Manage users, queues, and <span class="gradient">system health.</span></h1><p>${name} Admin gives operators a focused console for approvals, incidents, and usage.</p><div class="actions"><a class="btn primary">Review queue</a><a class="btn">Open audit log</a></div></section><aside class="panel"><div class="kpis"><div class="kpi"><strong>24</strong><span>Users</span></div><div class="kpi"><strong>7</strong><span>Tasks</span></div><div class="kpi"><strong>2</strong><span>Alerts</span></div></div><div class="grid" style="margin-top:16px"><div class="card"><h3>Approval queue</h3><p>Three deployment requests need review.</p></div><div class="card"><h3>System incident</h3><p>Image generation fallback active for one provider.</p></div></div></aside></main>`), "html"), file("styles.css", sharedCss, "css"), file("app.js", appJs(`${name} Admin`), "javascript")];
  }
  return [file("index.html", shell(name, `<main class="hero"><section><span class="eyebrow"><span class="dot"></span> Product launch ready</span><h1>${name}<br><span class="gradient">ships AI-native workflows.</span></h1><p>A polished SaaS landing page for ${name}, with clear positioning, feature proof, and conversion-focused calls to action.</p><div class="actions"><a class="btn primary">Start free</a><a class="btn">Watch demo</a></div></section><aside class="panel"><div class="grid"><div class="card"><h3>AI workspace</h3><p>Generate code, visuals, previews, and project assets from one console.</p></div><div class="card"><h3>MongoDB core</h3><p>Projects, images, commits, and history are stored in one data layer.</p></div><div class="kpis"><div class="kpi"><strong>10x</strong><span>Faster drafts</span></div><div class="kpi"><strong>24/7</strong><span>Agent ready</span></div><div class="kpi"><strong>1</strong><span>Unified OS</span></div></div></div></aside></main><section class="section" id="features"><h2>Everything needed to build.</h2><div class="feature-grid"><div class="card"><h3>Builder</h3><p>Code and preview side by side.</p></div><div class="card"><h3>Image Studio</h3><p>Generate assets and insert them into projects.</p></div><div class="card"><h3>History</h3><p>Review file diffs before export.</p></div></div></section>`), "html"), file("styles.css", sharedCss, "css"), file("app.js", appJs(name), "javascript")];
}
