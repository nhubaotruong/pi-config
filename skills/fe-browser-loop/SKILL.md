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
  Visual evidence (screenshots, layout, rendered-vs-accessibility-tree
  comparison) is delegated to a dedicated vision-capable agent
  (ollama-cloud/kimi-k2.7-code, xhigh thinking) defined in this skill.
  Every pass also hunts UI/UX edge cases, glitches, and visual bugs.
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

```text
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

```text
src/components/, src/pages/, src/app/, src/routes/, src/views/,
src/features/, src/screens/, src/ui/, src/widgets/, src/layouts/,
*.tsx,*.jsx, *.vue,*.svelte, *.astro,*.mdx,
*.css, *.scss, *.sass, *.less, *.module.css,
public/index.html, app.html, index.html,
next.config.*, vite.config.*, tailwind.config.*, postcss.config.*
```

### Task-description triggers

```text
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

Each browser_qa/screenshot run writes a manifest at `<artifact-dir>/manifest.json` with timestamps and surface IDs; the artifact manifest referenced in Step 5 and edge cases is this file.

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
       ✓ browser_screenshot: visual check via the vision verification
         agent (see "Vision verification agent" below) for layout/visual tasks
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
- SHOULDs and NICEs may be waived per §Skip-override rules;
  un-waivered SHOULDs block PASS verdict

## Vision verification agent (dedicated)

Visual evidence — screenshots, layout, rendered-vs-accessibility-tree
comparison — cannot be judged by the main text-only model. For any
Step 5 case whose assertions include visual checks (D5 viewports,
D7 a11y tree, layout/UI-polish tasks), delegate the visual pass to
the dedicated vision agent instead of guessing from snapshots.

### Spawn (fixed parameters)

```ts
const result = await agents.run({
  name: "fe-browser-loop-verifier",
  model: "ollama-cloud/kimi-k2.7-code", // vision-capable
  thinking: "xhigh",
  extensions: true, // captured pi-browser tools are extension tools
  // omit `tools` — inherits the parent's full tool set (pi-browser included)
  // no systemPrompt param on agents.run — embed the persona (below) at the
  // top of the task string, then the verification task itself
  task: `${VISION_VERIFIER_PROMPT}\n\nVerification task:\n<url, cases, expected behavior, report format>`,
});
```

Use `agents.run` (blocking) when the loop needs the findings inline;
`agents.spawn` + `agents.wait` for background passes. Never change
model or thinking — vision + xhigh reasoning are the point.

### Persona — prepend to every task (no systemPrompt param)

`agents.run` / `agents.spawn` accept no `systemPrompt` — the persona
below is embedded at the top of the `task` string, followed by the
concrete verification task. Copy it verbatim:

```text
You are a frontend verification engineer with vision, working as the
visual-evidence engine of the fe-browser-loop. You verify web UIs
through real user behavior in a browser.

Tools (pi-browser, called as extensions.* inside fabric_exec):
- browser_qa: one-command visual QA — screenshots at desktop/tablet/mobile, console errors, network 4xx/5xx, vitals.
- browser_snapshot: accessibility tree with stable element refs (@refs).
- browser_open / browser_click / browser_fill / browser_press / browser_back / browser_forward / browser_reload / browser_tabs / browser_close: behavioral interaction.
- browser_screenshot: targeted screenshots (optionally annotated).
- browser_set_viewport: responsive checks.
- browser_console / browser_errors / browser_network / browser_vitals / browser_debug: diagnostics.
- browser_eval / browser_read / browser_wait: page inspection and synchronization.

Workflow for every verification task:
1. Open the URL (or reuse the session) and capture a browser_qa pass: screenshots at desktop/tablet/mobile, console errors, network failures, vitals.
2. Take a browser_snapshot to get the accessibility tree with stable refs.
3. Act like a user: click buttons, open menus, submit forms, navigate — verify each interaction's visible result in a screenshot. Re-snapshot after every page change to get fresh refs.
4. Compare rendered screenshots against the accessibility tree: every visible interactive element must exist in the tree with a sensible role/name; every tree element must be visible and usable. Flag mismatches (missing labels, invisible focus targets, elements not in the tree, broken states).
5. Check console/network/vitals for errors introduced by the interactions.
6. Report findings as a ranked list: severity, element (role/name/ref), what was done, what was observed (screenshot evidence), expected vs actual, reproduction steps. Do not edit code — verify and report only.
```

### Integration with the loop

- The main agent keeps loop discipline: case derivation (5.1–5.3),
  waivers, and the final verdict. The vision agent executes the
  visual/behavioral cases and returns evidence.
- Feed the agent's findings into the 5.4 assertions and the report
  ("Vision" line below).
- The agent cannot see this conversation — the task string must be
  self-contained: persona (above) + URL, cases, expected behavior,
  report format in one string.
- Browser sessions persist per worktree; pass the same `session` to
  browser tools to keep state across calls.
- If the target app is local, start the dev server first (see
  Dev-server auto-detect) and pass the local URL.

## UI/UX bug hunting (edge cases & glitches)

Verification is not just "does the change work" — actively hunt for
UI/UX defects on every frontend task. Treat the app as a hostile user
would: break it, stress it, look at it from every viewport. This runs
in parallel with Step 5 case verification; findings are bugs, not just
pass/fail assertions.

### What to hunt (checklist)

### Visual glitches

- flicker / jank / layout shift (CLS) on load, navigation, data change
- misaligned, overlapping, or clipped elements; text cut off or
  overflowing without ellipsis
- broken images / icons, wrong aspect ratios, blurry assets
- inconsistent spacing, borders, shadows, radii across states
- hover / focus / active / visited / disabled state styling missing or
  broken; transitions that jump or never settle

### State & edge cases

- empty / loading / error / success states for every data surface
- boundary inputs (D1), rapid-fire clicks, double-submit, race
  conditions, back/forward/reload mid-flow
- stale UI after data change; optimistic updates that never reconcile
- long content, unicode / RTL / CJK, zoom 200%, prefers-reduced-motion

### Interaction bugs

- dead clicks (element looks clickable but does nothing)
- missing feedback (no hover, no press state, no toast/error)
- focus loss, scroll traps, sticky-header overlap, modal/tooltip
  mispositioning, z-index fights

### Responsive glitches

- horizontal scroll, squished or stretched layouts, broken grids
- touch targets < 44px, hover-only interactions on touch
- breakpoint jumps, content hidden at a viewport with no alternative

### How to hunt

- **Visual hunt → vision agent.** Spawn `fe-browser-loop-verifier`
  (see "Vision verification agent" above) with a glitch-hunting task:
  screenshots at every viewport, hover/focus/active states, common
  flows, and a ranked list of visual defects with screenshot evidence.
- **Logic/state hunt → main agent.** browser_snapshot + console/
  network deltas across the D1/D2/D4/D6 cases; assert every state
  renders something sensible.
- Every finding is a bug report: severity, element (role/name/ref),
  viewport, reproduction steps, screenshot evidence. Feed into the
  report's "UI/UX findings" section.
- A found UI/UX bug blocks the PASS verdict like any failed case;
  fix it in Step 4 and re-verify.

## Skip-override rules

Every MUST case from Step 5 can be skipped, but only with explicit
evidence + user approval. No silent skipping.

| ID | Skip                                  | Evidence required                                                              | Approval required                                       |
| -- | ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| S1 | User explicitly says "skip browser"   | direct quote in current or prior message                                       | none — already explicit                                 |
| S2 | No live URL + no dev script in repo   | `browser_open` returns connection refused / DNS failure / HTTP 4xx-5xx on 3 sequential URLs; no `dev`/`start`/`serve` in `package.json`; no static fallback viable | `ask_user_question` with reason                         |
| S3 | Browser tools disabled                | `/browser-tools core` returns error or tools missing                           | none — environment blocks loop                          |
| S4 | Pure non-FE edit                      | no `.tsx`/`.css`/etc. edited; trigger guardrail (shouldn't fire)               | none — trigger guardrail                                |
| S5 | No code change made (analysis-only)   | zero file edits in this turn                                                   | none — no fix to verify                                 |
| S6 | Same surface verified green recently  | artifact manifest < 30 min old, same surface (same component/route IDs), same triggering task description (exact string match or fuzzy ≥0.85 similarity) | `ask_user_question`: "Reuse verify from `<timestamp>`?" |
| S7 | User provides pre-verified evidence   | user pastes screenshot / artifact path / "I just checked it works"             | `ask_user_question`: "Trust user's evidence for this case?" |
| S8 | Authenticated flow with no test acct  | browser-auth skill reports no viable auth path                                 | `ask_user_question`: "Auth flow blocked, continue without auth-gated cases?" |
| S9 | CI / non-interactive environment      | no TTY, `PI_NONINTERACTIVE=1` or similar                                       | none — environment blocks loop                          |

### Approval workflow

For skips requiring `ask_user_question`:

<!-- This is a description of the ask_user_question call, not runnable syntax. The actual tool takes question, options array, multiSelect, etc. -->
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
Vision:         <n>/<n> visual checks passed (screenshots, layout, a11y tree)

UI/UX findings:
  [SEV] <element>: <bug> @ <viewport> — <repro> (evidence: <artifact>)
  ...

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

- Start the dev server if a healthy server is already responding on
  a candidate URL
- Reuse a stale `bg_start` terminal from prior tasks without
  verifying it's still alive
- Spawn `npm install` automatically (out of scope; prompt user)

## Bundled skill cross-references

This umbrella skill enforces the loop and owns the workflow. For
deep how-to on specific workflows, load the matching bundled
`browser-goblin` skill:

| Sub-workflow                                  | Load this skill         |
| --------------------------------------------- | ----------------------- |
| E2E flow testing, regression checks           | `browser-testing`       |
| JS errors, hydration, network tracing, debug  | `browser-debugging`     |
| Visual polish, responsive screenshots, a11y   | `browser-visual-qa`     |
| Login flows, sessions, profile reuse, state   | `browser-auth`          |

Always load this `fe-browser-loop` skill first; the bundled skills
provide the deep patterns, this skill provides the loop discipline.

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

## Edge cases

- **Skill loads but trigger was wrong** — skill self-checks against
  the "Negative triggers" list on load; if pure non-FE work is
  detected, skill prints "fe-browser-loop loaded but trigger not
  applicable; exiting" and returns to normal flow.
- **Multiple surfaces in one task** — Step 5 derives cases for each
  surface; report lists per-surface results.
- **Cross-repo frontend work** (monorepo) — skill runs per package;
  surfaces list scoped to the package containing the edited files.
- **Pre-existing baseline console errors** — recorded as baseline;
  "new errors" delta is what matters, not absolute count.
- **Tool result mentions FE keywords but actual work is unrelated**
  — trigger fires; Step 1 self-check confirms no dev URL / no FE
  files touched → S4 exit path.
- **Session interrupted mid-loop** — artifact manifest on disk
  records last completed step; resume continues from there if user
  re-engages.
