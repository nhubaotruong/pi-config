# fe-browser-loop — Frontend Work Browser-Verification Skill

**Date:** 2026-07-31
**Status:** Draft

## Motivation

`browser-goblin` is installed in this Pi setup (`npm:browser-goblin` in
`settings.json`), and its 17+ tools are registered (`browser_qa`,
`browser_screenshot`, `browser_open`, `browser_console`, `browser_network`,
etc.). Four bundled skills ship with it: `browser-testing`,
`browser-debugging`, `browser-visual-qa`, `browser-auth`.

Yet agents routinely forget to invoke them on frontend tasks — they edit
`.tsx` files, fix a bug from source alone, and declare done without
opening the page. The current `APPEND_SYSTEM.md` "Frontend Work" section
is 4 lines that list tools without mandating a workflow. The bundled
skills are tool-catalog style ("Use browser_qa on X…") rather than
trigger-first.

Goal: make browser verification of frontend work the default, not an
afterthought.

## Architecture

Two-layer reinforcement, skill carries the load.

```
┌─────────────────────────────────────────────────────────────┐
│  APPEND_SYSTEM.md (always-loaded)                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ## Frontend Work — Browser Loop Required             │  │
│  │ For any frontend work, load skill `fe-browser-loop`   │  │
│  │ and follow it. Mandatory unless skip-overrides apply. │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ pointer only
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  ~/.pi/agent/skills/fe-browser-loop/SKILL.md (loaded on trigger) │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ## Trigger detection                                   │  │
│  │ ## 5-step mandatory loop with tool calls              │  │
│  │ ## Systematic case derivation (9 dimensions)          │  │
│  │ ## Skip-override rules                                │  │
│  │ ## Dev-server auto-detect with confirmation            │  │
│  │ ## Cross-references to browser-testing/debugging/...  │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ composes with
                         ▼
   browser-goblin bundled skills (unchanged):
     browser-testing, browser-debugging, browser-visual-qa, browser-auth
```

**Why this works:** Skill descriptions are matched against user-task
context by Pi's loader. A skill with a strong trigger description
(matched by FE keywords, FE file paths, or FE task descriptions) loads
when relevant. `APPEND_SYSTEM.md` only carries a one-line pointer so it
doesn't bloat the always-loaded context. Skip-overrides live inside the
skill (rule + exception together, easier to maintain).

## Skill trigger detection

**Keyword triggers** (user message contains any of):

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

**File-path triggers** (tool result / current edit touches):

```
src/components/, src/pages/, src/app/, src/routes/, src/views/,
src/features/, src/screens/, src/ui/, src/widgets/, src/layouts/,
*.tsx, *.jsx, *.vue, *.svelte, *.astro, *.mdx,
*.css, *.scss, *.sass, *.less, *.module.css,
public/index.html, app.html, index.html,
next.config.*, vite.config.*, tailwind.config.*, postcss.config.*
```

**Task-description triggers** (parsed from user's stated task):

```
frontend, frontend bug, FE bug, web app, website, site,
landing page, dashboard, UI, UX, view, screen,
component, page, form, modal, dialog, sidebar, navbar, header, footer
```

**Skill `description` frontmatter:**

```yaml
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
```

**Negative triggers** (deliberately NOT loading the skill):

- Pure backend / API / DB / type / state / utils work even in a frontend
  repo
- Non-web tasks (mobile native, desktop, CLI, infra)
- Pure logic edits to functions with no DOM impact
- Test-file-only edits to unit tests (visual E2E still applies if
  integration tests are involved)

## 5-step mandatory loop

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

### Step 3 — Reproduce / understand

Branch by task type:

- **User reports a bug** → reproduce user flow with
  snapshot/click/fill, then `browser_console` / `browser_errors` /
  `browser_network` to capture evidence
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

No `browser-goblin` tools needed here — pure code work.

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

**5.3 Run discipline (what's mandatory)**

```
MUST  always:
  - At least 1 happy-path case (D1 valid input + D5 primary viewport + D6 click)
  - All D4 cases for any network call touched
  - All D2 cases for any state machine touched
  - All D5 viewports if task touches layout / responsive

SHOULD by task type:
  - Bug fix       → original repro + D2 stale + D4 5xx
  - New feature   → D1 all boundaries + D6 keyboard + D7 a11y baseline
  - UI polish     → D5 all viewports + D7 focus + D9 perf snapshot
  - Refactor      → D2 reload + D2 concurrent + D3 role coverage
  - Auth change   → all D3 cases
  - i18n change   → all D8 cases

NICE (run if time / user requests):
  - D9 perf deep dives
  - D8 full locale matrix
  - D6 multi-tab races beyond 2 tabs
```

**5.4 Per case: real interaction + assertion**

```
For each generated case:
  1. Navigate to relevant URL via browser_open / browser_reload
  2. browser_snapshot() → get refs
  3. Execute real interaction sequence:
       browser_click(@eN) / browser_fill(@eN, "value") /
       browser_press("Enter"|"Tab"|"Escape") /
       browser_wait(text="expected", mode="text") or
       browser_wait(target="@eN", state="visible")
  4. Assert state (must pass all):
       ✓ browser_console: zero NEW errors vs baseline
       ✓ browser_errors: zero NEW page errors
       ✓ browser_network: zero NEW 4xx/5xx (or expected 2xx)
       ✓ browser_snapshot: expected text/ref present
       ✓ browser_screenshot: visual sanity for layout/visual tasks
       ✓ browser_eval (sparingly): computed style / state value when needed
  5. Record: case name, interaction trace, assertion results
```

**5.5 Consistency checks**

For tasks touching state, persistence, or shared layouts:

```
A. Repeat the same flow 2x on the same viewport
   → assert identical post-state (text, network calls, console)
B. Repeat across desktop + tablet + mobile
   → assert same content / different layout (no broken reflow)
C. browser_reload after the fix
   → assert state persists or resets as expected
D. browser_back / browser_forward on SPA flows
   → assert URL and snapshot match expectations
E. Open fresh session (browser_close + browser_open) for state-leak bugs
```

**5.6 Pass/fail gate**

- ALL non-waived MUST cases must pass all 6 assertions (5.4)
- ALL consistency checks (5.5) that apply to the task type must pass
- Any failed case → BLOCK task complete, return to Step 4 with evidence
- Skill outputs a final verify report (see "Report format" below)
- SHOULDs and NICEs may be waived per §Skip-override rules; un-waivered SHOULDs block PASS verdict
## Skip-override rules

Every MUST case from §5 can be skipped, but only with explicit evidence
- user approval. No silent skipping.

| ID | Skip                                  | Evidence required                                                              | Approval required                                       |
| -- | ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| S1 | User explicitly says "skip browser"   | direct quote in current or prior message                                       | none — already explicit                                 |
| S2 | No live URL + no dev script in repo   | `browser_open` fails 3x + no `dev`/`start`/`serve` in `package.json`           | `ask_user_question` with reason                         |
| S2 | No live URL + no dev script in repo   | `browser_open` returns connection refused / DNS failure / HTTP 4xx-5xx on 3 sequential URLs; no `dev`/`start`/`serve` in `package.json`; no static fallback viable | `ask_user_question` with reason                         |
| S4 | Pure non-FE edit                      | no `.tsx`/`.css`/etc. edited; trigger guardrail (shouldn't fire)               | none — trigger guardrail                                |
| S5 | No code change made (analysis-only)   | zero file edits in this turn                                                   | none — no fix to verify                                 |
| S6 | Same surface verified green recently  | artifact manifest < 30 min old, same surface, same task                        | `ask_user_question`: "Reuse verify from `<timestamp>`?" |
| S6 | Same surface verified green recently  | artifact manifest < 30 min old, same surface (same component/route IDs), same triggering task description (exact string match or fuzzy ≥0.85 similarity) | `ask_user_question`: "Reuse verify from `<timestamp>`?" |
| S8 | Authenticated flow with no test acct  | browser-auth skill reports no viable auth path                                 | `ask_user_question`: "Auth flow blocked, continue without auth-gated cases?" |
| S9 | CI / non-interactive environment      | no TTY, `PI_NONINTERACTIVE=1` or similar                                       | none — environment blocks loop                          |

### Approval workflow

For skips requiring `ask_user_question`:

```
ask_user_question(
  question: "Skip browser verification because <reason>?"
  options:
    - "Yes, skip and document waiver"  [recommended if evidence is solid]
    - "No, attempt verify anyway"      [fall through to Step 5 normally]
    - "Reduce scope to <subset>"       [user picks partial coverage]
)
```

Each approval is recorded in the final report's "Waivers" section.

### Report format

```
=== fe-browser-loop report ===
Task: <description>
Surfaces: <list>

Cases run: <count by MUST/SHOULD/NICE>
  ✓ <case>: <n>/<n> assertions
  ✗ <case>: <assertion that failed>
  ...

Consistency:
  ✓ / ✗ <check>

Console delta: <+N new errors, 0 expected>
Network delta:  <+N new 4xx/5xx, expected <M>>

Waivers:
  S2: dev server unreachable — user approved
  S7: user provided screenshot evidence — user approved
  ...

Artifacts: ~/.pi/agent/browser-artifacts/fe-loop/<timestamp>/
Verdict: PASS / FAIL / PASS-WITH-WAIVERS
```

`PASS-WITH-WAIVERS` is valid when:

- All non-waived MUST cases pass
- All SHOULD cases pass (or waived)
- Waivers are user-approved
- No unaddressed failures

`FAIL` blocks task completion regardless of other work done.

### Anti-patterns (skill explicitly forbids)

- ❌ Silent skip with no waiver recorded
- ❌ "I think it works" without any browser interaction
- ❌ Reading console output without clicking through the flow first
- ❌ Skipping because "the change is small" (size is not evidence)
- ❌ Skipping reload-persistence check on state-touching changes
- ❌ Skipping mobile viewport because "user didn't ask for mobile"
  (responsive is the user's expectation unless they say otherwise)

## Dev-server auto-detect (with confirmation)

**Detection algorithm (skill mandates):**

```
1. Search repo for package.json scripts (priority order):
     dev, start, serve, develop, vite, next dev, ng serve,
     npm run dev, pnpm dev, yarn dev
   Also check:
     - index.html at root (static site, no server needed)
     - dist/, build/, out/ directories (built site, serve with python -m http.server or similar)
     - Makefile targets: dev, serve, start
     - docker-compose.yml service marked "dev" / "app"

2. If dev script found:
     ask_user_question(
       question: "No live URL detected. Start '<script>' via bg_start?"
       options:
         - "Yes, start it and wait for ready"  [recommended]
         - "No, I'll provide a URL"
         - "No, skip browser verification (waiver S2)"
     )

3. If yes:
     bg_start(command=<script>, title="fe-loop dev server")
     Poll URL with curl/http until 200 OR timeout 60s
     On timeout: ask_user_question (retry / different URL / skip)

4. If no script found:
     ask_user_question(
       question: "No dev script found. Provide a URL or skip verification?"
       options:
         - "I'll provide a URL"
         - "Skip browser verification (waiver S2)"
         - "Serve static build with python -m http.server"
     )
```

**Defaults & env overrides:**

- `PI_FE_BROWSER_LOOP_DEV_TIMEOUT=60` (seconds)
- `PI_FE_BROWSER_LOOP_AUTO_START=false` (default: confirm before
  starting; user opts into silent)
- Poll: `curl -sf -o /dev/null -w "%{http_code}" <url>` every 2s

**Don't:**

- Start the dev server if a healthy server is already responding on a
  candidate URL
- Reuse a stale `bg_start` terminal from prior tasks without verifying
  it's still alive
- Spawn `npm install` automatically (out of scope; prompt user)

## File locations

```
~/.pi/agent/skills/fe-browser-loop/SKILL.md     (NEW — the umbrella skill)
~/.pi/agent/APPEND_SYSTEM.md                    (EDIT — Frontend Work section rewrite)
docs/superpowers/specs/2026-07-31-fe-browser-loop-design.md  (this file)
```

**Why these locations:**

- `~/.pi/agent/skills/` is the Pi-native skill root (alongside `system/`,
  `subagents/`, etc.). Bundled `browser-goblin` skills live in
  `npm/node_modules/browser-goblin/skills/` and are **not** edited (per
  "leave upstream packages alone" rule).
- `APPEND_SYSTEM.md` is the always-loaded system prompt. The edit is
  minimal — one section rewrite, no new sections added.
- Specs in `docs/superpowers/specs/` per brainstorming skill default.

**APPEND_SYSTEM.md edit scope:**

```
Replace existing "## Frontend Work" block (~4 lines) with:

## Frontend Work — Browser Loop Required

For any frontend work (UI, UX, layout, styling, hydration, visual bugs,
browser-based testing, or edits to components/pages/styles), load skill
`fe-browser-loop` and follow it. The skill enforces a 5-step
open→baseline→repro→edit→verify loop with systematic case derivation and
user-waivered skip rules. Do not declare a frontend task complete without
either browser verification passing or an explicit user waiver recorded
in the report. Frontend keywords and file-path triggers are listed in the
skill description; if any fire, load the skill.
```

(That's ~10 lines, replacing 4. Targeted edit, no scope creep.)

## Error handling

| Scenario                                   | Behavior                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `browser_open` URL fails                   | Retry once with `/` appended; if still fails, fall through to dev-server detect; if still nothing, offer S2 waiver |
| Dev server timeout                         | `ask_user_question`: retry / different URL / skip (S2)                                                         |
| Mid-flow console error appears post-edit   | Add to "Console delta" in report; BLOCK verdict; agent returns to Step 4                                       |
| Browser tools disabled mid-task            | Use S3 waiver; report shows partial verify; verdict = PASS-WITH-WAIVERS                                        |
| Auth flow has no test account              | S8 waiver; auth-gated cases (D3) skipped; report documents                                                     |
| `browser_set_viewport` preset unrecognized  | Fall back to explicit width/height with documented values                                                      |
| Agent overload: too many cases to run      | Run all MUST first; SHOULD if time; NICE only if user requests. Document skipped NICE in report.               |
| Same task triggers skill repeatedly        | Track surface IDs in artifact manifest; S6 waiver offered if same surface verified < 30 min ago               |

## Validation plan

| ID  | Test                                                       | Expected                                                                                  |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| V1  | Trigger: "fix the button color on /pricing"                | Skill loads automatically (frontend keyword + style path)                                |
| V2  | Guardrail: "refactor the database connection pool"         | Skill does NOT load (no frontend trigger)                                                 |
| V3  | Loop: "fix the broken checkout form on localhost:3000"     | All 5 steps run end-to-end with real browser interactions                                 |
| V4  | Derivation: "add email field to signup form"               | D1 boundaries, D2 form state, D4 network, D5 viewports, D7 keyboard all appear in cases  |
| V5  | Waiver: "fix bug, no dev server available"                 | S2 waiver via `ask_user_question`, recorded in report                                    |
| V6  | Pass-with-waivers: user provides screenshot                | S7 waiver, PASS-WITH-WAIVERS verdict                                                      |
| V7  | Fail-block: edit doesn't fix mobile modal                  | FAIL verdict, agent returns to Step 4                                                     |
| V8  | APPEND_SYSTEM.md pointer: new session, no skill loaded     | System prompt's pointer causes skill load on first frontend trigger                       |
| V9  | Consistency: "fix the dropdown that sometimes doesn't open" | Repeat 2x same flow, run across 3 viewports, all assertions pass                          |

## Out of scope (explicit non-goals)

- No automated screenshot diffing (left as NICE; image-comparison tooling
  not assumed)
- No CI integration (skill targets interactive Pi sessions)
- No performance-budget enforcement (D9 cases are NICE, not MUST)
- No cross-browser testing (agent-browser = Chromium only; documented
  limitation)
- No editing the bundled `browser-goblin` skills (out of scope; would
  conflict with package updates)

## Edge cases

- **Skill loads but trigger was wrong** — skill self-checks against the
  "Negative triggers" list on load; if pure non-FE work is detected,
  skill prints "fe-browser-loop loaded but trigger not applicable;
  exiting" and returns to normal flow.
- **Multiple surfaces in one task** — Step 5 derives cases for each
  surface; report lists per-surface results.
- **Cross-repo frontend work** (monorepo) — skill runs per package;
  surfaces list scoped to the package containing the edited files.
- **Pre-existing baseline console errors** — recorded as baseline; "new
  errors" delta is what matters, not absolute count.
- **Tool result mentions FE keywords but actual work is unrelated** —
  trigger fires; Step 1 self-check confirms no dev URL / no FE files
  touched → S4 exit path.
- **Session interrupted mid-loop** — artifact manifest on disk records
  last completed step; resume continues from there if user re-engages.
