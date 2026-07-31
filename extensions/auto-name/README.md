# @nhubao/pi-extension-auto-name

Automatically name a pi session based on the first user message (English).

It helps you quickly recognize what each session is about when many tasks are
open at once.

## Install

Drop the extension folder into your pi extensions directory (for example
`~/.pi/agent/extensions/auto-name/`) — pi picks it up via the `pi.extensions`
manifest in `package.json`.

## Great for

- Quickly understanding what a session is about.
- Avoiding manual naming with `/name`.
- Showing the current task clearly in the terminal title and status area.

## Configuration

You can customize the model and reasoning level used for name generation.

### `/auto-name:setting`

Show current settings:

```

/auto-name:setting

```

Set a specific model (must be `provider/model-id` format):

```

/auto-name:setting model anthropic/claude-sonnet-4-20250514

```

Set reasoning level (affects name generation quality vs speed):

```

/auto-name:setting thinking minimal

```

Available reasoning levels: `minimal` (default), `low`, `medium`, `high`, `xhigh`.

Settings are saved to `~/.pi/agent/auto-name/settings.json` and persist across
sessions.

If no custom model is set, the extension uses the current session's model.

## How it works

- It reads the first user message and generates a short Title Case session name
  (2–4 words, ≤30 characters).
- The generated name is applied to the session name, status area, and terminal
  title.
- If a session already has a name, it does not overwrite it.
- It skips automatic naming for subagent sessions.

## Example

If the first request is `Prepare a pre-release checklist`, pi can automatically
turn it into `Release Prep`.

## Differences from the Korean upstream package

This extension is an English-only localization of
[`@ryan_nookpi/pi-extension-auto-name`](https://github.com/Jonghakseo/pi-extension/tree/main/packages/auto-name).
Behavior and persistence paths are unchanged; only user-facing strings are
translated.
