---
name: subagents
description: invoke this skill when the user asks you to use subagents
---

# Subagents

Each subagent is headless, has its own context window, cannot see the parent conversation, cannot ask the user, and cannot spawn subagents or workflows. Give every child a self-contained prompt with paths, constraints, and the expected report.

## Pi Harness

**Tool:** `Agent` (from `@tintinweb/pi-subagents`)
**Best default:** Use `subagent_type: "general-purpose"` when no specific type fits. Inherits the parent model when `model` is omitted.

Custom agents can be defined in `.pi/agents/<name>.md` (project) or `.agents/agents/<name>.md` (shared) or globally.

**Thinking levels:** `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. These map directly to pi thinking levels.

## Spawn and Manage

Call `Agent` with `prompt`, `description`, `subagent_type`, and optional `model`, `thinking`, `run_in_background`, `max_turns`, `inherit_context`, `isolation`.

- `Agent({ subagent_type, prompt, description, run_in_background: true })`: fire-and-forget. You are notified on completion — never poll or sleep.
- `Agent({ subagent_type, prompt, description })`: foreground — blocks until complete, returns result inline.
- `get_subagent_result({ agent_id, wait: true })`: block only when results are required before the auto-notification arrives.
- `get_subagent_result({ agent_id })`: peek at status without blocking.
- `steer_subagent({ agent_id, message })`: send a mid-run message to redirect a running agent.
- `/agents`: inspect, take over, or manage agents interactively.

## Auto-Reporting

Background agents auto-report results via follow-up notifications when they complete. **Never poll or sleep waiting for results.** Continue with other work. The notification triggers a new turn for the parent with the result.

`get_subagent_result` is only needed when you must retrieve results before the notification arrives (e.g., to consume the full output explicitly).
