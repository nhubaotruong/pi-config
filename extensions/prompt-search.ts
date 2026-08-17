import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	SessionSelectorComponent,
	keyHint,
} from "@earendil-works/pi-coding-agent";
import {
	compositeTuiLine,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

/**
 * PromptSearch - Ctrl+R triggered prompt history search UI.
 *
 * Renders pi's built-in SessionSelectorComponent (the same component the
 * "/resume" command uses) fed with the prompt history shaped as session
 * entries, exactly like /resume: the component replaces the editor area
 * (no floating overlay). Uses only built-in componentry/theme so
 * pi-zentui's selector styling can overwrite it like any built-in selector.
 */

interface HistoryEntry {
	text: string;
	timestamp: Date;
	sessionFile: string;
	sessionName?: string;
	cwd: string;
}

/** Synthetic session path -> prompt entry, built as loaders run. */
const pathToEntry = new Map<string, HistoryEntry>();

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

/** Map prompt entries to SessionInfo-shaped objects the selector can display. */
function entriesToSessions(entries: HistoryEntry[]): any[] {
	return entries.map((e, i) => {
		// Unique synthetic path per prompt entry (selection key only).
		// id and cwd are intentionally neutral: SessionList's search text is
		// id + name + allMessagesText + cwd and fuzzy-matches subsequences, so
		// a real file path / cwd would make unrelated queries match everything.
		const path = `${e.sessionFile}#${e.timestamp.getTime()}#${i}`;
		pathToEntry.set(path, e);
		return {
			path,
			id: `prompt-${i}`,
			cwd: "",
			modified: e.timestamp,
			created: e.timestamp,
			messageCount: 1,
			firstMessage: e.text,
			allMessagesText: e.text,
		};
	});
}

/**
 * Right-hand preview panel (Claude Code style): shows the full text of the
 * currently selected prompt entry, wrapped to the panel width.
 *
 * Reads selection lazily at render time so it tracks arrow-key movement
 * without any extra wiring. Theme is read lazily too: the panel is built
 * during the base constructor, before the derived constructor stores the
 * theme, but render() only runs after construction completes.
 */
class PromptPreviewPanel {
	constructor(
		private getSelectedPath: () => string | undefined,
		private getTheme: () => any,
	) {}

	render(width: number, maxHeight?: number): string[] {
		const theme = this.getTheme();
		const fg = (color: string, text: string) =>
			theme?.fg ? theme.fg(color, text) : text;
		const path = this.getSelectedPath();
		const entry = path ? pathToEntry.get(path) : undefined;

		const lines: string[] = [fg("accent", "Preview")];
		if (!entry) {
			lines.push(fg("muted", "No selection"));
			return lines;
		}
		lines.push(fg("muted", "─".repeat(Math.max(1, width - 2))));
		const wrapped = wrapTextWithAnsi(entry.text, Math.max(1, width - 2));
		for (const line of wrapped) {
			lines.push(` ${line}`);
		}
		if (maxHeight !== undefined && lines.length > maxHeight) {
			lines.length = maxHeight;
			lines[maxHeight - 1] = truncateToWidth(
				`${lines[maxHeight - 1]}…`,
				width,
				"",
			);
		}
		return lines;
	}
}

/**
 * 60/40 horizontal split (Claude Code style): left = session list, right =
 * preview. Falls back to the left side full-width on narrow terminals.
 * Uses the same compositeTuiLine primitive the built-in HStack uses.
 */
class SplitLayout {
	constructor(
		private left: any,
		private right: any,
		private getTheme: () => any,
		private minWidth = 80,
	) {}

	render(width: number): string[] {
		const safeWidth = Math.max(1, width);
		if (safeWidth < this.minWidth) {
			return this.left.render(safeWidth);
		}
		const gap = 1;
		const leftW = Math.floor(safeWidth * 0.6);
		const rightW = Math.max(1, safeWidth - leftW - gap);
		const leftLines = this.left.render(leftW);
		const rightLines = this.right.render(rightW, leftLines.length);
		const height = Math.max(leftLines.length, rightLines.length);
		const result = Array.from({ length: height }, () => "");
		const border = this.getTheme?.()?.fg?.("muted", "│") ?? "│";
		for (let row = 0; row < height; row++) {
			result[row] = compositeTuiLine(result[row], border, leftW, 1, safeWidth);
		}
		for (let row = 0; row < leftLines.length; row++) {
			result[row] = compositeTuiLine(
				result[row],
				leftLines[row],
				0,
				leftW,
				safeWidth,
			);
		}
		for (let row = 0; row < rightLines.length; row++) {
			result[row] = compositeTuiLine(
				result[row],
				rightLines[row],
				leftW + gap,
				rightW,
				safeWidth,
			);
		}
		return result;
	}
}

/**
 * Derived selector with a prompt-history header.
 *
 * The base component owns a private SessionSelectorHeader; we wrap it after
 * construction and replace only its render() so the title, scope labels and
 * hint lines read "Prompt History" instead of "Resume Session". All state
 * setters (loading/progress/scope/status) keep working on the same instance.
 */
class PromptSearchSelectorComponent extends SessionSelectorComponent {
	constructor(
		currentSessionsLoader: any,
		allSessionsLoader: any,
		onSelect: (sessionPath: string) => void,
		onCancel: () => void,
		onExit: () => void,
		requestRender: () => void,
		options?: {
			keybindings?: any;
			theme?: any;
		},
		currentSessionFilePath?: string,
	) {
		super(
			currentSessionsLoader,
			allSessionsLoader,
			onSelect,
			onCancel,
			onExit,
			requestRender,
			{ showRenameHint: false, keybindings: options?.keybindings },
			currentSessionFilePath,
		);
		const header = (this as any).header as any;
		const theme = options?.theme;
		header.render = (width: number) => {
			const title =
				header.scope === "current"
					? "Prompt History (This Project)"
					: "Prompt History (All Sessions)";
			const leftText = theme.bold(title);
			let sortLabel: string;
			if (header.sortMode === "threaded") {
				sortLabel = "Threaded";
			} else if (header.sortMode === "recent") {
				sortLabel = "Recent";
			} else {
				sortLabel = "Fuzzy";
			}
			const sortText = theme.fg("muted", "Sort: ") + theme.fg("accent", sortLabel);
			let scopeText: string;
			if (header.loading) {
				const progressText = header.loadProgress
					? `${header.loadProgress.loaded}/${header.loadProgress.total}`
					: "...";
				scopeText = `${theme.fg("muted", "○ This Project | ")}${theme.fg("accent", `Loading ${progressText}`)}`;
			} else if (header.scope === "current") {
				scopeText = `${theme.fg("accent", "◉ This Project")}${theme.fg("muted", " | ○ All Sessions")}`;
			} else {
				scopeText = `${theme.fg("muted", "○ This Project | ")}${theme.fg("accent", "◉ All Sessions")}`;
			}
			const rightText = truncateToWidth(`${scopeText}  ${sortText}`, width, "");
			const availableLeft = Math.max(0, width - visibleWidth(rightText) - 1);
			const left = truncateToWidth(leftText, availableLeft, "");
			const spacing = Math.max(
				0,
				width - visibleWidth(left) - visibleWidth(rightText),
			);

			let hintLine1: string;
			let hintLine2: string;
			if (header.confirmingDeletePath !== null) {
				const confirmHint = `Delete? ${keyHint("tui.select.confirm", "confirm")} · ${keyHint("tui.select.cancel", "cancel")}`;
				hintLine1 = theme.fg("error", truncateToWidth(confirmHint, width, "…"));
				hintLine2 = "";
			} else if (header.statusMessage) {
				const color = header.statusMessage.type === "error" ? "error" : "accent";
				hintLine1 = theme.fg(
					color,
					truncateToWidth(header.statusMessage.message, width, "…"),
				);
				hintLine2 = "";
			} else {
				const sep = theme.fg("muted", " · ");
				hintLine1 =
					keyHint("tui.input.tab", "scope") +
					sep +
					theme.fg("muted", 're:<pattern> regex · "phrase" exact');
				const pathState = header.showPath ? "(on)" : "(off)";
				hintLine2 =
					keyHint("app.session.toggleSort", "sort") +
					sep +
					keyHint("app.session.togglePath", `path ${pathState}`);
				hintLine1 = truncateToWidth(hintLine1, width, "…");
				hintLine2 = truncateToWidth(hintLine2, width, "…");
			}
			return [`${left}${" ".repeat(spacing)}${rightText}`, hintLine1, hintLine2];
		};

		// Rebuild the layout as a 60/40 split: session list on the left, prompt
		// preview on the right (Claude Code style). The base constructor already
		// built a full-width layout; buildBaseLayout clears and re-adds children,
		// so this replaces it in place. Rename mode is disabled for this selector
		// (no renameSession option), so the base never rebuilds without the split.
		(this as any).theme = theme;
		const preview = new PromptPreviewPanel(
			() => this.getSessionList().getSelectedSessionPath(),
			() => (this as any).theme,
		);
		(this as any).buildBaseLayout(
			new SplitLayout(this.getSessionList(), preview, () => (this as any).theme),
		);
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+r", {
		description: "Search prompt history",
		handler: async (ctx) => {
			if (ctx.mode !== "tui") return;

			// setEditorText() updates editor state without re-rendering, and
			// custom()'s close path renders the pre-search text, so capture the
			// TUI handle and force a render after applying the selected prompt.
			let requestRender: (() => void) | undefined;
			const text = await ctx.ui.custom<string | null>(
				(tui, theme, keybindings, done) => {
					requestRender = () => tui.requestRender();
					const currentLoader = async (
						onProgress?: (loaded: number, total: number) => void,
					) => {
						const entries = await loadProjectSessions(ctx);
						onProgress?.(entries.length, entries.length);
						return entriesToSessions(entries);
					};
					const allLoader = async (
						onProgress?: (loaded: number, total: number) => void,
					) => {
						const entries = await loadAllSessions(ctx);
						onProgress?.(entries.length, entries.length);
						return entriesToSessions(entries);
					};

					const component = new PromptSearchSelectorComponent(
						currentLoader as any,
						allLoader as any,
						(sessionPath: string) => {
							const entry = pathToEntry.get(sessionPath);
							done(entry?.text ?? null);
						},
						() => done(null),
						() => done(null),
						() => tui.requestRender(),
						{ keybindings, theme },
					);

					// The built-in selector wires delete/rename against real session
					// files. Our synthetic paths aren't files, so disable actions
					// that would be destructive or misleading.
					const list = component.getSessionList() as any;
					list.onDeleteSession = async () => {};
					list.onToggleNameFilter = undefined;

					return component as any;
				},
				// No overlay: renders like /resume (component replaces the editor).
			);
			if (text) {
				ctx.ui.setEditorText(text);
				// setEditorText() doesn't re-render; the close path already
				// rendered the pre-search text, so refresh to show the prompt.
				requestRender?.();
			}
		},
	});
}
