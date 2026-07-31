---
name: fe-browser-loop
description: |
  Use for frontend work that needs browser verification: UI/UX bugs,
  visual layout issues, hydration errors, broken navigation, styling
  changes, responsive checks, screenshots, or any task that touches
  components, pages, styles, or runs a web app. Loads automatically
  for *.tsx/jsx/vue/svelte/css edits and when the user mentions UI,
  visual, browser, layout, render, hydration, or similar terms.
  Enforces a 5-step open→baseline→repro→edit→verify loop with
  systematic case derivation across 9 dimensions and user-waivered
  skip rules. Skip only with explicit user override or when no
  live URL exists.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
---

# fe-browser-loop

Mandatory browser-verification loop for frontend work. Wraps the
bundled `browser-goblin` skills (`browser-testing`,
`browser-debugging`, `browser-visual-qa`, `browser-auth`) into one
opinionated workflow.

## When to use this skill

Load this skill when ANY of the following fire:

- User message contains frontend keywords (ui, ux, bug, visual,
  layout, render, hydration, style, browser, screenshot, responsive,
  mobile, component, page, modal, form, etc. — full list below)
- Edit touches `src/components/`, `src/pages/`, `src/app/`,
  `src/routes/`, `src/views/`, `src/features/`, `src/screens/`,
  `src/ui/`, `src/widgets/`, `src/layouts/`, or any `*.tsx`,
  `*.jsx`, `*.vue`, `*.svelte`, `*.astro`, `*.mdx`, `*.css`,
  `*.scss`, `*.sass`, `*.less`, `*.module.css`
- Task description mentions frontend, web app, website, dashboard,
  UI, UX, page, form, modal, etc.
- Tool result mentions `localhost`, dev server, or a web URL

If NONE of those fire, this skill is not applicable — exit and
return to normal flow.

## Trigger detection

This skill auto-loads when ANY of these match the user task or
tool result context.

### Keyword triggers (user message)

```
ui, ux, bug, visual, layout, render, rendered, rendering,
hydration, style, styling, styles, css, scss, styled,
browser, screenshot, snapshot, dom, responsive, viewport,
mobile, tablet, desktop, breakpoint, flex, grid,
tailwind, component, page, route, link, button, modal,
click, hover, focus, scroll, animation, transition,
navigation, nav, menu, dropdown, form, input, validation,
error message, broken, doesn't work, not showing, missing,
flicker, jank, layout shift, hydration mismatch
```

### File-path triggers

```
src/components/, src/pages/, src/app/, src/routes/, src/views/,
src/features/, src/screens/, src/ui/, src/widgets/, src/layouts/,
*.tsx,*.jsx, *.vue,*.svelte, *.astro,*.mdx,
*.css, *.scss, *.sass, *.less, *.module.css,
public/index.html, app.html, index.html,
next.config.*, vite.config.*, tailwind.config.*, postcss.config.*
```

### Task-description triggers

```
frontend, frontend bug, FE bug, web app, website, site,
landing page, dashboard, UI, UX, view, screen,
component, page, form, modal, dialog, sidebar, navbar, header, footer
```

### Negative triggers (deliberately do NOT load)

- Pure backend / API / DB / type / state / utils work, even in a
  frontend repo
- Non-web tasks (mobile native, desktop, CLI, infra)
- Pure logic edits to functions with no DOM impact
- Test-file-only edits to unit tests (integration/E2E tests still
  trigger)

If the user message, file path, and task description all lack any
positive trigger AND any negative trigger applies, this skill
should not load. Return to normal flow.

## The 5-step loop

Every trigger fires this loop. Skip rules are documented in the
"Skip-override rules" section below — no silent skipping.

### Step 1 — Open

```
1. browser_open(url=<dev_url>)
   - If no URL: detect dev script (package.json "dev"|"start"|"serve")
     and ask_user_question: "Start <script> via bg_start?"
     If yes → bg_start, wait for HTTP 200, browser_open
     If no → ask_user_question for URL
     If neither → use skip-override "no live URL" (S2)
2. If auth needed → load browser-auth skill, follow it
3. Note session id for later steps
```

The dev-server auto-detect algorithm is documented in the
"Dev-server auto-detect" section below.

### Step 2 — Baseline

```
1. browser_set_viewport(preset="desktop")  (or current viewport)
2. browser_screenshot(
     path=~/.pi/agent/browser-artifacts/fe-loop/baseline-<timestamp>.png,
     full=true)
3. browser_snapshot() → store snapshot text for diff comparison
4. If multi-viewport task (responsive, mobile-check) →
   repeat for tablet + mobile, save as baseline-{viewport}.png
5. browser_console(clear=true) and browser_errors(clear=true)
   → record baseline console/error state
```

The `<timestamp>` placeholder is an ISO-8601 UTC string
(`date -u +%Y%m%dT%H%M%SZ`) — use it consistently across Steps 2,
3, and 5 so artifacts can be cross-referenced.

### Step 3 — Reproduce / understand

Branch by task type:

- **User reports a bug** → reproduce user flow with
  `browser_snapshot` + `browser_click` / `browser_fill`, then
  `browser_console` / `browser_errors` / `browser_network` to
  capture evidence
- **User asks new feature** → `browser_snapshot` current relevant
  page, identify integration points
- **User asks UI polish** → baseline screenshots are the reference;
  no repro needed, skip straight to Step 4

Record evidence under
`~/.pi/agent/browser-artifacts/fe-loop/evidence-<timestamp>/`.

### Step 4 — Edit

Apply minimal code change. Standard Pi rules still apply:

- `context()` / `explore()` before edits
- `lens_diagnostics(delta)` after each edit
- Subagent for ≥3 file edits

No `browser-goblin` tools needed here — pure code work. Resist
the urge to verify mid-edit; verification belongs in Step 5.
