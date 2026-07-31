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
### Step 5 — Verify (systematic case derivation + assertions)

**Three principles replace "look at the screenshot":**

1. **Generate cases** — derive exhaustively from 9 dimensions (below)
2. **Real UI interaction** — click/fill/press/wait, then assert state
3. **Consistency checks** — repeat the flow, compare state across
   viewports, verify regression-free

**5.1 Derivation algorithm**

```
1. Identify affected surfaces (components, routes, APIs touched)
   → surface list S = [s1, s2, ...]

2. For each surface si ∈ S, generate cases across every applicable
   dimension. No dimension skipped without evidence it's inapplicable.

3. Deduplicate (e.g., "empty input" tested once, not per dimension
   where it overlaps).

4. Tag each case:
   MUST  = blocking, must pass before task complete
   SHOULD = blocking on bug-fix / refactor tasks
   NICE   = blocking on UI-polish / responsive tasks
   SKIP   = requires explicit user waiver with reason
```

**5.2 Case dimensions (9, exhaustive)**

**D1. Input dimension** — for every input field / param touched

```
empty / null / undefined
whitespace-only
single char (min valid)
max length
boundary-1, boundary, boundary+1
unicode (CJK, RTL Arabic, emoji)
injection chars (<, >, ', ", &, ;, --)
numbers: 0, -1, MAX_SAFE_INT, NaN-equivalent (empty string→number)
dates: leap day (Feb 29), DST boundary, year boundary, far future
files: empty, oversized, wrong MIME, missing
arrays: empty, single, many (100+), duplicates
```

**D2. State dimension** — for every state machine touched

```
initial / fresh
mid-flow / partial completion
post-success
post-error then retry
post-success then undo / cancel
concurrent: same flow in 2 tabs (race conditions)
stale: refresh mid-flow, back/forward mid-flow
persistence: reload after success, kill+reopen
```

**D3. Auth/permission dimension** — if surface is gated

```
unauthenticated → expect redirect to login
authenticated as each role (user, admin, owner, viewer)
expired token mid-flow → expect re-auth prompt
revoked permission mid-flow → expect graceful 403
impersonation (if supported)
```

**D4. Network dimension** — for every network call touched

```
2xx happy
3xx redirect chain
400 validation error
401 unauthenticated
403 forbidden
404 not found
409 conflict (e.g., duplicate submit)
422 unprocessable
429 rate limited → expect backoff / message
500 server error → expect user-visible error, no crash
503 maintenance → expect retry / fallback
timeout (>30s) → expect loading state + cancel option
offline (kill network mid-flow) → expect offline indicator
partial response (truncated) → expect error, not corrupt UI
```

Simulation: `browser_network` status filter, or `browser_eval` to
monkey-patch fetch / intercept routes.

**D5. Viewport dimension**

```
desktop 1920x1080
laptop  1366x768
tablet  portrait 768x1024, landscape 1024x768
mobile  portrait 375x667, landscape 667x375
narrow  320x568 (smallest mainstream)
ultrawide 3440x1440
```

Set via `browser_set_viewport(preset=...)` or explicit width/height.

**D6. Interaction dimension** — every primary action

```
click (mouse)
Enter / Space (keyboard activation)
Tab + Shift+Tab (focus order)
Escape (cancel/dismiss)
copy + paste (incl. paste-as-plain)
drag + drop (if applicable)
right-click / context menu
touch (long-press) on mobile viewport
swipe (mobile carousel)
browser_back / browser_forward mid-flow
browser_reload mid-flow
multi-tab: open same surface in 2nd tab, mutate in both
```

**D7. Accessibility dimension**

```
keyboard-only full flow (no mouse)
focus visible on every interactive element (snapshot check)
ARIA roles/names correct (snapshot tree)
focus trap inside open modal
Tab order logical (snapshot traversal)
prefers-color-scheme: dark (browser_eval media query)
prefers-reduced-motion: reduce (animations disabled)
zoom 200% (browser_set_viewport scale=2)
screen reader text via snapshot (alt text, aria-label)
```

**D8. Content/locale dimension** — if i18n applies

```
default locale (en)
RTL locale (ar, he) — layout flip check
CJK locale (zh, ja, ko) — line-break / overflow check
long strings (German compounds) — no overflow
short strings (en) — no awkward gaps
missing translation key — graceful fallback
```

**D9. Performance dimension** — for surfaces with scale concerns (lists/tables rendering >50 items, infinite scroll, paginated grids, dashboards, modals that mount/unmount frequently, route transitions, or any change to data-fetching/SSR/streaming code)

```
cold load (first visit): browser_vitals LCP, FCP, TTI
warm load (cached)
list with 100 / 1000 / 10000 items
scroll 5000px (jank, layout shift)
open + close modal 20x (memory leak)
rapid-fire clicks (debounce check)
```

