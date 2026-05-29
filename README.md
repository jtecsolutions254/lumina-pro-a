# Lumina Pro AI — Standalone MVP

Lumina Pro AI is a local Vite + Express + MongoDB MVP that combines:

- **Lumina Chat** — general AI assistant with saved conversation history
- **AI Software Builder** — Lovable-style chat + live preview + code editor + file diff/history
- **Lumina Image Studio** — image generation, uploaded reference images, image editing, save/copy/delete/download actions, and direct insertion into Builder projects
- **Accounts** — local signup, sign in, sign out, and profile-scoped history
- **MongoDB persistence** — projects, images, users, sessions, conversations, commits, and patches

The UI intentionally brands model/provider activity as **Lumina AI**. Internally, Gemini is used for chat, prompt analysis, and software generation. The image engine can try Gemini native image generation and then use a real image-generation fallback if the Google account has no image quota.

## Run locally on Windows

```powershell
cd C:\Users\pc\Desktop\lumina-pro-ai-stable
npm install --registry=https://registry.npmjs.org/
Copy-Item .env.example .env
# If PowerShell blocks editing scripts, use create-env.cmd instead.
npm run dev
```

Open:

```text
http://localhost:8080
```

If `.env.example` is missing or PowerShell gives trouble, run:

```powershell
.\create-env.cmd
```

Then open `.env` in VS Code, Notepad++, or any text editor and replace:

```env
GEMINI_API_KEY=PASTE_YOUR_NEW_GEMINI_KEY_HERE
```

with your new Gemini API key.

## Main routes

```text
/           Home
/chat       Lumina Chat
/workspace  AI Software Builder
/studio     Lumina Image Studio
```

## What to test

### 1. Create an account

Click **Sign in**, then create a Lumina account. Your projects, chats, and images are saved under that account. You can sign out from the top navigation.

### 2. Lumina Chat

Open `/chat` and ask a general question, for example:

```text
Help me plan the first 5 features for a small SaaS product.
```

The conversation is saved to your profile.

### 3. Builder

Open `/workspace` and try:

```text
Create a modern portfolio website for Joseph Kiseko with hero, about, skills, projects, testimonials, and contact sections.
```

Lumina AI will analyze the prompt, generate app files, update the preview, and save a commit with diff history.

### 4. Image Studio

Open `/studio`, upload a reference image if desired, then try:

```text
A cinematic AI software engineering dashboard, purple and cyan glow, premium SaaS interface.
```

You can copy, save, delete, download, edit, or insert the generated image into a selected Builder project.

### 5. Image editing

Click **Edit with Lumina** on any generated image, describe the change, and generate again. The Image Studio conversation keeps context so Lumina AI can treat it as an edit workflow.

## MongoDB

By default, Lumina tries:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/lumina_pro_ai
```

If MongoDB is not running, the app still opens using in-memory storage, but data disappears after restart. To test persistence:

```powershell
npm run db:test
```

## Important implementation files

```text
server/index.ts       Express API, auth, sessions, projects, images, chat
server/db.ts          MongoDB + memory fallback storage layer
server/providers.ts   Lumina AI provider abstraction over Gemini/image engines
src/main.tsx          Home, Chat, Builder, Image Studio UI
src/styles.css        Full app styling
shared/templates.ts   Builder templates
shared/types.ts       Shared project/image/chat/account types
```

## Security note

This is a local MVP. Passwords are hashed with Node crypto, and sessions are stored with an HTTP-only cookie. Before public production, add stronger controls such as email verification, password reset, rate limiting, CSRF protection, stronger session rotation, storage quotas, and provider usage limits.

## Latest UI update

- Lumina Chat now uses a ChatGPT-style interface with a left conversation sidebar, centered welcome state, right-aligned user messages, Lumina AI assistant messages, copy/continue actions, and a floating composer.
- The supplied Lumina AI logo assets are included in `public/lumina-logo-mark.png`, `public/lumina-logo-banner.png`, and `public/favicon.png` and are used across the home page, navigation, chat, and image studio.
- Image Studio now treats an uploaded reference image as the primary visual source for the next generation or edit. If both a selected previous image and a new uploaded image exist, the uploaded reference takes priority.
- Image cards include visible Lumina AI branding plus Copy, Save, Delete, Download, Edit, and Use image in project actions.
- User-facing UI labels use Lumina AI branding rather than provider names.

## 0.4.1 UI refresh notes

- Lumina Chat now uses a scrollable ChatGPT-style main thread and left history sidebar.
- Builder keeps the Lovable-style chat/preview layout and adds a Lovable-like Code tab with search, file tree, tabs, line numbers, save, download, and close controls.
- Image Studio keeps the Nano-style centered generation flow and moves image conversation history into the page so it no longer overlays generated images.
- Projects, chats, and generated images include delete controls in the UI.
- Code/text generation now tries Gemini first and can fall back to OpenRouter or local Ollama if configured in `.env`.

## Mobile app

A compatible Expo mobile app is included in `mobile/`.

### Backend requirement

Start the Lumina Pro AI backend first from this folder:

```powershell
npm install --registry=https://registry.npmjs.org/
npm run dev
```

The server listens on `0.0.0.0:8080`, so a mobile phone on the same Wi-Fi can reach it using your PC IPv4 address.

### Mobile setup

```powershell
cd mobile
npm install --registry=https://registry.npmjs.org/
Copy-Item .env.example .env
```

Edit `mobile/.env` and set:

```env
EXPO_PUBLIC_API_BASE_URL=http://YOUR_PC_IPV4:8080
```

Then run:

```powershell
npx expo start
```

Scan the QR code with Expo Go. The mobile app supports Lumina account login, Lumina Chat, Builder, project preview, code viewing, image generation, reference-image upload, delete actions, and using generated images in Builder.

For mobile compatibility, the backend also accepts `Authorization: Bearer <session-token>` in addition to the browser cookie session.
