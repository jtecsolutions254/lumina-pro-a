export function normalizeProjectPath(input: string): string {
  const path = String(input || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
  if (!path) throw new Error("Path is required");
  if (path.includes("..")) throw new Error("Path cannot contain '..'");
  if (path.startsWith(".")) throw new Error("Hidden/root paths are not allowed");
  if (/[\x00-\x1F\x7F]/.test(path)) throw new Error("Invalid path characters");
  if (path.length > 255) throw new Error("Path too long");
  return path;
}

export function inferLanguage(path: string) {
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".svg")) return "svg";
  return "text";
}

export function shortDiff(oldContent = "", newContent = "") {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const removed = oldLines.filter((line) => !newLines.includes(line)).slice(0, 14).map((line) => `- ${line}`);
  const added = newLines.filter((line) => !oldLines.includes(line)).slice(0, 14).map((line) => `+ ${line}`);
  return [...removed, ...added].join("\n") || "No textual diff available.";
}
