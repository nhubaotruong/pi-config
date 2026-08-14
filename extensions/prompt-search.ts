import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type Container,
	Input,
	truncateToWidth,
	visibleWidth,
	matchesKey,
	Key,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/**
 * PromptSearch - Ctrl+R triggered prompt history search UI
 * Toggle scope with Ctrl+S (this project vs all sessions)
 *
 * Renders as a bordered box replacing the input area.
 * Left column: scrollable list of prompts.
 * Right column: full preview of selected prompt.
 */

interface HistoryEntry {
	text: string;
	timestamp: Date;
	sessionFile: string;
	sessionName?: string;
	cwd: string;
}

type Scope = "project" | "all";
const MAX_LIST_ITEMS = 16;

function extractUserText(content: any): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.flatMap((block: any) => (block.type === "text" ? [block.text] : []))
			.join("");
	}
	return "";
}

function extractPromptsFromSession(
	sessionEntries: any[],
	sm: any,
	cwd: string,
): HistoryEntry[] {
	const out: HistoryEntry[] = [];
	for (const entry of sessionEntries) {
		if (entry.type === "message" && entry.message?.role === "user") {
			const text = extractUserText(entry.message.content);
			if (text.trim()) {
				out.push({
					text: text.trim(),
					timestamp: new Date(entry.timestamp),
					sessionFile: sm.getSessionFile() ?? "",
					sessionName: sm.getSessionName(),
					cwd,
				});
			}
		}
	}
	return out;
}

async function loadProjectSessions(ctx: any): Promise<HistoryEntry[]> {
	const sessionManager = ctx.sessionManager;
	const entries: HistoryEntry[] = [];
	const cwd = ctx.cwd || process.cwd();

	// Load current session first
	if (sessionManager) {
		entries.push(
			...extractPromptsFromSession(
				sessionManager.getEntries(),
				sessionManager,
				cwd,
			),
		);
	}

	// Load other sessions from the same project
	try {
		const { SessionManager } = await import("@earendil-works/pi-coding-agent");
		const projectSessions = await SessionManager.list(cwd);
		const currentFile = sessionManager?.getSessionFile();

		for (const session of projectSessions) {
			if (session.path === currentFile) continue;
			try {
				const sm = await SessionManager.open(session.path);
				entries.push(
					...extractPromptsFromSession(sm.getEntries(), sm, session.cwd || cwd),
				);
			} catch {
				// skip
			}
		}
	} catch {
		// ignore
	}

	return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

async function loadAllSessions(ctx: any): Promise<HistoryEntry[]> {
	const sessionManager = ctx.sessionManager;
	const entries: HistoryEntry[] = [];
	const cwd = ctx.cwd || process.cwd();

	// Load current session first
	if (sessionManager) {
		entries.push(
			...extractPromptsFromSession(
				sessionManager.getEntries(),
				sessionManager,
				cwd,
			),
		);
	}

	// Load other sessions
	try {
		const { SessionManager } = await import("@earendil-works/pi-coding-agent");
		const allSessions = await SessionManager.listAll();
		const currentFile = sessionManager?.getSessionFile();

		for (const session of allSessions) {
			if (session.path === currentFile) continue;
			try {
				const sm = await SessionManager.open(session.path);
				entries.push(
					...extractPromptsFromSession(sm.getEntries(), sm, session.cwd || cwd),
				);
			} catch {
				// skip
			}
		}
	} catch {
		// ignore
	}

	return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

class PromptSearchComponent implements Container {
	private entries: HistoryEntry[] = [];
	private filtered: HistoryEntry[] = [];
	private selected = 0;
	private projectCwd: string;

	private rerender(): void {
		this.cachedL = undefined;
		this.requestRender();
	}
	private filterText = "";
	private scope: Scope = "project";
	private loading = false;
	private input: Input;
	private done: (value: string | null) => void;
	private requestRender: () => void;
	private cachedW?: number;
	private cachedL?: string[];
	private theme: any;
	private ctx: any;
	private tui: any;

	constructor(
		initialEntries: HistoryEntry[],
		theme: any,
		ctx: any,
		done: (value: string | null) => void,
		requestRender: () => void,
		tui: any,
	) {
		this.entries = initialEntries;
		this.filtered = [...initialEntries];
		this.theme = theme;
		this.ctx = ctx;
		this.done = done;
		this.requestRender = requestRender;
		this.tui = tui;
		this.projectCwd = ctx.cwd || process.cwd();

		this.input = new Input();
		this.input.onSubmit = () => {
			if (this.filtered.length > 0) {
				const text = this.filtered[this.selected]?.text ?? null;
				if (text !== null) {
					// Set the editor text before closing the overlay so that the
					// render scheduled by done() picks up the new text. Otherwise
					// the next render fires from a process.nextTick that runs
					// before our post-await microtask, leaving the editor visually
					// stale until the user types a character.
					this.ctx.ui.setEditorText(text);
				}
				this.done(text);
			}
		};
		this.input.onEscape = () => {
			this.done(null);
		};
	}

	get focused(): boolean {
		return this.input.focused;
	}
	set focused(value: boolean) {
		this.input.focused = value;
	}

	/**
	 * Highlight search term in text with accent color
	 */
	private highlightMatch(text: string): string {
		if (!this.filterText) return text;
		const q = this.filterText.toLowerCase();
		const idx = text.toLowerCase().indexOf(q);
		if (idx === -1) return text;
		const before = text.slice(0, idx);
		const match = text.slice(idx, idx + q.length);
		const after = text.slice(idx + q.length);
		return `${before}${this.theme.fg("accent", match)}${after}`;
	}

	/**
	 * Split the full text of an entry into wrapped lines fitting the given width.
	 */
	private buildDetailLines(text: string, width: number): string[] {
		if (width < 4) return [truncateToWidth(text, width)];
		const rawLines = text.split("\n");
		const out: string[] = [];
		for (const line of rawLines) {
			if (line === "") {
				out.push(" ".repeat(width));
			} else {
				const wrapped = wrapTextWithAnsi(line, width);
				for (const wl of wrapped) {
					out.push(truncateToWidth(wl, width));
					if (out.length >= 80) break;
				}
			}
			if (out.length >= 80) break;
		}
		return out;
	}

	handleInput(data: string): void {
		// Toggle scope
		if (matchesKey(data, Key.ctrl("s"))) {
			this.toggleScope();
			return;
		}

		// Page navigation
		if (matchesKey(data, Key.pageUp)) {
			this.selected = Math.max(0, this.selected - MAX_LIST_ITEMS);
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.selected = Math.min(
				this.filtered.length - 1,
				this.selected + MAX_LIST_ITEMS,
			);
			this.rerender();
			return;
		}

		// Let Input process the key
		const oldVal = this.input.getValue();
		this.input.handleInput(data);
		const newVal = this.input.getValue();

		// If text changed, re-filter
		if (oldVal !== newVal) {
			this.filterText = newVal;
			this.applyFilter();
			this.refreshList();
			return;
		}

		// Navigation (Input doesn't handle these)
		if (matchesKey(data, Key.up)) {
			if (this.selected > 0) {
				this.selected--;
				this.rerender();
			}
		} else if (matchesKey(data, Key.down)) {
			if (this.selected < this.filtered.length - 1) {
				this.selected++;
				this.rerender();
			}
		}
	}

	private async toggleScope() {
		const newScope: Scope = this.scope === "project" ? "all" : "project";
		this.scope = newScope;
		this.rerender();

		if (newScope === "all") {
			const onlyProject = this.entries.every((e) => e.cwd === this.projectCwd);
			if (onlyProject) {
				this.loading = true;
				this.rerender();
				this.entries = await loadAllSessions(this.ctx);
				this.loading = false;
			}
		} else {
			// Switching back to project scope - reload project sessions
			this.loading = true;
			this.rerender();
			this.entries = await loadProjectSessions(this.ctx);
			this.loading = false;
		}
		this.applyFilter();
		this.rerender();
	}

	private refreshList(): void {
		this.applyFilter();
		this.rerender();
	}

	private applyFilter(): void {
		let source = this.entries;

		if (this.scope === "project") {
			source = this.entries.filter((e) => e.cwd === this.projectCwd);
		}

		if (this.filterText === "") {
			this.filtered = [...source];
		} else {
			const q = this.filterText.toLowerCase();
			this.filtered = source.filter((e) => e.text.toLowerCase().includes(q));
		}

		if (this.selected >= this.filtered.length) {
			this.selected = Math.max(0, this.filtered.length - 1);
		}
	}

	render(width: number): string[] {
		if (this.cachedW === width && this.cachedL) return this.cachedL;

		const lines: string[] = [];
		const w = width;

		// Calculate heights
		const termRows = this.tui?.terminal?.rows ?? 40;
		const maxOverlayRows = Math.floor(termRows * 0.5);
		const totalRows = Math.min(20, maxOverlayRows);
		const contentRows = totalRows - 4; // header + 2 separators + footer

		// Layout: left list + right preview
		// Outer box: │ content │ = w, so content = w - 2
		// List: │ left │ = leftW + 2, Preview: │ preview │ = previewW + 2
		const showPreview = w >= 60;
		// Content row: │ + leftW + │ + previewW + │ = w  =>  leftW + previewW = w - 2
		const leftW = showPreview ? Math.floor((w - 2) / 2) : w - 2;
		const previewW = showPreview ? w - 2 - leftW : 0;

		// Header
		const scopeLabel =
			this.scope === "project" ? "this project" : "all sessions";
		const loadHint = this.loading ? " loading..." : "";
		const headerText = ` Search prompts · ${scopeLabel}${loadHint} `;
		lines.push(
			`┌${headerText}${"─".repeat(Math.max(0, w - headerText.length - 2))}┐`,
		);

		// Calculate visible items
		const maxVis = Math.min(MAX_LIST_ITEMS, this.filtered.length, contentRows);
		const start = Math.max(
			0,
			Math.min(
				this.selected - Math.floor(maxVis / 2),
				Math.max(0, this.filtered.length - maxVis),
			),
		);

		// Build preview content
		const selectedEntry = this.filtered[this.selected];
		let previewLines: string[] = [];
		if (selectedEntry && previewW > 4) {
			previewLines = this.buildDetailLines(selectedEntry.text, previewW);
		}

		// Render content rows
		for (let i = 0; i < contentRows; i++) {
			const idx = start + i;

			// Left side: list
			let leftPart: string;
			if (idx < this.filtered.length) {
				const entry = this.filtered[idx];
				const sel = idx === this.selected;
				const ago = this.relativeTime(entry.timestamp);
				const firstLine = entry.text.split("\n")[0];
				const availW = Math.max(1, leftW - 10);
				const displayText = truncateToWidth(firstLine, availW);
				const highlighted = this.highlightMatch(displayText);

				if (sel) {
					leftPart = ` ${this.theme.fg("accent", "▶")} ${highlighted} ${this.theme.fg("dim", ago)}`;
				} else {
					leftPart = `   ${highlighted} ${this.theme.fg("dim", ago)}`;
				}
			} else {
				leftPart = "";
			}
			// Pad using visibleWidth to handle ANSI codes correctly
			leftPart =
				leftPart + " ".repeat(Math.max(0, leftW - visibleWidth(leftPart)));

			if (showPreview) {
				// Right side: preview box
				if (i === 0) {
					const previewHeader = " Preview ";
					const previewInnerW = previewW - 2; // -2 for ┌ and ┐
					const dashes = "─".repeat(
						Math.max(0, previewInnerW - previewHeader.length),
					);
					lines.push(`│${leftPart}│┌${previewHeader}${dashes}┐`);
				} else if (i === contentRows - 1) {
					const previewInnerW = previewW - 2; // -2 for └ and ┘
					lines.push(`│${leftPart}│└${"─".repeat(previewInnerW)}┘`);
				} else {
					const previewIdx = i - 1;
					const previewInnerW = previewW - 1; // right │ only, left │ shared with list
					let previewText =
						previewIdx < previewLines.length
							? truncateToWidth(previewLines[previewIdx], previewInnerW)
							: " ".repeat(previewInnerW);
					// Pad to exact width for border alignment
					previewText =
						previewText +
						" ".repeat(Math.max(0, previewInnerW - visibleWidth(previewText)));
					lines.push(`│${leftPart}│${previewText}│`);
				}
			} else {
				lines.push(`│${leftPart}│`);
			}
		}

		// Separator
		lines.push(`├${"─".repeat(w - 2)}┤`);

		// Input line
		const inputValue = this.input.getValue();
		const inputDisplay = inputValue ? truncateToWidth(inputValue, w - 5) : "";
		const inputLine = `│ > ${inputDisplay}${" ".repeat(Math.max(0, w - 5 - visibleWidth(inputDisplay)))}│`;
		lines.push(inputLine);

		// Footer
		const footerText = ` ↑↓ navigate · Enter select · Esc cancel · Ctrl+S ${this.scope === "project" ? "→ all" : "→ this project"} `;
		lines.push(
			`├${footerText}${"─".repeat(Math.max(0, w - footerText.length - 2))}┤`,
		);
		lines.push(`└${"─".repeat(w - 2)}┘`);

		this.cachedW = width;
		this.cachedL = lines;
		return lines;
	}

	private relativeTime(date: Date): string {
		const sec = Math.floor((Date.now() - date.getTime()) / 1000);
		if (sec < 60) return `${sec}s`;
		if (sec < 3600) return `${Math.floor(sec / 60)}m`;
		if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
		return `${Math.floor(sec / 86400)}d`;
	}

	invalidate(): void {
		this.cachedW = undefined;
		this.cachedL = undefined;
		this.input.invalidate();
	}

	addChild(_child: any): void {}
	removeChild(_child: any): void {}
	clear(): void {}
}

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+r", {
		description: "Search prompt history",
		handler: async (ctx) => {
			if (ctx.mode !== "tui") return;

			// Load all sessions from current project (not just current session)
			const entries = await loadProjectSessions(ctx);

			// Always show dialog, even if empty
			const result = await ctx.ui.custom<string | null>(
				(tui, theme, _kb, done) => {
					const component = new PromptSearchComponent(
						entries,
						theme,
						ctx,
						done,
						() => tui.requestRender(),
						tui,
					);
					return {
						render: (w) => component.render(w),
						invalidate: () => component.invalidate(),
						handleInput: (data) => component.handleInput(data),
					};
				},
				{
					overlay: true,
					overlayOptions: {
						anchor: "bottom-center",
						width: "80%",
						maxHeight: "50%",
						margin: { bottom: 1 },
					},
				},
			);
		},
	});
}
