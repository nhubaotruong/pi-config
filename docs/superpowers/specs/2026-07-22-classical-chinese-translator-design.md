# Classical Chinese Translation Layer — Design Spec

**Date:** 2026-07-22
**Status:** Draft

## Motivation

Chinese-language models achieve better token efficiency on Chinese text. By
translating all model-facing content to Classical Chinese (文言文), we save
tokens on every request while keeping the user experience entirely in English.

## Token Savings Estimates

Based on the [Chinese Classical Bench tokenizer study](https://github.com/zi6me/chinese-classical-bench)
(30 paired samples across 7 tokenizers):

| Tokenizer | Classical/English | Saving |
| ----------- | ------------------: | ------: |
| Qwen2.5 / Qwen3 | **0.57×** | **−43%** |
| DeepSeek-V3 | **0.57×** | **−43%** |
| GLM-4 | **0.58×** | **−42%** |
| GPT-4o (o200k_base) | **0.65×** | **−35%** |

Classical Chinese is also ~20% more token-efficient than modern Chinese on
these tokenizers.

**Coding context adjustment:** In a typical coding session, ~50% of tokens are
natural language (instructions, explanations, reasoning) and ~50% are code,
paths, and commands that stay untranslated. The effective saving is roughly
**20–25% of total tokens** when using a Chinese-optimized model like Qwen or
DeepSeek.

**Example:** A 10K-token coding turn costs ~7.5K tokens after translation
(on a Chinese model). Over a 200-turn session, that's ~500K tokens saved.

> Source: `tokenizer_study/report.md` in
> [zi6me/chinese-classical-bench](https://github.com/zi6me/chinese-classical-bench)
> — 30 classical + modern Chinese + English triples, counted without special tokens.
> The `compress` task in the same benchmark confirms that top models can
> compress modern Chinese → Classical Chinese at ~50% compression with
> acceptable fidelity, validating the translation approach.

## Architecture

The extension hooks into four Pi lifecycle events:

```
User (English)
  │
  ▼
┌─────────────────────────────────────┐
│  input event: translate En→ClassCN  │  (1 translation call per turn)
└─────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────┐
│  before_agent_start: translate system    │
│  prompt En→ClassCN (hash-cached)         │
└──────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────┐
│  LLM runs entirely in Classical      │
│  Chinese — system prompt, user msg,  │
│  assistant responses, subagent       │
│  prompts, tool reasoning             │
└──────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────┐
│  message_end: store ClassCN origin   │
│  in details._classicalCn, display    │
│  English translation in content      │
└──────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────┐
│  context: restore details._classicalCn│
│  as content before LLM call          │
│  (zero API calls — metadata swap)    │
└──────────────────────────────────────┘
  │
  ▼
User (English)
```

### Key principle

All session storage and LLM-facing content stays in Classical Chinese. The user
sees English exclusively via the `message_end` → `context` round-trip.

## Events

### `input` — En → ClassCN

- Fired on user submit
- Translate `event.text` to Classical Chinese
- Return `{ action: "transform", text: classicalCn }`
- The translated text flows through the rest of the pipeline

### `before_agent_start` — system prompt En → ClassCN (cached)

- Translate `event.systemPrompt` to Classical Chinese
- Cache key = SHA256 of English system prompt text
- On hit: return cached Classical Chinese (zero API calls)
- On miss: translate, store in cache, return
- Return `{ systemPrompt: classicalCn }`

### `message_end` (role=assistant) — store ClassCN, display En

- `event.message.content` is the model's Classical Chinese response
- Translate it to English
- Return:

  ```ts
  {
    message: {
      ...event.message,
      content: english,                          // user sees English
      details: { ...event.message.details, _classicalCn: classicalCn },
    },
  }
  ```

- Back up the mapping in an in-memory `Map<messageId, classicalCn>` as
  defense against compaction stripping `details._classicalCn`

### `context` — restore ClassCN before LLM call

- For every assistant message in `event.messages`:
  - If `details._classicalCn` exists → `content = details._classicalCn`
  - Else if the in-memory map has a match → restore from map
- Zero API calls — pure metadata swap

### `session_shutdown` — no state to persist

- In-memory map is ephemeral (repopulated on next session)

## Translation

Uses Pi's model registry — no manual API key configuration.

### Translator API call

```ts
const model = ctx.modelRegistry.find(provider, modelId);
const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
// POST {baseUrl}/chat/completions
// Body: { model, messages: [{ role: "system", content: translationPrompt }, { role: "user", content: text }] }
```

Translation system prompt (English → Classical Chinese):

> Translate the following text to Classical Chinese (文言文). Preserve all
> code, file paths, commands, and technical terms exactly as-is. Respond with
> the translation only, no explanations. If the text is already in Classical
> Chinese, return it unchanged.

Translation system prompt (Classical Chinese → English):

> Translate the following Classical Chinese (文言文) to English. Preserve all
> code, file paths, commands, and technical terms exactly as-is. Respond with
> the translation only, no explanations. If the text is already English,
> return it unchanged.

### Effort parameter

The configured `effort` value (e.g. `"high"`) maps to the model's
`reasoning_effort` parameter when the model supports reasoning. Passed through
in the `/chat/completions` body.

## Configuration

File: `~/.pi/agent/classical-cn.json`

```json
{
  "modelKey": "ollama-cloud/minimax-m3",
  "effort": "high",
  "enabled": true
}
```

| Field | Type | Default | Description |
| ------- | ------ | --------- | ------------- |
| `modelKey` | string | `""` | `"provider/model"` — resolved via `ctx.modelRegistry` |
| `effort` | string | `"off"` | Reasoning effort for translation calls |
| `enabled` | boolean | `true` | Master switch |

### Commands

- `/classical-cn` — open interactive TUI settings panel
- `/classical-cn model` — pick translation model from registry
- `/classical-cn on` / `/classical-cn off` — toggle
- `/classical-cn show` — print current config

### Config API (async, read/write with atomic tmp+rename)

Pattern follows `@getpipher/vision`'s `config.ts`:

- `configFilePath(agentDir) → string`
- `loadConfig(agentDir) → Promise<Config>` — async read, returns defaults on
  error
- `saveConfig(config, agentDir) → Promise<void>` — atomic write via tmp +
  rename using `node:fs/promises`
- `mergeConfig(partial) → Config` — validate + clamp all fields
- `applySettingChange(config, id, value) → Config` — pure function for
  settings panel edits

## System Prompt Cache

A content-addressed LRU cache stored at
`~/.pi/agent/classical-cn-cache.json`:

```json
{
  "version": 1,
  "entries": [
    {
      "key": "sha256-hex-of-english-text",
      "value": "Classical Chinese translation",
      "storedAt": 1712345678000
    }
  ]
}
```

- Key = SHA256 of English text
- LRU eviction at 128 entries (configurable)
- Max entry size: 50KB
- Loaded on `session_start`, persisted on write
- Cache hits: zero API calls
- Only successful translations are cached

## File Structure

```
~/.pi/agent/extensions/classical-cn/
├── index.ts       # Entry: register events + commands
├── config.ts      # Config load/save/merge (async, atomic writes)
├── translator.ts  # En↔ClassCN via ctx.modelRegistry + fetch
└── cache.ts       # LRU content-addressed cache (async fs)
```

No external npm dependencies. Uses:

- `node:fs/promises` — async file I/O
- `node:crypto` — SHA256 for cache keys
- `@earendil-works/pi-coding-agent` — ExtensionAPI, ExtensionContext, getAgentDir
- `typebox` — tool parameter schemas
- `@earendil-works/pi-tui` — settings panel components

## Error Handling

| Scenario | Behavior |
| ---------- | ---------- |
| Translation model unavailable | `message_end` stores ClassCN content directly (user sees ClassCN) |
| `input` translation fails | Input passes through untranslated (user's English sent to model) |
| System prompt cache miss | Translate and cache; subsequent turns use cached version |
| Config file corrupt | `loadConfig` returns defaults — extension always loads |
| Config write fails | Error silently absorbed (config remains in memory for session) |
| `details._classicalCn` stripped | In-memory `Map<messageId, string>` serves as backup |

## Edge Cases

- **Tool outputs**: never translated — tool results stay English, the LLM
  processes them alongside Classical Chinese conversation context
- **Subagents**: automatic — they use the same Pi event pipeline
- **Mid-session disable**: `/classical-cn off` — all events pass through
  without translation
- **Already-Classical-Chinese input**: translation system prompt instructs
  the translator to return input unchanged when already Classical Chinese
- **Large assistant messages**: if translation response exceeds expected
  length, fall back to displaying raw Classical Chinese
