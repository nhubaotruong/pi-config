# Prompt Search Extension

A Ctrl+R triggered prompt history search UI for Pi.

## Features

- **Search prompts**: Filter through your session prompt history with fuzzy matching
- **Navigate history**: Use ↑/↓ arrows to navigate the list
- **Quick select**: Press Enter to use the selected prompt
- **Cancel**: Press Esc to close without selecting
- **Time ago display**: Shows relative timestamps (e.g., "2h ago", "3m ago")

## Installation

The extension is already installed at `~/.pi/agent/extensions/prompt-search.ts`.

To use it, simply restart Pi or run `/reload` in the TUI.

## Usage

1. Press `Ctrl+R` in Pi's TUI
2. Type in the search field to filter prompts
3. Use ↑/↓ to navigate the filtered list
4. Press `Enter` to select and paste the prompt into the editor
5. Press `Esc` to cancel

## How It Works

- Accesses your current session's prompt history via `ctx.sessionManager.getEntries()`
- Filters entries that are user messages (role === "user")
- Displays them in reverse chronological order (newest first)
- Shows time-ago timestamps for quick reference
