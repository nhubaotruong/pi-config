# English Auto-Name Extension — Design

## Purpose

Provide a Pi coding-agent extension that automatically names sessions based on the
first user message, mirroring the upstream `@ryan_nookpi/pi-extension-auto-name`
package but with all user-facing strings in English. The user has uninstalled the
Korean upstream package; this extension reclaims the `auto-name` directory and
naming.

## Goals

- Same behavior as the upstream package: detect a session's purpose from the first
  user message, set it as the session name, surface it in the status bar and
  terminal title, and skip automatic naming for subagent sessions.
- All user-visible strings (system prompt, command feedback, settings labels) in
  English. Status key and settings file path remain as the upstream package so
  user data persists if they migrate.
- Mirror the upstream command surface exactly: a single `/auto-name:setting`
  command with `model` and `thinking` subcommands. No new subcommands.
- No tests in this iteration (deferred).

## Non-Goals

- Translation of any non-Pi text (e.g. logs, OS strings).
- Subagent session naming — explicitly skipped, same as upstream.
- Any change to settings storage format or path.
- A new public npm package. This extension is consumed only by the local Pi
  installation; `pi.extensions` points at `./index.ts`.

## Location

`/var/home/nhubao/.pi/agent/extensions/auto-name/`

The Korean upstream package is no longer installed, so this directory does not
collide with an installed extension. The directory name and the command prefix
`/auto-name:setting` are retained for continuity.

## Layout

```
extensions/auto-name/
├── index.ts                  # extension entry, hooks + command
├── package.json              # name "@nhubao/pi-extension-auto-name", pi.extensions: ["./index.ts"]
├── README.md                 # English install + usage
├── .gitignore                # node_modules/
├── tsconfig.json             # extends ../../tsconfig.json
└── utils/
    ├── auto-name-utils.ts    # SUBAGENT_SESSION_DIR, NAME_SYSTEM_PROMPT (English), MAX_*, helpers
    ├── short-label.ts        # generateShortLabel via @earendil-works/pi-ai/compat
    ├── settings.ts           # load/save/get/set + formatSettings
    └── status-keys.ts        # NAME_STATUS_KEY = "name-footer"
```

No test files. No `tests/mock-extension-api.ts`.

## Naming Contract

The system prompt sent to the LLM is the single line:

> "Analyze the user's message and extract the session's purpose as a single line
> in Title Case, 2–4 words, ≤30 characters. Output only the purpose text — no
> explanations, no surrounding punctuation, no quotes."

This replaces the Korean upstream prompt and bakes the user's chosen naming style
into the contract. The result is then truncated to `MAX_NAME_LENGTH = 30` by
`extractNameFromResult`.

## Behavior

### Hooks

- `before_agent_start` — if `isSubagentSession(ctx)` is true, the session already
  has a name, or `event.prompt.trim()` is empty, return without action. Otherwise
  fire-and-forget: call `detectNameFromMessage(prompt, ctx)`, and on a non-empty
  result call `pi.setSessionName(name)` then `updateStatus(ctx)`. Failures are
  swallowed (try/catch wraps the await).
- `session_start` — call `updateStatus(ctx)` to refresh the status bar / terminal
  title for the current session name.
- `session_tree` — same as `session_start`.
- `session_shutdown` — call `ctx.ui.setStatus(NAME_STATUS_KEY, undefined)`. No-op
  when `!ctx.hasUI`.

### `/auto-name:setting` Command

`description`: `Configure auto-name model and reasoning level. Usage: /auto-name:setting [model|thinking] [value]`

Feedback strings (English, replacing the Korean originals):

| Subcommand                       | Output                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| (none)                           | `Model: <id or "default (current session model)">\nReasoning: <level or "default (minimal)">`   |
| `model <provider/model-id>` bad  | `Usage: /auto-name:setting model <provider/model-id> (e.g. anthropic/claude-sonnet-4-20250514)`  |
| `model <bad-format>`             | `Model ID must be in "provider/model-id" format. (e.g. openai/gpt-4o)`                          |
| `model <unknown-id>`             | `Model not found: <id>`                                                                         |
| `model <good>`                   | `auto-name model set: <m.name> (<id>)`                                                          |
| `thinking <level>` bad/missing   | `Usage: /auto-name:setting thinking <minimal\|low\|medium\|high\|xhigh>`                        |
| `thinking <good>`                | `auto-name reasoning level set: <level>`                                                        |
| unknown subcommand               | `Unknown setting: <sub>. Available: model, thinking`                                            |

Severity for these `ctx.ui.notify` calls matches the upstream package: `info`
for success, `warning` for usage errors, `error` for unknown models.

### Status & Terminal Title

- `updateStatus(ctx)` reads `pi.getSessionName()`. If empty, clears the status
  key. Otherwise, sets `NAME_STATUS_KEY = "name-footer"` to `formatNameStatus(name)`
  and, if `ctx.hasUI`, sets the terminal title to `π - <name> - <cwd-basename>`.
- `formatNameStatus` collapses whitespace and clips to `MAX_STATUS_CHARS = 90`,
  adding a trailing `…` if clipped.

## Modules

### `utils/auto-name-utils.ts`

- `SUBAGENT_SESSION_DIR = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents")`
- `NAME_SYSTEM_PROMPT = "Analyze the user's message and extract the session's purpose as a single line in Title Case, 2–4 words, ≤30 characters. Output only the purpose text — no explanations, no surrounding punctuation, no quotes."`
- `MAX_MESSAGE_LENGTH = 500`
- `MAX_NAME_LENGTH = 30`
- `MAX_STATUS_CHARS = 90`
- `SUCCESSFUL_STOP_REASON = "stop"`
- `isSubagentSessionPath(path)` — true iff path starts with `SUBAGENT_SESSION_DIR + sep`.
- `extractSessionFilePath(sessionManager)` — returns sanitized path or `undefined`.
- `formatNameStatus(name)` — single line, ≤ 90 chars.
- `buildNameContext(userMessage)` — `` `User message: ${userMessage.slice(0, MAX_MESSAGE_LENGTH)}` ``
  (English replacement for `사용자 메시지:`).
- `isSuccessfulResult(stopReason)` — true iff `stopReason === "stop"`.
- `extractNameFromResult(content)` — filters text parts, joins, trims, clips to 30.

### `utils/short-label.ts`

Unchanged from upstream. Uses `completeSimple` from `@earendil-works/pi-ai/compat`
with a 10-second `AbortController` timeout. Returns `""` on any failure, missing
model, missing auth, or non-`"stop"` stop reason.

### `utils/settings.ts`

Unchanged from upstream:

- `SETTINGS_DIR = ~/.pi/agent/auto-name`
- `SETTINGS_FILE = SETTINGS_DIR/settings.json`
- `AutoNameSettings = { modelId?: string; thinkingLevel?: ThinkingLevel }`
- `loadSettings()`, `saveSettings(settings)`, `getSetting(key)`, `setSetting(key, value)`
- `formatSettings({})` — English output (`Model: …`, `Reasoning: …`).
- `ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh"`

### `utils/status-keys.ts`

Unchanged: `NAME_STATUS_KEY = "name-footer"`.

### `index.ts`

Exports `default function autoSessionName(pi: ExtensionAPI)` implementing the
hooks and command above. Helpers `isSubagentSession(ctx)`, `resolveModel(ctx)`,
`detectNameFromMessage(message, ctx)` are private.

## Configuration & Persistence

- Settings file: `~/.pi/agent/auto-name/settings.json`
- Shape: `{ modelId?: "provider/model-id"; thinkingLevel?: ThinkingLevel }`
- Reading on every `loadSettings()` call (simple, matches upstream).
- Missing or malformed file → empty settings object (default behavior).

## Error Handling

- Every I/O call (`fs.readFileSync`, `getApiKeyAndHeaders`, `completeSimple`)
  is wrapped in `try/catch` returning a safe default. The extension never throws
  out of its hooks.
- If `ctx.hasUI` is false, all UI updates are skipped (no-op).
- If `ctx.modelRegistry.find(provider, modelId)` returns nothing, the `model`
  subcommand rejects the user-provided value with an `error` notification rather
  than persisting it.

## Testing

No tests in this iteration. Future work: copy
`packages/auto-name/index.test.ts` and `utils/*.test.ts` plus
`tests/mock-extension-api.ts` from the upstream package and run via vitest.

## Acceptance Criteria

1. `/var/home/nhubao/.pi/agent/extensions/auto-name/index.ts` exists and exports a
   default function taking `ExtensionAPI`.
2. `package.json` declares `pi.extensions: ["./index.ts"]` and `name`
   `"@nhubao/pi-extension-auto-name"`.
3. All Korean strings in the upstream package are replaced with English
   equivalents listed above.
4. `NAME_SYSTEM_PROMPT` is the Title Case / 2–4 words / ≤30 chars contract.
5. `SUBAGENT_SESSION_DIR`, `SETTINGS_DIR`, `SETTINGS_FILE`, and `NAME_STATUS_KEY`
   are unchanged from upstream (so a future migration of user data is trivially
   compatible).
6. `lens_diagnostics(mode="delta")` reports no errors after writing the files.

## Out of Scope (explicit)

- Subagent session naming.
- YAML configuration.
- New `/auto-name:clear` or `/auto-name:show` subcommands.
- Test harness setup.
- Publishing to npm.
