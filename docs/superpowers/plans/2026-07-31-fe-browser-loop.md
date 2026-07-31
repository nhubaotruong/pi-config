# fe-browser-loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pi umbrella skill `fe-browser-loop` that enforces browser verification of frontend work, plus a system-prompt pointer so agents reliably invoke `browser-goblin` tools for FE tasks instead of forgetting.

**Architecture:** Two-layer reinforcement. The umbrella skill (single markdown file at `~/.pi/agent/skills/fe-browser-loop/SKILL.md`) is the source of truth — it carries the trigger description, the 5-step loop, the 9-dimension case derivation, skip-override rules, dev-server auto-detect, and cross-references to the 4 bundled `browser-goblin` skills (`browser-testing`, `browser-debugging`, `browser-visual-qa`, `browser-auth`). The system prompt (`APPEND_SYSTEM.md`) gets a 10-line rewrite of the "Frontend Work" section that points at the skill. The bundled `browser-goblin` skills are NOT touched.

**Tech Stack:** Markdown (skill files + spec), `git` for commits, no code dependencies. The skill is consumed by Pi's loader via frontmatter `description:` field matching against user-task context.

## Global Constraints

- Skill file lives at exactly `~/.pi/agent/skills/fe-browser-loop/SKILL.md`
- Skill must have a YAML frontmatter `description:` field with trigger keywords/paths so Pi loads it on FE work
- The bundled `browser-goblin` skills under `npm/node_modules/browser-goblin/skills/` are NEVER edited (out of scope; would conflict with package updates)
- `APPEND_SYSTEM.md` Frontend Work section rewrite is a target edit of ~10 lines replacing ~4 lines, no scope creep
- Commit messages follow Conventional Commits format (per `APPEND_SYSTEM.md` rule): `feat|fix|docs(scope): subject`, ≤72 chars, present tense
- Each task ends with one git commit
- Skill content prose must match the spec sections — verification per task is "read your output, confirm it covers every bullet from spec section X.Y"
- No `TBD`, `TODO`, "fill in later", or placeholder prose in any output file
- Spec lives at `docs/superpowers/specs/2026-07-31-fe-browser-loop-design.md` — read it before writing any skill section

## File Structure

```
~/.pi/agent/skills/fe-browser-loop/
└── SKILL.md                          # NEW — single umbrella skill (~500 lines)
~/.pi/agent/APPEND_SYSTEM.md          # EDIT — Frontend Work section (~10 lines)
docs/superpowers/plans/
└── 2026-07-31-fe-browser-loop.md     # this file
```

## Task Order Rationale

Tasks 1-7 build `SKILL.md` section by section (each independently reviewable). Task 8 edits `APPEND_SYSTEM.md` (depends on Task 1 because the prompt pointer references the skill). Task 9 validates against V1-V9 from the spec.

---

### Task 1: Scaffold skill directory and write frontmatter + header

**Files:**

- Create: `~/.pi/agent/skills/fe-browser-loop/SKILL.md`

**Interfaces:**

- Consumes: nothing (first task)
- Produces: skill file with frontmatter + H1 title + "When to use this skill" intro

- [ ] **Step 1: Create the directory and write the file**

Create the skill directory:

```bash
mkdir -p ~/.pi/agent/skills/fe-browser-loop
```

Write the initial `~/.pi/agent/skills/fe-browser-loop/SKILL.md` with frontmatter and header:

```markdown
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
```

The full trigger keyword/path lists are written in Task 2.

- [ ] **Step 2: Verify the file exists and frontmatter parses**

Run:

```bash
ls -la ~/.pi/agent/skills/fe-browser-loop/SKILL.md
head -20 ~/.pi/agent/skills/fe-browser-loop/SKILL.md
```

Expected: file exists; first 20 lines show the YAML frontmatter
between `---` markers, followed by the `# fe-browser-loop` H1.

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): scaffold fe-browser-loop umbrella skill"
```

---

### Task 2: Write trigger detection section (full keyword + file-path lists)

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new section)

**Interfaces:**

- Consumes: skill file from Task 1 (frontmatter + header already present)
- Produces: skill file with full `## Trigger detection` section appended

- [ ] **Step 1: Read current skill file to get the HASH anchors**

Run:

```bash
wc -l ~/.pi/agent/skills/fe-browser-loop/SKILL.md
```

Note the line count so you can append cleanly.

- [ ] **Step 2: Append the trigger detection section**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 3: Verify section content matches spec**

Open the skill file and confirm:

- Section heading is `## Trigger detection`
- Three subsections: "Keyword triggers", "File-path triggers",
  "Task-description triggers"
- Keyword list contains `hydration`, `screenshot`, `responsive`,
  `modal`, `flicker`, `layout shift`, `hydration mismatch`
- File-path list contains `src/components/`, `*.tsx`, `*.css`,
  `next.config.*`
- Negative triggers section lists all four bullets from spec
  §"Negative triggers"

Reference: spec §"Skill trigger detection".

- [ ] **Step 4: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add fe-browser-loop trigger detection section"
```

---

### Task 3: Write Steps 1-2 (Open and Baseline) of the 5-step loop

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new section)

**Interfaces:**

- Consumes: skill file from Task 2 (trigger detection section complete)
- Produces: skill file with `## The 5-step loop` + `### Step 1 — Open` + `### Step 2 — Baseline`

- [ ] **Step 1: Append the loop overview and Steps 1-2**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 2: Verify Steps 1-2 match spec**

Open the skill file and confirm:

- Section heading is `## The 5-step loop`
- `### Step 1 — Open` exists and contains all 3 numbered substeps
  from spec §"Step 1 — Open"
- `### Step 2 — Baseline` exists and contains all 5 numbered
  substeps from spec §"Step 2 — Baseline"
- Baseline screenshot path uses `~/.pi/agent/browser-artifacts/fe-loop/`
- Baseline console/error state recorded via `clear=true`

Reference: spec §"Step 1 — Open" and §"Step 2 — Baseline".

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add loop Steps 1-2 (open, baseline)"
```

---

### Task 4: Write Steps 3-4 (Reproduce/understand, Edit) of the loop

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new section)

**Interfaces:**

- Consumes: skill file from Task 3 (Steps 1-2 complete)
- Produces: skill file with `### Step 3 — Reproduce / understand` + `### Step 4 — Edit`

- [ ] **Step 1: Append Steps 3-4**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 2: Verify Steps 3-4 match spec**

Open the skill file and confirm:

- `### Step 3 — Reproduce / understand` exists with all three
  task-type branches (bug, new feature, UI polish)
- Evidence directory path matches spec:
  `~/.pi/agent/browser-artifacts/fe-loop/evidence-<timestamp>/`
- `### Step 4 — Edit` lists all three Pi rules (context/explore,
  lens_diagnostics, subagent threshold) and notes "verification
  belongs in Step 5"

Reference: spec §"Step 3 — Reproduce / understand" and §"Step 4 — Edit".

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add loop Steps 3-4 (reproduce, edit)"
```

---

### Task 5: Write Step 5 overview + derivation algorithm + 9 case dimensions

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new section)

**Interfaces:**

- Consumes: skill file from Task 4 (Steps 1-4 complete)
- Produces: skill file with `### Step 5 — Verify` + `**5.1 Derivation algorithm**` + `**5.2 Case dimensions (9, exhaustive)**` covering D1-D9

- [ ] **Step 1: Append Step 5 overview, derivation algorithm, and D1-D9**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 2: Verify Step 5 sections match spec**

Open the skill file and confirm:

- `### Step 5 — Verify` heading present
- Three principles listed (generate, interact, consistency)
- `**5.1 Derivation algorithm**` subsection has 4 numbered steps
  matching spec §"5.1 Derivation algorithm"
- `**5.2 Case dimensions (9, exhaustive)**` heading present
- All 9 dimensions D1-D9 present with correct bullets:
  - D1 has 11 bullets including `injection chars (<, >, ', ", &, ;, --)`
  - D4 has 14 bullets including `partial response (truncated)`
  - D5 has 6 viewports including `ultrawide 3440x1440`
  - D7 has 8 bullets including `prefers-reduced-motion`
  - D9 trigger description includes `(lists/tables rendering >50 items, infinite scroll, paginated grids, dashboards, modals that mount/unmount frequently, route transitions, or any change to data-fetching/SSR/streaming code)`

Reference: spec §"Step 5 — Verify" and §"5.2 Case dimensions".

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add Step 5 case derivation + 9 dimensions"
```

---

### Task 6: Write Step 5.3-5.6 (run discipline, per-case flow, consistency, pass/fail)

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new section)

**Interfaces:**

- Consumes: skill file from Task 5 (D1-D9 complete)
- Produces: skill file with `**5.3 Run discipline**`, `**5.4 Per case**`, `**5.5 Consistency checks**`, `**5.6 Pass/fail gate**`

- [ ] **Step 1: Append 5.3-5.6**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
- SHOULDs and NICEs may be waived per §Skip-override rules;
  un-waivered SHOULDs block PASS verdict
```

- [ ] **Step 2: Verify 5.3-5.6 match spec**

Open the skill file and confirm:

- `**5.3 Run discipline (what's mandatory)**` heading present with
  the MUST / SHOULD-by-task-type / NICE subsections verbatim
- `**5.4 Per case: real interaction + assertion**` heading present
  with all 5 numbered steps including the 6 ✓ assertions
- `**5.5 Consistency checks**` heading present with 5 lettered checks A-E
- `**5.6 Pass/fail gate**` heading present with all 5 bullets,
  especially "ALL non-waived MUST cases must pass all 6 assertions (5.4)"

Reference: spec §"5.3 Run discipline", §"5.4 Per case", §"5.5 Consistency checks", §"5.6 Pass/fail gate".

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add Step 5 run discipline + assertions + consistency + gate"
```

---

### Task 7: Write skip-override rules (S1-S9 + approval + report + anti-patterns)

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new section)

**Interfaces:**

- Consumes: skill file from Task 6 (Step 5 complete)
- Produces: skill file with `## Skip-override rules` section including S1-S9 table, approval workflow, report format, anti-patterns

- [ ] **Step 1: Append skip-override rules**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 2: Verify skip-override section matches spec**

Open the skill file and confirm:

- Section heading `## Skip-override rules` present
- S1-S9 table has exactly 9 rows (S1 through S9) with all 4 columns
- S2 evidence column mentions "connection refused / DNS failure /
  HTTP 4xx-5xx on 3 sequential URLs"
- S6 evidence column mentions "fuzzy ≥0.85 similarity"
- `### Approval workflow` shows the 3-option `ask_user_question`
- `### Report format` shows the full template with `Verdict: PASS /
  FAIL / PASS-WITH-WAIVERS`
- `### Anti-patterns` lists all 6 ❌ bullets verbatim

Reference: spec §"Skip-override rules".

- [ ] **Step 3: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add skip-override rules + approval + report + anti-patterns"
```

---

### Task 8: Write dev-server auto-detect + cross-references + error handling + edge cases

**Files:**

- Modify: `~/.pi/agent/skills/fe-browser-loop/SKILL.md` (append new sections)

**Interfaces:**

- Consumes: skill file from Task 7 (skip rules complete)
- Produces: skill file with `## Dev-server auto-detect`, `## Bundled skill cross-references`, `## Error handling`, `## Edge cases` sections

- [ ] **Step 1: Append dev-server detection**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 2: Append error handling and edge cases**

Append to `~/.pi/agent/skills/fe-browser-loop/SKILL.md`:

```markdown

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
```

- [ ] **Step 3: Verify dev-server + cross-refs + error + edge sections**

Open the skill file and confirm:

- `## Dev-server auto-detect (with confirmation)` heading present
  with all 4 numbered detection steps, env defaults, and "Don't:" list
- `## Bundled skill cross-references` heading present with 4-row
  table referencing `browser-testing`, `browser-debugging`,
  `browser-visual-qa`, `browser-auth`
- `## Error handling` heading present with 8-row scenario table
- `## Edge cases` heading present with 6 bullet scenarios

Reference: spec §"Dev-server auto-detect", §"Error handling", §"Edge cases".

- [ ] **Step 4: Commit**

```bash
cd ~/.pi/agent
git add skills/fe-browser-loop/SKILL.md
git commit -m "feat(skill): add dev-server detect + cross-refs + error/edge sections"
```

---

### Task 9: Rewrite APPEND_SYSTEM.md Frontend Work section

**Files:**

- Modify: `~/.pi/agent/APPEND_SYSTEM.md` (replace "## Frontend Work" block)

**Interfaces:**

- Consumes: skill file from Task 1 (must exist; pointer references `fe-browser-loop`)
- Produces: edited APPEND_SYSTEM.md with new "## Frontend Work — Browser Loop Required" section

- [ ] **Step 1: Read current APPEND_SYSTEM.md to find the existing Frontend Work section**

Run:

```bash
grep -n "^## Frontend Work" ~/.pi/agent/APPEND_SYSTEM.md
```

Note the line number. Then read ~10 lines starting there to get
the exact existing content.

- [ ] **Step 2: Replace the existing Frontend Work block**

Use `replace` with the existing block as `oldText` and the new
block as the replacement. The existing block (per the spec) is
~4 lines starting with `## Frontend Work` and listing
`browser_qa`, `browser_screenshot`, `browser_debug`,
`browser_snapshot`. The replacement is:

```
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

- [ ] **Step 3: Verify the edit**

Run:

```bash
grep -A 12 "^## Frontend Work" ~/.pi/agent/APPEND_SYSTEM.md
```

Expected output:

- Line 1: `## Frontend Work — Browser Loop Required`
- Lines 2-4: 3-line paragraph mentioning frontend keywords and
  `fe-browser-loop`
- Lines 5-7: 3-line paragraph about the 5-step loop and skip rules
- Line 8: final paragraph about the pointer

The new section should be ~9-12 lines total, replacing the
previous ~4-line tool-catalog block.

- [ ] **Step 4: Verify pointer references the skill that exists**

Run:

```bash
test -f ~/.pi/agent/skills/fe-browser-loop/SKILL.md && echo "skill exists"
```

Expected: `skill exists`.

- [ ] **Step 5: Commit**

```bash
cd ~/.pi/agent
git add APPEND_SYSTEM.md
git commit -m "docs(system): rewrite Frontend Work pointer to fe-browser-loop skill"
```

---

### Task 10: Manual validation against V1-V9

**Files:** none (validation only); record results in a comment on
the final commit.

**Interfaces:**

- Consumes: skill file (Tasks 1-8) + APPEND_SYSTEM.md (Task 9)
- Produces: validation notes in commit message of the final task

- [ ] **Step 1: V1 — Trigger test**

Manual: in a fresh Pi session, give a task that should trigger
the skill:

```
"fix the button color on /pricing"
```

Expected: skill `fe-browser-loop` loads automatically (frontend
keyword + style path). Confirm by checking that the system prompt
shows the skill description was loaded.

Pass criteria: skill loaded.

- [ ] **Step 2: V2 — Trigger guardrail test**

Manual: in the same or fresh session:

```
"refactor the database connection pool"
```

Expected: skill does NOT load (no frontend trigger).

Pass criteria: skill not loaded.

- [ ] **Step 3: V3 — Loop test**

Manual:

```
"fix the broken checkout form on localhost:3000"
```

Expected: all 5 steps run end-to-end with real browser
interactions (open, baseline, repro via click/fill, edit, verify).

Pass criteria: at least one `browser_open`, one `browser_screenshot`,
one interaction tool call (`browser_click` / `browser_fill`), one
follow-up `browser_screenshot` / `browser_snapshot` after edit.

If no dev server is reachable, this test fails with S2 waiver
recorded — that's an acceptable outcome for offline environments.

- [ ] **Step 4: V4 — Case derivation test**

Manual:

```
"add an email field to the signup form"
```

Expected: derived cases in Step 5 include D1 (email boundaries
like empty, invalid format, max length), D2 (form state machine),
D4 (network for /api/signup), D5 (desktop + mobile), D7
(keyboard navigation).

Pass criteria: at least one case per dimension D1, D2, D4, D5, D7
present in the agent's case list.

- [ ] **Step 5: V5 — Waiver test**

Manual: run V3 in an environment without a dev server reachable.

Expected: S2 waiver fires via `ask_user_question`, user approves
skip, report records `S2: ...` in Waivers section.

Pass criteria: `ask_user_question` invoked, S2 row in Waivers.

- [ ] **Step 6: V6 — Pass-with-waivers test**

Manual:

```
"verify my change works"
[after pasting a screenshot]
```

Expected: S7 waiver fires, verdict = `PASS-WITH-WAIVERS`.

Pass criteria: verdict is `PASS-WITH-WAIVERS`.

- [ ] **Step 7: V7 — Fail-block test**

Manual: create a scenario where the edit does NOT fix the issue
(e.g., edit the wrong file, browser verifies the bug still exists).

Expected: verdict = `FAIL`, agent does NOT declare task complete.

Pass criteria: verdict is `FAIL`; agent re-enters Step 4.

- [ ] **Step 8: V8 — APPEND_SYSTEM.md pointer test**

Manual: in a fresh session with no skill preloaded, give an FE
task.

Expected: APPEND_SYSTEM.md's pointer section causes the agent to
load the skill on first frontend trigger.

Pass criteria: skill loads without explicit user request.

- [ ] **Step 9: V9 — Consistency check test**

Manual:

```
"fix the dropdown that sometimes doesn't open"
```

Expected: repeat the same flow 2x, run across 3 viewports
(desktop + tablet + mobile), all assertions pass.

Pass criteria: consistency checks A, B, C all logged in report
with ✓.

- [ ] **Step 10: Record validation summary**

If all V1-V9 pass (or have acceptable documented waivers), add
a final empty commit summarizing validation:

```bash
cd ~/.pi/agent
git commit --allow-empty -m "docs: fe-browser-loop V1-V9 validation complete (see plan §Task 10)"
```

If any validation fails, do NOT make this commit. Instead, create
a follow-up task in the plan (or amend Tasks 1-9) to fix the gap,
then re-run the failing validation.

- [ ] **Step 11: Update spec status to "Validated"**

Edit `docs/superpowers/specs/2026-07-31-fe-browser-loop-design.md`
header:

```
**Status:** Validated
```

(replacing `**Status:** Draft`)

Commit:

```bash
cd ~/.pi/agent
git add docs/superpowers/specs/2026-07-31-fe-browser-loop-design.md
git commit -m "docs(specs): mark fe-browser-loop spec as Validated"
```

---

## Self-Review

After completing all 10 tasks, re-read the spec
(`docs/superpowers/specs/2026-07-31-fe-browser-loop-design.md`) and
verify each section is covered by at least one task:

| Spec section                          | Covered by tasks |
| ------------------------------------- | ---------------- |
| Motivation                            | (context only)   |
| Architecture                          | Task 1, 8, 9     |
| Skill trigger detection               | Task 1, 2        |
| 5-step loop (Open, Baseline)          | Task 3           |
| 5-step loop (Reproduce, Edit)         | Task 4           |
| 5-step loop (Verify overview)         | Task 5           |
| 9 case dimensions D1-D9               | Task 5           |
| Run discipline, per-case, consistency, pass/fail | Task 6 |
| Skip-override rules                   | Task 7           |
| Dev-server auto-detect                | Task 8           |
| Bundled skill cross-references        | Task 8           |
| Error handling                        | Task 8           |
| Edge cases                            | Task 8           |
| APPEND_SYSTEM.md edit                 | Task 9           |
| V1-V9 validation                      | Task 10          |

All sections covered. Plan is complete.

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-07-31-fe-browser-loop.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per
   task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using
   executing-plans, batch execution with checkpoints.

Which approach?
