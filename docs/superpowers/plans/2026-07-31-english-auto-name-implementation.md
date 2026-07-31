# English Auto-Name Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an English-localized Pi extension that automatically names sessions from the first user message, mirroring `@ryan_nookpi/pi-extension-auto-name` with all user-facing strings translated.

**Architecture:** A multi-file TypeScript extension under `/var/home/nhubao/.pi/agent/extensions/auto-name/`. The extension entry (`index.ts`) wires four lifecycle hooks and one slash command, delegating pure helpers to `utils/`. The `short-label` module calls `completeSimple` from `@earendil-works/pi-ai/compat` with a 10s timeout to derive a short Title-Case session name from the first user message.

**Tech Stack:** TypeScript (Node `--experimental-strip-types`), Pi extension API (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`), `node:fs`/`node:os`/`node:path`.

## Global Constraints

- All file paths below are absolute from the repo root `/var/home/nhubao/.pi/agent/`.
- All `.ts` files use `.ts` import specifiers (not `.js`).
- All user-visible strings (system prompt, `notify` calls, `formatSettings`) must be English.
- `SUBAGENT_SESSION_DIR`, `SETTINGS_DIR`, `SETTINGS_FILE`, `NAME_STATUS_KEY`, `MAX_MESSAGE_LENGTH = 500`, `MAX_NAME_LENGTH = 30`, `MAX_STATUS_CHARS = 90` are unchanged from upstream.
- Verification per file uses `node --experimental-strip-types --check <file>` from the extension directory.
- `pi.extensions` manifest points at `./index.ts`; package `name` is `@nhubao/pi-extension-auto-name`.
- No tests in this iteration.

---

### Task 1: Scaffold `package.json`, `tsconfig.json`, `.gitignore`

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/package.json`
- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/tsconfig.json`
- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/.gitignore`

**Interfaces:**

- Consumes: nothing
- Produces: extension root with `pi.extensions` manifest pointing at `./index.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /var/home/nhubao/.pi/agent/extensions/auto-name/utils
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@nhubao/pi-extension-auto-name",
  "version": "0.1.0",
  "description": "Auto session name extension for pi. English-localized.",
  "license": "MIT",
  "type": "module",
  "keywords": ["pi-package"],
  "files": ["index.ts", "README.md", "utils"],
  "pi": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*"
  },
  "peerDependenciesMeta": {
    "@earendil-works/pi-ai": { "optional": true },
    "@earendil-works/pi-coding-agent": { "optional": true }
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "include": ["index.ts", "utils/**/*.ts"]
}
```

(Note: the workspace root tsconfig may not exist yet; the include glob is still valid as a fallback. The extension only needs to be parseable by Node `--experimental-strip-types`.)

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 5: Verify files exist**

```bash
ls /var/home/nhubao/.pi/agent/extensions/auto-name/
ls /var/home/nhubao/.pi/agent/extensions/auto-name/utils/
```

Expected: `package.json`, `tsconfig.json`, `.gitignore`, and empty `utils/`.

- [ ] **Step 6: Commit**

```bash
cd /var/home/nhubao/.pi/agent && git add extensions/auto-name/ && git commit -m "feat(auto-name): scaffold package"
```

---

### Task 2: `utils/status-keys.ts`

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/utils/status-keys.ts`

**Interfaces:**

- Consumes: nothing
- Produces: `NAME_STATUS_KEY` constant exported for `index.ts`

- [ ] **Step 1: Write the file**

```ts
export const NAME_STATUS_KEY = "name-footer";
export const ELAPSED_STATUS_KEY = "elapsed-time";
```

- [ ] **Step 2: Verify**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --check utils/status-keys.ts
```

Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
cd /var/home/nhubao/.pi/agent && \
  git add extensions/auto-name/utils/status-keys.ts && \
  git commit -m "feat(auto-name): add status key constants"
```

---

### Task 3: `utils/settings.ts`

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/utils/settings.ts`

**Interfaces:**

- Consumes: nothing (only `node:fs`, `node:os`, `node:path`)
- Produces:
  - `ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh"`
  - `AutoNameSettings = { modelId?: string; thinkingLevel?: ThinkingLevel }`
  - `SETTINGS_DIR`, `SETTINGS_FILE` constants
  - `loadSettings()`, `saveSettings(settings)`, `getSetting(key)`, `setSetting(key, value)`, `formatSettings(settings)`

- [ ] **Step 1: Write the file**

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export const SETTINGS_DIR = path.join(os.homedir(), ".pi", "agent", "auto-name");
export const SETTINGS_FILE = path.join(SETTINGS_DIR, "settings.json");

export interface AutoNameSettings {
 /** Model identifier in "provider/model-id" format */
 modelId?: string;
 /** Thinking/reasoning level for name generation */
 thinkingLevel?: ThinkingLevel;
}

const DEFAULT_SETTINGS: AutoNameSettings = {};

function loadRaw(): AutoNameSettings {
 try {
  const data = fs.readFileSync(SETTINGS_FILE, "utf-8");
  const parsed = JSON.parse(data) as unknown;
  if (parsed && typeof parsed === "object") {
   return parsed as AutoNameSettings;
  }
 } catch {
  // File missing or JSON parse failed: fall through to defaults.
 }
 return { ...DEFAULT_SETTINGS };
}

export function loadSettings(): AutoNameSettings {
 return loadRaw();
}

export function saveSettings(settings: AutoNameSettings): void {
 fs.mkdirSync(SETTINGS_DIR, { recursive: true });
 fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

export function getSetting<K extends keyof AutoNameSettings>(key: K): AutoNameSettings[K] {
 return loadRaw()[key];
}

export function setSetting<K extends keyof AutoNameSettings>(key: K, value: AutoNameSettings[K]): void {
 const settings = loadRaw();
 if (value === undefined) {
  delete settings[key];
 } else {
  settings[key] = value;
 }
 saveSettings(settings);
}

/** Format the current settings as a human-readable string. */
export function formatSettings(settings: AutoNameSettings): string {
 const lines: string[] = [];
 lines.push(`Model: ${settings.modelId ?? "default (current session model)"}`);
 lines.push(`Reasoning: ${settings.thinkingLevel ?? "default (minimal)"}`);
 return lines.join("\n");
}
```

- [ ] **Step 2: Verify**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --check utils/settings.ts
```

Expected: exit 0, no output.

- [ ] **Step 3: Smoke-test the loaders don't throw**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --eval "import('./utils/settings.ts').then(m => { console.log(JSON.stringify(m.loadSettings())); console.log(m.formatSettings({})); })"
```

Expected: prints `{}` on the first line, then `Model: default (current session model)\nReasoning: default (minimal)`.

- [ ] **Step 4: Commit**

```bash
cd /var/home/nhubao/.pi/agent && \
  git add extensions/auto-name/utils/settings.ts && \
  git commit -m "feat(auto-name): add settings persistence (English labels)"
```

---

### Task 4: `utils/auto-name-utils.ts`

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/utils/auto-name-utils.ts`

**Interfaces:**

- Consumes: nothing (only `node:os`, `node:path`)
- Produces:
  - `SUBAGENT_SESSION_DIR` constant
  - `NAME_SYSTEM_PROMPT` (English Title-Case contract)
  - `MAX_MESSAGE_LENGTH = 500`, `MAX_NAME_LENGTH = 30`, `MAX_STATUS_CHARS = 90`, `SUCCESSFUL_STOP_REASON = "stop"`
  - `isSubagentSessionPath(path)`, `extractSessionFilePath(sessionManager)`
  - `formatNameStatus(name)`, `buildNameContext(userMessage)`
  - `isSuccessfulResult(stopReason)`, `extractNameFromResult(content)`

- [ ] **Step 1: Write the file**

```ts
/**
 * Pure utility functions for auto-name extension.
 * Extracted for testability — no I/O, no pi SDK dependencies.
 */
import * as os from "node:os";
import * as path from "node:path";

// ── Constants ────────────────────────────────────────────────────────────────

/** Must match subagent/session.ts:SUBAGENT_SESSION_DIR */
export const SUBAGENT_SESSION_DIR = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents");

export const NAME_SYSTEM_PROMPT =
 "Analyze the user's message and extract the session's purpose as a single line in Title Case, 2–4 words, ≤30 characters. Output only the purpose text — no explanations, no surrounding punctuation, no quotes.";

/** Max chars for the user message sent to the LLM. */
export const MAX_MESSAGE_LENGTH = 500;

/** Max chars for the resulting session name. */
export const MAX_NAME_LENGTH = 30;

/** Max chars shown in the status bar. */
export const MAX_STATUS_CHARS = 90;

/** Only a fully completed response should be used as a session name. */
export const SUCCESSFUL_STOP_REASON = "stop";

// ── Pure Functions ───────────────────────────────────────────────────────────

/**
 * Check if a session file path belongs to the subagent sessions directory.
 * Returns true if the path starts with SUBAGENT_SESSION_DIR.
 */
export function isSubagentSessionPath(sessionFilePath: string | undefined): boolean {
 if (!sessionFilePath) return false;
 return (
  sessionFilePath.startsWith(SUBAGENT_SESSION_DIR + path.sep) ||
  sessionFilePath.startsWith(`${SUBAGENT_SESSION_DIR}/`)
 );
}

/**
 * Safely extract session file path from an ExtensionContext-like object.
 * Returns undefined if extraction fails.
 */
export function extractSessionFilePath(sessionManager: unknown): string | undefined {
 try {
  if (sessionManager && typeof sessionManager === "object" && "getSessionFile" in sessionManager) {
   const getSessionFile = (sessionManager as Record<string, unknown>).getSessionFile;
   if (typeof getSessionFile === "function") {
    const raw = String(getSessionFile() ?? "");
    const cleaned = raw.replace(/[\r\n\t]+/g, "").trim();
    return cleaned || undefined;
   }
  }
 } catch {
  // Ignore errors
 }
 return undefined;
}

/**
 * Format a session name for status bar display.
 * Normalizes whitespace and clips to MAX_STATUS_CHARS.
 */
export function formatNameStatus(name: string): string {
 const singleLine = name.replace(/\s+/g, " ").trim();
 return singleLine.length > MAX_STATUS_CHARS ? `${singleLine.slice(0, MAX_STATUS_CHARS - 1)}…` : singleLine;
}

/**
 * Build the user-message text sent to the LLM for name detection.
 * Truncates to MAX_MESSAGE_LENGTH.
 */
export function buildNameContext(userMessage: string): string {
 return `User message: ${userMessage.slice(0, MAX_MESSAGE_LENGTH)}`;
}

/**
 * Check whether a model result completed normally.
 * Only fully completed responses should be used for session naming.
 */
export function isSuccessfulResult(stopReason: string | undefined): boolean {
 return stopReason === SUCCESSFUL_STOP_REASON;
}

/**
 * Extract the session name text from an LLM AssistantMessage-like result.
 * Filters to text content, joins, trims, and clips to MAX_NAME_LENGTH.
 */
export function extractNameFromResult(content: ReadonlyArray<{ type: string; text?: string }>): string {
 const text = content
  .filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
  .map((c) => c.text)
  .join("")
  .trim();

 return text.slice(0, MAX_NAME_LENGTH);
}
```

- [ ] **Step 2: Verify**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --check utils/auto-name-utils.ts
```

Expected: exit 0, no output.

- [ ] **Step 3: Smoke-test the helpers**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --eval "
import('./utils/auto-name-utils.ts').then(m => {
  console.log(JSON.stringify(m.formatNameStatus('  hello\\n world  ')));
  console.log(m.buildNameContext('hi').slice(0, 30));
  console.log(m.isSuccessfulResult('stop'));
  console.log(m.extractNameFromResult([{type:'text',text:'  Release Prep '},{type:'image'}]));
  console.log(m.isSubagentSessionPath(undefined));
});
"
```

Expected output (in order):

```
"hello world"
"User message: hi"
true
"Release Prep"
false
```

- [ ] **Step 4: Commit**

```bash
cd /var/home/nhubao/.pi/agent && \
  git add extensions/auto-name/utils/auto-name-utils.ts && \
  git commit -m "feat(auto-name): add name-detection helpers (English prompt)"
```

---

### Task 5: `utils/short-label.ts`

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/utils/short-label.ts`

**Interfaces:**

- Consumes: `ThinkingLevel` type from `utils/settings.ts`
- Produces:
  - `ShortLabelContext = { model?: SummaryModel; modelRegistry?: { getApiKeyAndHeaders } }`
  - `GenerateShortLabelOptions = { systemPrompt; prompt; maxTokens?; timeoutMs?; reasoning?; extractText? }`
  - `generateShortLabel(ctx, options): Promise<string>` — returns `""` on any failure

- [ ] **Step 1: Write the file**

```ts
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { ThinkingLevel } from "./settings.ts";

type SummaryModel = Parameters<typeof completeSimple>[0];
type SummaryResult = Awaited<ReturnType<typeof completeSimple>>;

type AuthResult = {
 ok: boolean;
 apiKey?: string;
 headers?: Record<string, string>;
};

export type ShortLabelContext = {
 model?: SummaryModel;
 modelRegistry?: {
  getApiKeyAndHeaders: (model: SummaryModel) => Promise<AuthResult>;
 };
};

export type GenerateShortLabelOptions = {
 systemPrompt: string;
 prompt: string;
 maxTokens?: number;
 timeoutMs?: number;
 /** Reasoning level (default: "minimal") */
 reasoning?: ThinkingLevel;
 extractText?: (content: SummaryResult["content"]) => string;
};

function defaultExtractText(content: SummaryResult["content"]): string {
 return content
  .filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
  .map((part) => part.text)
  .join("")
  .trim();
}

export async function generateShortLabel(ctx: ShortLabelContext, options: GenerateShortLabelOptions): Promise<string> {
 const model = ctx.model;
 if (!model || !ctx.modelRegistry) return "";

 const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
 if (!auth.ok) return "";

 const controller = new AbortController();
 const timeoutMs = options.timeoutMs ?? 10000;
 const timer = setTimeout(() => controller.abort(), timeoutMs);

 try {
  const result = await completeSimple(
   model,
   {
    systemPrompt: options.systemPrompt,
    messages: [
     {
      role: "user",
      content: [{ type: "text", text: options.prompt }],
      timestamp: Date.now(),
     },
    ],
   },
   {
    apiKey: auth.apiKey,
    headers: auth.headers,
    signal: controller.signal,
    reasoning: options.reasoning ?? "minimal",
    maxTokens: options.maxTokens ?? 60,
   },
  );

  if (result.stopReason !== "stop") return "";
  const extractText = options.extractText ?? defaultExtractText;
  return extractText(result.content);
 } catch {
  return "";
 } finally {
  clearTimeout(timer);
 }
}
```

- [ ] **Step 2: Verify**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --check utils/short-label.ts
```

Expected: exit 0, no output.

(Note: full behavioral testing requires the `@earendil-works/pi-ai` peer dep at runtime; the syntax check is sufficient for this iteration.)

- [ ] **Step 3: Commit**

```bash
cd /var/home/nhubao/.pi/agent && \
  git add extensions/auto-name/utils/short-label.ts && \
  git commit -m "feat(auto-name): add short-label LLM call wrapper"
```

---

### Task 6: `index.ts` — extension entry

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/index.ts`

**Interfaces:**

- Consumes:
  - `ExtensionAPI`, `ExtensionContext` from `@earendil-works/pi-coding-agent`
  - `NAME_SYSTEM_PROMPT`, `buildNameContext`, `extractNameFromResult`, `extractSessionFilePath`, `formatNameStatus`, `isSubagentSessionPath`, `MAX_NAME_LENGTH` from `./utils/auto-name-utils.ts`
  - `generateShortLabel` from `./utils/short-label.ts`
  - `loadSettings`, `setSetting`, `formatSettings`, `ThinkingLevel` from `./utils/settings.ts`
  - `NAME_STATUS_KEY` from `./utils/status-keys.ts`
- Produces: `default function autoSessionName(pi: ExtensionAPI)` registering four hooks + `/auto-name:setting` command

- [ ] **Step 1: Write the file**

```ts
/**
 * Auto session name (English) — detects purpose from first user message
 * and sets it as the session name via pi.setSessionName().
 *
 * - Auto-detect: uses pi-ai completeSimple() to summarize first message → pi.setSessionName()
 * - Footer display: shows session name in status bar via setStatus()
 * - Manual control: use built-in /name command (no custom command needed)
 * - Skips auto-detection for subagent sessions
 * - Configurable model / thinking level via /auto-name:setting
 */
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
 buildNameContext,
 extractNameFromResult,
 extractSessionFilePath,
 formatNameStatus,
 isSubagentSessionPath,
 NAME_SYSTEM_PROMPT,
} from "./utils/auto-name-utils.ts";
import { formatSettings, loadSettings, setSetting, type ThinkingLevel } from "./utils/settings.ts";
import { generateShortLabel } from "./utils/short-label.ts";
import { NAME_STATUS_KEY } from "./utils/status-keys.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSubagentSession(ctx: ExtensionContext): boolean {
 const sessionFilePath = extractSessionFilePath(ctx.sessionManager);
 return isSubagentSessionPath(sessionFilePath);
}

function resolveModel(ctx: ExtensionContext) {
 const settings = loadSettings();
 if (settings.modelId) {
  const parts = settings.modelId.split("/");
  if (parts.length === 2) {
   const [provider, modelId] = parts;
   const m = ctx.modelRegistry.find(provider, modelId);
   if (m) return m;
  }
 }
 return ctx.model;
}

async function detectNameFromMessage(userMessage: string, ctx: ExtensionContext): Promise<string> {
 const settings = loadSettings();
 const model = resolveModel(ctx);
 if (!model) return "";

 return generateShortLabel(
  { model, modelRegistry: ctx.modelRegistry },
  {
   systemPrompt: NAME_SYSTEM_PROMPT,
   prompt: buildNameContext(userMessage),
   reasoning: settings.thinkingLevel ?? "minimal",
   extractText: extractNameFromResult,
  },
 );
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function autoSessionName(pi: ExtensionAPI) {
 const updateTerminalTitle = (ctx: ExtensionContext) => {
  if (!ctx.hasUI) return;
  const cwdBasename = path.basename(process.cwd());
  const name = pi.getSessionName();
  if (!name) return;
  ctx.ui.setTitle(`π - ${name} - ${cwdBasename}`);
 };

 const updateStatus = (ctx: ExtensionContext) => {
  if (!ctx.hasUI) return;

  const name = pi.getSessionName();
  if (!name) {
   ctx.ui.setStatus(NAME_STATUS_KEY, undefined);
   return;
  }

  ctx.ui.setStatus(NAME_STATUS_KEY, formatNameStatus(name));
  updateTerminalTitle(ctx);
 };

 // ── Auto Name (async) ──────────────────────────────────────

 pi.on("before_agent_start", async (event, ctx) => {
  if (isSubagentSession(ctx)) return;

  // Skip when a name is already set.
  if (pi.getSessionName()) return;

  const text = event.prompt.trim();
  if (!text) return;

  // Fire-and-forget: detect name asynchronously, then set it.
  (async () => {
   try {
    const detected = await detectNameFromMessage(text, ctx);
    if (detected && !pi.getSessionName()) {
     pi.setSessionName(detected);
     updateStatus(ctx);
    }
   } catch {
    // Ignore failures.
   }
  })();
 });

 // ── Command: /auto-name:setting ─────────────────────────────

 pi.registerCommand("auto-name:setting", {
  description:
   "Configure auto-name model and reasoning level. Usage: /auto-name:setting [model|thinking] [value]",
  handler: async (args, ctx) => {
   if (!ctx.hasUI) return;
   const tokens = args.trim().split(/\s+/);
   const subCommand = tokens[0];

   // No args: show current settings.
   if (!subCommand) {
    const settings = loadSettings();
    ctx.ui.notify(formatSettings(settings), "info");
    return;
   }

   if (subCommand === "model") {
    const modelId = tokens.slice(1).join(" ").trim();
    if (!modelId) {
     ctx.ui.notify(
      "Usage: /auto-name:setting model <provider/model-id> (e.g. anthropic/claude-sonnet-4-20250514)",
      "warning",
     );
     return;
    }
    const parts = modelId.split("/");
    if (parts.length !== 2) {
     ctx.ui.notify('Model ID must be in "provider/model-id" format. (e.g. openai/gpt-4o)', "warning");
     return;
    }
    const [provider, id] = parts;
    const m = ctx.modelRegistry.find(provider, id);
    if (!m) {
     ctx.ui.notify(`Model not found: ${modelId}`, "error");
     return;
    }
    setSetting("modelId", modelId);
    ctx.ui.notify(`auto-name model set: ${m.name} (${modelId})`, "info");
    return;
   }

   if (subCommand === "thinking") {
    const level = tokens[1]?.trim() as ThinkingLevel | undefined;
    const validLevels: ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh"];
    if (!level || !validLevels.includes(level)) {
     ctx.ui.notify(
      `Usage: /auto-name:setting thinking <${validLevels.join("|")}>`,
      "warning",
     );
     return;
    }
    setSetting("thinkingLevel", level);
    ctx.ui.notify(`auto-name reasoning level set: ${level}`, "info");
    return;
   }

   ctx.ui.notify(`Unknown setting: ${subCommand}. Available: model, thinking`, "warning");
  },
 });

 // ── Lifecycle ─────────────────────────────────────────────────

 pi.on("session_start", async (_event, ctx) => {
  updateStatus(ctx);
 });

 pi.on("session_tree", async (_event, ctx) => {
  updateStatus(ctx);
 });

 pi.on("session_shutdown", async (_event, ctx) => {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(NAME_STATUS_KEY, undefined);
 });
}
```

- [ ] **Step 2: Verify**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --check index.ts
```

Expected: exit 0, no output.

- [ ] **Step 3: Smoke-check that all four files type-check together**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  node --experimental-strip-types --eval "import('./index.ts').then(m => console.log('default export type:', typeof m.default))"
```

Expected: prints `default export type: function`.

- [ ] **Step 4: Commit**

```bash
cd /var/home/nhubao/.pi/agent && \
  git add extensions/auto-name/index.ts && \
  git commit -m "feat(auto-name): add extension entry (English feedback strings)"
```

---

### Task 7: `README.md`

**Files:**

- Create: `/var/home/nhubao/.pi/agent/extensions/auto-name/README.md`

**Interfaces:**

- Consumes: nothing
- Produces: English install + usage documentation

- [ ] **Step 1: Write the file**

```markdown
# @nhubao/pi-extension-auto-name

Automatically name a pi session based on the first user message (English).

It helps you quickly recognize what each session is about when many tasks are
open at once.

## Install

Drop the extension folder into your pi extensions directory (for example
`~/.pi/agent/extensions/auto-name/`) — pi picks it up via the `pi.extensions`
manifest in `package.json`.

## Great for

- Quickly understanding what a session is about.
- Avoiding manual naming with `/name`.
- Showing the current task clearly in the terminal title and status area.

## Configuration

You can customize the model and reasoning level used for name generation.

### `/auto-name:setting`

Show current settings:
```

/auto-name:setting

```

Set a specific model (must be `provider/model-id` format):
```

/auto-name:setting model anthropic/claude-sonnet-4-20250514

```

Set reasoning level (affects name generation quality vs speed):
```

/auto-name:setting thinking minimal

```

Available reasoning levels: `minimal` (default), `low`, `medium`, `high`, `xhigh`.

Settings are saved to `~/.pi/agent/auto-name/settings.json` and persist across
sessions.

If no custom model is set, the extension uses the current session's model.

## How it works

- It reads the first user message and generates a short Title Case session name
  (2–4 words, ≤30 characters).
- The generated name is applied to the session name, status area, and terminal
  title.
- If a session already has a name, it does not overwrite it.
- It skips automatic naming for subagent sessions.

## Example

If the first request is `Prepare a pre-release checklist`, pi can automatically
turn it into `Release Prep`.

## Differences from the Korean upstream package

This extension is an English-only localization of
[`@ryan_nookpi/pi-extension-auto-name`](https://github.com/Jonghakseo/pi-extension/tree/main/packages/auto-name).
Behavior and persistence paths are unchanged; only user-facing strings are
translated.
```

- [ ] **Step 2: Verify the file exists**

```bash
ls -la /var/home/nhubao/.pi/agent/extensions/auto-name/README.md
```

Expected: file present with size > 1KB.

- [ ] **Step 3: Commit**

```bash
cd /var/home/nhubao/.pi/agent && \
  git add extensions/auto-name/README.md && \
  git commit -m "docs(auto-name): add English README"
```

---

### Task 8: Final verification

**Files:**

- Read-only verification of all created files.

**Interfaces:**

- Consumes: the seven files produced by Tasks 1–7
- Produces: confirmation that acceptance criteria are met

- [ ] **Step 1: Confirm directory layout**

```bash
ls /var/home/nhubao/.pi/agent/extensions/auto-name/ \
   /var/home/nhubao/.pi/agent/extensions/auto-name/utils/
```

Expected:

```
/var/home/nhubao/.pi/agent/extensions/auto-name/:
.gitignore  README.md  index.ts  package.json  tsconfig.json  utils
/var/home/nhubao/.pi/agent/extensions/auto-name/utils/:
auto-name-utils.ts  settings.ts  short-label.ts  status-keys.ts
```

- [ ] **Step 2: Type-check every file**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  for f in index.ts utils/*.ts; do \
    node --experimental-strip-types --check "$f" && echo "ok: $f"; \
  done
```

Expected: `ok:` for each of `index.ts`, `utils/auto-name-utils.ts`,
`utils/settings.ts`, `utils/short-label.ts`, `utils/status-keys.ts`.

- [ ] **Step 3: Confirm no Korean strings remain**

```bash
cd /var/home/nhubao/.pi/agent/extensions/auto-name && \
  grep -nE '[가-힣]' index.ts utils/*.ts README.md || echo "no Korean strings"
```

Expected: `no Korean strings`.

- [ ] **Step 4: Confirm pi manifest points at `./index.ts`**

```bash
grep -A2 '"pi"' /var/home/nhubao/.pi/agent/extensions/auto-name/package.json
```

Expected: shows `"extensions": ["./index.ts"]`.

- [ ] **Step 5: Run lens diagnostics**

```bash
lens_diagnostics mode=delta
```

(This will report peer-dep module-resolution errors at the workspace level —
those are expected; the extension itself is syntactically valid.)

- [ ] **Step 6: Final commit if any cleanup occurred**

```bash
cd /var/home/nhubao/.pi/agent && git status --short
```

If anything is modified, commit with `chore(auto-name): final cleanup`.
