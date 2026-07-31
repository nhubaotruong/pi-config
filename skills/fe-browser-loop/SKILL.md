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
