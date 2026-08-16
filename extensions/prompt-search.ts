import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	Container,
	VStack,
	Input,
	SelectList,
	Text,
	matchesKey,
	Key,
	truncateToWidth,
	visibleWidth,
	type Component,
	type SelectItem,
	type SelectListTheme,
} from "@earendil-works/pi-tui";

/**
 * PromptSearch - Ctrl+R triggered prompt history search UI
 * Toggle scope with Ctrl+S (this project vs all sessions)
 *
 * Rendered as a native pi overlay (80% width, 80% height, bottom-center):
 * - Box border around the dialog, ├┤ separators between sections
 * - Left pane (60%): SelectList of prompts (label = first line, description = relative time)
 * - Right pane (40%): full preview of the selected prompt, │ divider between panes
 * - Bottom: native Input for live substring filtering
 * - Header shows scope + match count; footer shows keybindings
 */

interface HistoryEntry {
	text: string;
	timestamp: Date;
	sessionFile: string;
	sessionName?: string;
	cwd: string;
}

type Scope = "project" | "all";

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

function relativeTime(date: Date): string {
	const sec = Math.floor((Date.now() - date.getTime()) / 1000);
	if (sec < 60) return `${sec}s`;
	if (sec < 3600) return `${Math.floor(sec / 60)}m`;
	if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
	return `${Math.floor(sec / 86400)}d`;
}

/**
 * Full box border around a stack of sections, with ├┤ separators between
 * sections. Every rendered line is padded to the inner width so the right
 * border column stays aligned (visibleWidth handles ANSI codes).
 */
class BoxBorder implements Component {
	private children: Component[];
	private border: (s: string) => string;

	constructor(children: Component[], border: (s: string) => string) {
		this.children = children;
		this.border = border;
	}

	invalidate(): void {
		for (const child of this.children) child.invalidate?.();
	}

	render(width: number): string[] {
		const innerW = Math.max(1, width - 2);
		const lines: string[] = [];
		lines.push(this.border(`┌${"─".repeat(innerW)}┐`));
		for (let i = 0; i < this.children.length; i++) {
			const childLines = this.children[i].render(innerW);
			for (const line of childLines) {
				const pad = Math.max(0, innerW - visibleWidth(line));
				lines.push(this.border("│") + line + " ".repeat(pad) + this.border("│"));
			}
			if (i < this.children.length - 1) {
				lines.push(this.border(`├${"─".repeat(innerW)}┤`));
			}
		}
		lines.push(this.border(`└${"─".repeat(innerW)}┘`));
		return lines;
	}
}

/**
 * Two panes at an exact 60:40 split with a │ divider between them,
 * padded to exactly N rows. Left child renders at 60% of the inner
 * width, right child at 40%; the divider column and right edge stay
 * aligned regardless of HStack grow rounding.
 */
class TwoPaneBody implements Component {
	private left: Component;
	private right: Component;
	private rows: number;
	private border: (s: string) => string;

	constructor(
		left: Component,
		right: Component,
		rows: number,
		border: (s: string) => string,
	) {
		this.left = left;
		this.right = right;
		this.rows = rows;
		this.border = border;
	}

	invalidate(): void {
		this.left.invalidate?.();
		this.right.invalidate?.();
	}

	render(width: number): string[] {
		const innerW = Math.max(2, width);
		const listW = Math.floor(innerW * 0.6);
		const prevW = innerW - listW - 1;
		const leftLines = this.left.render(listW);
		const rightLines = this.right.render(prevW);
		const out: string[] = [];
		for (let i = 0; i < this.rows; i++) {
			const l = leftLines[i] ?? "";
			const r = rightLines[i] ?? "";
			const lPad = Math.max(0, listW - visibleWidth(l));
			const rPad = Math.max(0, prevW - visibleWidth(r));
			out.push(l + " ".repeat(lPad) + this.border("│") + r + " ".repeat(rPad));
		}
		return out;
	}
}

class PromptSearchComponent {
	private root!: BoxBorder;
	private listHost = new Container();
	private selectList!: SelectList;
	private previewLabel = new Text("", 1, 0);
	private previewText = new Text("", 1, 0);
	private headerText = new Text("", 1, 0);
	private footerText = new Text("", 1, 0);
	private input = new Input();

	private entries: HistoryEntry[] = [];
	private filtered: HistoryEntry[] = [];
	private selected = 0;
	private filterText = "";
	private scope: Scope = "project";
	private loading = false;
	private projectCwd: string;
	private maxVisible: number;
	private bodyRows: number;

	private done: (value: string | null) => void;
	private requestRender: () => void;
	private theme: any;
	private ctx: any;
	private keybindings: any;
	private tui: any;

	constructor(
		initialEntries: HistoryEntry[],
		theme: any,
		ctx: any,
		keybindings: any,
		done: (value: string | null) => void,
		requestRender: () => void,
		tui: any,
	) {
		this.entries = initialEntries;
		this.theme = theme;
		this.ctx = ctx;
		this.keybindings = keybindings;
		this.done = done;
		this.requestRender = requestRender;
		this.projectCwd = ctx.cwd || process.cwd();
		this.tui = tui;

		// Height budget: dialog covers 80% of the terminal height.
		// Chrome = top border + header + separator + input + separator + footer + bottom border (8 rows).
		const termRows = tui?.terminal?.rows ?? 40;
		this.bodyRows = Math.max(4, Math.floor(termRows * 0.8) - 8);
		this.maxVisible = Math.max(3, this.bodyRows - 1);

		this.build();
	}

	get focused(): boolean {
		return this.input.focused;
	}
	set focused(value: boolean) {
		this.input.focused = value;
	}

	private build(): void {
		const border = (s: string) => this.theme.fg("accent", s);

		// Two-pane body: list (60%) + │ divider + preview (40%), fills the height
		const body = new TwoPaneBody(
			this.listHost,
			this.buildPreviewPane(),
			this.bodyRows,
			border,
		);

		this.root = new BoxBorder(
			[this.headerText, body, this.input, this.footerText],
			border,
		);

		this.rebuildList();
		this.updateHeader();
		this.updateFooter();
	}

	private buildPreviewPane(): VStack {
		this.previewLabel.setText(this.theme.fg("dim", "Preview"));
		this.previewText.setText("");
		return new VStack([this.previewLabel, this.previewText]);
	}

	private selectListTheme(): SelectListTheme {
		return {
			selectedPrefix: (text) => this.theme.fg("accent", text),
			selectedText: (text) => this.theme.fg("accent", text),
			description: (text) => this.theme.fg("dim", text),
			scrollInfo: (text) => this.theme.fg("dim", text),
			noMatch: (text) => this.theme.fg("dim", text),
		};
	}

	private highlightMatch(text: string): string {
		if (!this.filterText) return text;
		const idx = text.toLowerCase().indexOf(this.filterText.toLowerCase());
		if (idx === -1) return text;
		const before = text.slice(0, idx);
		const match = text.slice(idx, idx + this.filterText.length);
		const after = text.slice(idx + this.filterText.length);
		return `${before}${this.theme.fg("accent", match)}${after}`;
	}

	private rebuildList(): void {
		const needle = this.filterText.toLowerCase();
		this.filtered = needle
			? this.entries.filter((e) => e.text.toLowerCase().includes(needle))
			: this.entries;

		const items: SelectItem[] = this.filtered.map((e) => ({
			value: e.text,
			label: e.text.split("\n")[0],
			description: relativeTime(e.timestamp),
		}));

		const list = new SelectList(items, this.maxVisible, this.selectListTheme(), {
			minPrimaryColumnWidth: 24,
			maxPrimaryColumnWidth: 80,
			truncatePrimary: ({ text, maxWidth }) =>
				truncateToWidth(this.highlightMatch(text), maxWidth, ""),
		});

		list.onSelect = (item) => {
			// Set the editor text before closing the overlay so that the
			// render scheduled by done() picks up the new text.
			this.ctx.ui.setEditorText(item.value);
			this.done(item.value);
		};
		list.onCancel = () => this.done(null);
		list.onSelectionChange = (item) => {
			const idx = this.filtered.findIndex((e) => e.text === item.value);
			if (idx !== -1) this.selected = idx;
			this.updatePreview();
		};

		if (items.length > 0) {
			list.setSelectedIndex(
				Math.max(0, Math.min(this.selected, items.length - 1)),
			);
		}

		this.listHost.clear();
		this.listHost.addChild(list);
		this.selectList = list;
		this.updatePreview();
	}

	private updatePreview(): void {
		const item = this.selectList.getSelectedItem();
		if (!item) {
			this.previewText.setText("");
			return;
		}
		this.previewText.setText(item.value);
	}

	private updateHeader(): void {
		const scopeLabel = this.scope === "project" ? "this project" : "all sessions";
		const loadHint = this.loading ? " loading…" : "";
		const title = this.theme.fg("accent", this.theme.bold("Prompt History"));
		const meta = this.theme.fg(
			"dim",
			` · ${scopeLabel} · ${this.filtered.length} matches${loadHint}`,
		);
		this.headerText.setText(title + meta);
	}

	private updateFooter(): void {
		const scopeHint =
			this.scope === "project" ? "Ctrl+S → all sessions" : "Ctrl+S → this project";
		this.footerText.setText(
			this.theme.fg(
				"dim",
				`↑↓ navigate · Enter select · Esc cancel · ${scopeHint}`,
			),
		);
	}

	handleInput(data: string): void {
		// Toggle scope
		if (matchesKey(data, Key.ctrl("s"))) {
			this.toggleScope();
			return;
		}

		// Page navigation (SelectList has no native page keys)
		if (matchesKey(data, Key.pageUp)) {
			this.page(-this.maxVisible);
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.page(this.maxVisible);
			return;
		}

		// Selection navigation / confirm / cancel → SelectList
		if (
			this.keybindings.matches(data, "tui.select.up") ||
			this.keybindings.matches(data, "tui.select.down") ||
			this.keybindings.matches(data, "tui.select.confirm") ||
			this.keybindings.matches(data, "tui.select.cancel")
		) {
			this.selectList.handleInput(data);
			this.requestRender();
			return;
		}

		// Text editing → native Input; on change, refilter
		const oldVal = this.input.getValue();
		this.input.handleInput(data);
		if (this.input.getValue() !== oldVal) {
			this.filterText = this.input.getValue();
			this.rebuildList();
			this.updateHeader();
			this.requestRender();
		}
	}

	private page(delta: number): void {
		if (this.filtered.length === 0) return;
		const target = Math.max(
			0,
			Math.min(this.filtered.length - 1, this.selected + delta),
		);
		this.selected = target;
		this.selectList.setSelectedIndex(target);
		this.updatePreview();
		this.requestRender();
	}

	private async toggleScope(): Promise<void> {
		if (this.loading) return;

		const newScope: Scope = this.scope === "project" ? "all" : "project";
		this.scope = newScope;

		if (newScope === "all") {
			const onlyProject = this.entries.every((e) => e.cwd === this.projectCwd);
			if (onlyProject) {
				this.loading = true;
				this.updateHeader();
				this.requestRender();
				this.entries = await loadAllSessions(this.ctx);
				this.loading = false;
			}
		} else {
			// Switching back to project scope - reload project sessions
			this.loading = true;
			this.updateHeader();
			this.requestRender();
			this.entries = await loadProjectSessions(this.ctx);
			this.loading = false;
		}

		this.rebuildList();
		this.updateHeader();
		this.updateFooter();
		this.requestRender();
	}

	/**
	 * Recompute the height budget from the current terminal size so the
	 * visible item count follows the terminal height instead of being fixed
	 * at open time. Width is already dynamic (the 60:40 HStack reallocates
	 * on every render). Rebuilds the box only when the size actually changed.
	 */
	private syncSize(): void {
		const termRows = this.tui?.terminal?.rows ?? 40;
		const bodyRows = Math.max(4, Math.floor(termRows * 0.8) - 8);
		const maxVisible = Math.max(3, bodyRows - 1);
		if (bodyRows === this.bodyRows && maxVisible === this.maxVisible) return;
		this.bodyRows = bodyRows;
		this.maxVisible = maxVisible;
		this.build();
	}

	render(width: number): string[] {
		this.syncSize();
		return this.root.render(width);
	}

	invalidate(): void {
		this.root.invalidate();
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+r", {
		description: "Search prompt history",
		handler: async (ctx) => {
			if (ctx.mode !== "tui") return;

			// Load all sessions from current project (not just current session)
			const entries = await loadProjectSessions(ctx);

			// Always show dialog, even if empty
			await ctx.ui.custom<string | null>(
				(tui, theme, keybindings, done) => {
					const component = new PromptSearchComponent(
						entries,
						theme,
						ctx,
						keybindings,
						done,
						() => tui.requestRender(),
						tui,
					);
					return {
						render: (w) => component.render(w),
						invalidate: () => component.invalidate(),
						handleInput: (data) => component.handleInput(data),
						get focused() {
							return component.focused;
						},
						set focused(v: boolean) {
							component.focused = v;
						},
					};
				},
				{
					overlay: true,
					overlayOptions: {
						anchor: "bottom-center",
						width: "80%",
						maxHeight: "80%",
						margin: { bottom: 1 },
					},
				},
			);
		},
	});
}
