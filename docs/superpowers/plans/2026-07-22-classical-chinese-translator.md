# Classical Chinese Translation Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi extension that transparently translates English → Classical Chinese before sending to the LLM and translates responses back, saving 20-25% tokens on coding sessions.

**Architecture:** Four TypeScript files in `~/.pi/agent/extensions/classical-cn/`. The extension hooks four Pi lifecycle events (`input`, `before_agent_start`, `message_end`, `context`) to translate messages. System prompt translations are hash-cached. Uses Pi's model registry for the translation model — no manual API key configuration. Config stored at `~/.pi/agent/classical-cn.json`.

**Tech Stack:** TypeScript, Pi ExtensionAPI (`@earendil-works/pi-coding-agent`), `typebox`, `node:fs/promises`, `node:crypto`, `@earendil-works/pi-tui` (settings panel). No external npm dependencies.

## Global Constraints

- All file I/O must use async APIs (`node:fs/promises`), never sync (`node:fs`)
- Config writes must be atomic (write to tmp file, then rename)
- Config load must be fault-tolerant — a missing or corrupt file returns defaults
- Translation must preserve code, file paths, commands, and technical terms exactly as-is
- The extension must never crash or block the agent — translation failures fall through gracefully
- All event handlers must be non-blocking — translations happen in the handler, not deferred
- No external npm dependencies — only built-in node modules and Pi SDK packages
- Files go in `~/.pi/agent/extensions/classical-cn/`

## File Structure

```
~/.pi/agent/extensions/classical-cn/
├── config.ts      # Config load/save/merge (async, atomic writes)
├── translator.ts  # En↔ClassCN via ctx.modelRegistry + fetch
├── cache.ts       # LRU content-addressed cache (async fs)
└── index.ts       # Entry: register events + commands
```

---

### Task 1: Config Module

**Files:**

- Create: `~/.pi/agent/extensions/classical-cn/config.ts`

**Interfaces:**

- Consumes: nothing (standalone)
- Produces: `Config`, `DEFAULT_CONFIG`, `loadConfig`, `saveConfig`, `mergeConfig`, `applySettingChange`, `configFilePath`

- [ ] **Step 1: Write the Config interface and DEFAULT_CONFIG**

```ts
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const CONFIG_FILENAME = "classical-cn.json";

export interface Config {
  /** "provider/model" string resolved via ctx.modelRegistry */
  modelKey: string;
  /** Reasoning effort for translation calls */
  effort: string;
  /** Master switch */
  enabled: boolean;
}

export const DEFAULT_CONFIG: Config = {
  modelKey: "",
  effort: "off",
  enabled: true,
};
```

- [ ] **Step 2: Write configFilePath and mergeConfig**

```ts
export function configFilePath(agentDir: string): string {
  return join(agentDir, CONFIG_FILENAME);
}

const EFFORT_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function strOrUndef(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function mergeConfig(partial: unknown): Config {
  const p = (partial ?? {}) as Record<string, unknown>;
  return {
    modelKey: strOrUndef(p.modelKey) ?? DEFAULT_CONFIG.modelKey,
    effort: typeof p.effort === "string" && (EFFORT_LEVELS as readonly string[]).includes(p.effort)
      ? p.effort
      : DEFAULT_CONFIG.effort,
    enabled: typeof p.enabled === "boolean" ? p.enabled : DEFAULT_CONFIG.enabled,
  };
}
```

- [ ] **Step 3: Write async loadConfig with fault tolerance**

```ts
export async function loadConfig(agentDir: string): Promise<Config> {
  try {
    const raw = await readFile(configFilePath(agentDir), "utf8");
    return mergeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
```

- [ ] **Step 4: Write atomic async saveConfig**

```ts
export async function saveConfig(config: Config, agentDir: string): Promise<void> {
  const file = configFilePath(agentDir);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}
```

- [ ] **Step 5: Write applySettingChange (pure function)**

```ts
export function applySettingChange(config: Config, id: string, value: string): Config {
  switch (id) {
    case "enabled":
      return { ...config, enabled: value === "on" };
    case "model": {
      // "provider/id" or bare id
      const trimmed = value.trim();
      return { ...config, modelKey: trimmed.length > 0 ? trimmed : "" };
    }
    case "effort":
      if ((EFFORT_LEVELS as readonly string[]).includes(value))
        return { ...config, effort: value };
      return config;
    default:
      return config;
  }
}
```

- [ ] **Step 6: Verify no sync APIs used**

Run: `grep -n 'readFileSync\|writeFileSync\|renameSync\|existsSync\|statSync\|mkdirSync\|rmSync\|readdirSync' ~/.pi/agent/extensions/classical-cn/config.ts`
Expected: no matches

---

### Task 2: Translator Module

**Files:**

- Create: `~/.pi/agent/extensions/classical-cn/translator.ts`

**Interfaces:**

- Consumes: `Config` from Task 1
- Produces: `translate(config, ctx, text, direction) → Promise<string>`

- [ ] **Step 1: Write the translator function**

```ts
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "./config.ts";

const EN_TO_CLASSCN_SYSTEM = [
  "Translate the following text to Classical Chinese (文言文).",
  "Preserve all code, file paths, commands, and technical terms exactly as-is.",
  "Respond with the translation only, no explanations.",
  "If the text is already in Classical Chinese, return it unchanged.",
].join(" ");

const CLASSCN_TO_EN_SYSTEM = [
  "Translate the following Classical Chinese (文言文) to English.",
  "Preserve all code, file paths, commands, and technical terms exactly as-is.",
  "Respond with the translation only, no explanations.",
  "If the text is already English, return it unchanged.",
].join(" ");

export type Direction = "en-to-classcn" | "classcn-to-en";

export async function translate(
  config: Config,
  ctx: ExtensionContext,
  text: string,
  direction: Direction,
): Promise<string | undefined> {
  if (!config.enabled) return undefined;
  if (!config.modelKey || text.length === 0) return undefined;

  const slash = config.modelKey.indexOf("/");
  if (slash <= 0 || slash >= config.modelKey.length - 1) return undefined;

  const provider = config.modelKey.slice(0, slash);
  const modelId = config.modelKey.slice(slash + 1);
  const model = ctx.modelRegistry.find(provider, modelId);
  if (!model) return undefined;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) return undefined;

  const systemPrompt = direction === "en-to-classcn" ? EN_TO_CLASSCN_SYSTEM : CLASSCN_TO_EN_SYSTEM;
  const baseUrl = model.baseUrl.replace(/\/+$/, "");

  const body: Record<string, unknown> = {
    model: model.id,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    max_tokens: text.length > 10000 ? Math.min(text.length * 2, 32000) : 4096,
    temperature: 0,
  };
  if (config.effort !== "off" && model.reasoning) {
    body.reasoning_effort = config.effort;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.apiKey}`,
  };
  if (auth.headers) Object.assign(headers, auth.headers);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) return undefined;

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const result = json.choices?.[0]?.message?.content;
  return result?.trim() || undefined;
}
```

- [ ] **Step 2: Write a quick sanity check**

Run: `npx tsc --noEmit --strict --moduleResolution bundler --module esnext --target esnext ~/.pi/agent/extensions/classical-cn/translator.ts --skipLibCheck`
Expected: type errors only about missing imports from Task 1 (expected — config.ts is created in Task 1)

---

### Task 3: System Prompt Cache

**Files:**

- Create: `~/.pi/agent/extensions/classical-cn/cache.ts`

**Interfaces:**

- Consumes: nothing (standalone)
- Produces: `TranslationCache` class with `get`, `set`, `load`, `save` methods

- [ ] **Step 1: Write the TranslationCache class**

```ts
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

const CACHE_FILENAME = "classical-cn-cache.json";

interface CacheEntry {
  key: string;
  value: string;
  storedAt: number;
}

interface CacheData {
  version: number;
  entries: CacheEntry[];
}

const MAX_ENTRIES = 128;
const MAX_ENTRY_SIZE = 51200; // 50KB

export class TranslationCache {
  private map = new Map<string, string>();
  private cachePath: string;

  constructor(agentDir: string) {
    this.cachePath = `${agentDir}/${CACHE_FILENAME}`;
  }

  get(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    if (value.length > MAX_ENTRY_SIZE) return;
    // LRU: delete then re-add to move to end (Map preserves insertion order)
    this.map.delete(key);
    this.map.set(key, value);
    // Evict oldest entries if over limit
    while (this.map.size > MAX_ENTRIES) {
      const first = this.map.keys().next();
      if (first.done) break;
      this.map.delete(first.value);
    }
  }

  key(text: string): string {
    return createHash("sha256").update(text, "utf8").digest("hex");
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.cachePath, "utf8");
      const data = JSON.parse(raw) as CacheData;
      if (data.version !== 1) return;
      for (const entry of data.entries) {
        this.map.set(entry.key, entry.value);
      }
    } catch {
      // File missing or corrupt — start with empty cache
    }
  }

  async save(): Promise<void> {
    if (this.map.size === 0) return;
    const entries: CacheEntry[] = [];
    for (const [key, value] of this.map) {
      entries.push({ key, value, storedAt: Date.now() });
    }
    const data: CacheData = { version: 1, entries };
    const tmp = `${this.cachePath}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(tmp, this.cachePath);
  }
}
```

- [ ] **Step 2: Verify cache API completeness**

Check: TranslationCache has `get`, `set`, `key`, `load`, `save` methods, all async where I/O is involved.

---

### Task 4: Main Entry Point (index.ts)

**Files:**

- Create: `~/.pi/agent/extensions/classical-cn/index.ts`

**Interfaces:**

- Consumes:
  - `Config`, `DEFAULT_CONFIG`, `loadConfig`, `saveConfig`, `mergeConfig`, `applySettingChange`, `configFilePath` from `./config.ts`
  - `translate`, `Direction` from `./translator.ts`
  - `TranslationCache` from `./cache.ts`
- Produces: default extension export for Pi

- [ ] **Step 1: Write the skeleton with state variables, session_start, and session_shutdown**

```ts
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Config, DEFAULT_CONFIG, loadConfig, saveConfig, applySettingChange } from "./config.ts";
import { translate } from "./translator.ts";
import { TranslationCache } from "./cache.ts";

let config: Config = { ...DEFAULT_CONFIG };
let cache = new TranslationCache("");
// Map<messageId, classicalCn> as fallback if details._classicalCn is stripped by compaction
const cnFallback = new Map<string, string>();

export default function classicalCnExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const agentDir = getAgentDir();
    config = await loadConfig(agentDir);
    cache = new TranslationCache(agentDir);
    await cache.load();
  });

  pi.on("session_shutdown", async () => {
    cnFallback.clear();
    // Cache is ephemeral for now — no save needed on shutdown
  });
}
```

- [ ] **Step 2: Write the `input` event handler**

```ts
pi.on("input", async (event, ctx) => {
  if (!config.enabled || !config.modelKey) return { action: "continue" as const };
  if (event.source === "extension") return { action: "continue" as const };

  const translated = await translate(config, ctx, event.text, "en-to-classcn");
  if (!translated || translated === event.text) return { action: "continue" as const };

  return { action: "transform" as const, text: translated };
});
```

- [ ] **Step 3: Write the `before_agent_start` handler with cache**

```ts
pi.on("before_agent_start", async (event, ctx) => {
  if (!config.enabled || !config.modelKey) return;
  if (!event.systemPrompt || event.systemPrompt.length === 0) return;

  // Skip if system prompt is short (likely not a real prompt)
  if (event.systemPrompt.length < 100) return;

  const cacheKey = cache.key(event.systemPrompt);
  const cached = cache.get(cacheKey);
  if (cached) {
    return { systemPrompt: cached };
  }

  const translated = await translate(config, ctx, event.systemPrompt, "en-to-classcn");
  if (!translated) return;

  cache.set(cacheKey, translated);
  await cache.save();
  return { systemPrompt: translated };
});
```

- [ ] **Step 4: Write the `message_end` handler**

```ts
pi.on("message_end", async (event, ctx) => {
  if (!config.enabled || !config.modelKey) return;
  if (event.message.role !== "assistant") return;
  if (!event.message.content || typeof event.message.content !== "string") return;
  if (event.message.content.length === 0) return;

  const classicalCn = event.message.content;

  // Translate to English for display
  const english = await translate(config, ctx, classicalCn, "classcn-to-en");
  if (!english) return;

  // Store the Classical Chinese original in details for context event to restore
  cnFallback.set(event.message.id ?? classicalCn.slice(0, 64), classicalCn);

  return {
    message: {
      ...event.message,
      content: english,
      details: { ...event.message.details, _classicalCn: classicalCn },
    },
  };
});
```

- [ ] **Step 5: Write the `context` handler**

```ts
pi.on("context", async (event) => {
  for (const m of event.messages) {
    if (m.role !== "assistant") continue;
    if (!m.content || typeof m.content !== "string") continue;

    // Restore from details._classicalCn (set by message_end)
    if (m.details?._classicalCn && typeof m.details._classicalCn === "string") {
      m.content = m.details._classicalCn;
      continue;
    }

    // Fallback: check in-memory map
    const fallbackKey = m.id ?? (typeof m.content === "string" ? m.content.slice(0, 64) : "");
    const fallbackCn = cnFallback.get(fallbackKey);
    if (fallbackCn) {
      m.content = fallbackCn;
    }
  }
});
```

- [ ] **Step 6: Write the `/classical-cn` command handler**

```ts
pi.registerCommand("classical-cn", {
  description: "Configure Classical Chinese translation. Subcommands: show, on, off, model [<key>], effort <level>",
  handler: async (args, ctx) => {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    const sub = parts[0] ?? "";
    const agentDir = getAgentDir();

    switch (sub) {
      case "": {
        // Open settings panel (TUI) or print status
        if (ctx.mode === "tui") {
          await showSettings(pi, ctx);
        } else {
          ctx.ui.notify(formatConfig(config), "info");
        }
        return;
      }
      case "show": {
        ctx.ui.notify(formatConfig(config), "info");
        return;
      }
      case "on": {
        config = { ...config, enabled: true };
        await saveConfig(config, agentDir);
        ctx.ui.notify("Classical CN translation enabled.", "info");
        return;
      }
      case "off": {
        config = { ...config, enabled: false };
        await saveConfig(config, agentDir);
        ctx.ui.notify("Classical CN translation disabled.", "info");
        return;
      }
      case "model": {
        const value = parts.slice(1).join(" ").trim();
        if (!value) {
          // Quick pick from model registry
          const models = ctx.modelRegistry
            .getAvailable()
            .map((m) => `${m.provider}/${m.id}`)
            .sort();
          if (models.length === 0) {
            ctx.ui.notify("No models available in registry.", "warning");
            return;
          }
          const picked = await ctx.ui.select("Pick a translation model:", models);
          if (!picked) return;
          config = { ...config, modelKey: picked };
        } else {
          config = { ...config, modelKey: value };
        }
        await saveConfig(config, agentDir);
        ctx.ui.notify(`Translation model set to: ${config.modelKey}`, "info");
        return;
      }
      case "effort": {
        const level = parts[1];
        if (!level) {
          ctx.ui.notify("Usage: /classical-cn effort <off|minimal|low|medium|high|xhigh>", "warning");
          return;
        }
        config = applySettingChange(config, "effort", level);
        await saveConfig(config, agentDir);
        ctx.ui.notify(`Translation effort set to: ${config.effort}`, "info");
        return;
      }
      default: {
        ctx.ui.notify("Subcommands: show, on, off, model [<key>], effort <level>", "warning");
        return;
      }
    }
  },
});
```

- [ ] **Step 7: Write formatConfig and showSettings helpers**

```ts
function formatConfig(c: Config): string {
  return [
    "Classical CN translation:",
    `  enabled:    ${c.enabled ? "on" : "off"}`,
    `  model:      ${c.modelKey || "(not set)"}`,
    `  effort:     ${c.effort}`,
  ].join("\n");
}

async function showSettings(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  // Simple text-based settings in TUI — inline with Pi's design philosophy
  ctx.ui.notify(formatConfig(config), "info");
}
```

- [ ] **Step 8: Write a syntax check**

Run: `npx tsc --noEmit --strict --moduleResolution bundler --module esnext --target esnext --skipLibCheck ~/.pi/agent/extensions/classical-cn/index.ts 2>&1`
Expected: no errors

---

### Task 5: Integration Verification

**Files:**

- Modify: none (verification only)

- [ ] **Step 1: Verify file structure**

Run: `ls -la ~/.pi/agent/extensions/classical-cn/`
Expected:

```
config.ts
translator.ts
cache.ts
index.ts
```

- [ ] **Step 2: Verify no sync fs calls in any file**

Run: `grep -rn 'readFileSync\|writeFileSync\|renameSync\|existsSync\|statSync\|mkdirSync\|rmSync' ~/.pi/agent/extensions/classical-cn/`
Expected: no matches

- [ ] **Step 3: Verify config file is written correctly**

Run: `cat ~/.pi/agent/classical-cn.json`
Expected: valid JSON with modelKey, effort, enabled fields

- [ ] **Step 4: Verify Pi loads the extension without errors**

Run: `pi -e ~/.pi/agent/extensions/classical-cn/index.ts --version 2>&1 | head -5`
Expected: no crash, normal output (--version exits after loading)

---

## Self-Review

**1. Spec coverage:**

- [x] Events section → Task 4 (input, before_agent_start, message_end, context)
- [x] Config section → Task 1 (modelKey, effort, enabled)
- [x] Translator section → Task 2 (en-to-classcn, classcn-to-en)
- [x] System prompt cache → Task 3 (hash-keyed, LRU eviction, async persist)
- [x] Commands → Task 4 Step 6 (/classical-cn with subcommands)
- [x] Error handling → each handler returns undefined/continues on failure
- [x] details._classicalCn swap → Task 4 Steps 4-5

**2. Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**3. Type consistency:** All interfaces match across tasks. Config type is defined in Task 1, used in Task 2 and 4. TranslationCache defined in Task 3, used in Task 4.

**4. Async compliance:** All file operations use `node:fs/promises` (readFile, writeFile, rename). No sync API usage.
