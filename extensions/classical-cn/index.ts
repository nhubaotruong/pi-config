import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	type Config,
	DEFAULT_CONFIG,
	loadConfig,
	saveConfig,
	applySettingChange,
} from "./config.ts";
import { translate } from "./translator.ts";
import { TranslationCache } from "./cache.ts";

let config: Config = { ...DEFAULT_CONFIG };
let cache = new TranslationCache("");
// Map<messageId, classicalCn> as fallback if details._classicalCn is stripped by compaction
const cnFallback = new Map<string, string>();

export default function classicalCnExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		const agentDir = getAgentDir();
		config = await loadConfig(agentDir);
		cache = new TranslationCache(agentDir);
		await cache.load();
	});

	pi.on("session_shutdown", async () => {
		cnFallback.clear();
		// Cache is ephemeral for now — no save needed on shutdown
	});

	pi.on("input", async (event, ctx) => {
		if (!config.enabled || !config.modelKey)
			return { action: "continue" as const };
		if (event.source === "extension") return { action: "continue" as const };

		const translated = await translate(
			config,
			ctx,
			event.text,
			"en-to-classcn",
		);
		if (!translated || translated === event.text)
			return { action: "continue" as const };

		return { action: "transform" as const, text: translated };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!config.enabled || !config.modelKey) return;
		if (!event.systemPrompt || event.systemPrompt.length === 0) return;

		// Skip if system prompt is short (likely not a real prompt)
		if (event.systemPrompt.length < 100) return;

		const cacheKey = cache.key(event.systemPrompt);
		const cached = cache.get(cacheKey);
		if (cached) {
			return { systemPrompt: cached };
		}

		const translated = await translate(
			config,
			ctx,
			event.systemPrompt,
			"en-to-classcn",
		);
		if (!translated) return;

		cache.set(cacheKey, translated);
		await cache.save();
		return { systemPrompt: translated };
	});

	pi.on("message_end", async (event, ctx) => {
		if (!config.enabled || !config.modelKey) return;
		if (event.message.role !== "assistant") return;
		if (!event.message.content || typeof event.message.content !== "string")
			return;
		if (event.message.content.length === 0) return;

		const classicalCn = event.message.content;

		// Skip translation for very long messages — show raw Classical Chinese
		if (classicalCn.length > 10000) return;

		// Translate to English for display
		const english = await translate(config, ctx, classicalCn, "classcn-to-en");
		if (!english) return;

		// Store the Classical Chinese original in details for context event to restore
		cnFallback.set(event.message.id ?? classicalCn.slice(0, 64), classicalCn);

		return {
			message: {
				...event.message,
				content: english,
				details: { ...event.message.details, _classicalCn: classicalCn },
			},
		};
	});

	pi.on("context", async (event) => {
		for (const m of event.messages) {
			if (m.role !== "assistant") continue;
			if (!m.content || typeof m.content !== "string") continue;

			// Restore from details._classicalCn (set by message_end)
			if (
				m.details?._classicalCn &&
				typeof m.details._classicalCn === "string"
			) {
				m.content = m.details._classicalCn;
				continue;
			}

			// Fallback: check in-memory map
			const fallbackKey =
				m.id ?? (typeof m.content === "string" ? m.content.slice(0, 64) : "");
			const fallbackCn = cnFallback.get(fallbackKey);
			if (fallbackCn) {
				m.content = fallbackCn;
			}
		}
	});

	pi.registerCommand("classical-cn", {
		description:
			"Configure Classical Chinese translation. Subcommands: show, on, off, model [<key>], effort <level>",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "";
			const agentDir = getAgentDir();

			switch (sub) {
				case "": {
					// Open settings panel (TUI) or print status
					if (ctx.mode === "tui") {
						await showSettings(pi, ctx);
					} else {
						ctx.ui.notify(formatConfig(config), "info");
					}
					return;
				}
				case "show": {
					ctx.ui.notify(formatConfig(config), "info");
					return;
				}
				case "on": {
					config = { ...config, enabled: true };
					await saveConfig(config, agentDir);
					ctx.ui.notify("Classical CN translation enabled.", "info");
					return;
				}
				case "off": {
					config = { ...config, enabled: false };
					await saveConfig(config, agentDir);
					ctx.ui.notify("Classical CN translation disabled.", "info");
					return;
				}
				case "model": {
					const value = parts.slice(1).join(" ").trim();
					if (!value) {
						await handleModelPick(ctx);
					} else {
						config = { ...config, modelKey: value };
					}
					await saveConfig(config, agentDir);
					ctx.ui.notify(`Translation model set to: ${config.modelKey}`, "info");
					return;
				}
				case "effort": {
					const level = parts[1];
					if (!level) {
						ctx.ui.notify(
							"Usage: /classical-cn effort <off|minimal|low|medium|high|xhigh>",
							"warning",
						);
						return;
					}
					config = applySettingChange(config, "effort", level);
					await saveConfig(config, agentDir);
					ctx.ui.notify(`Translation effort set to: ${config.effort}`, "info");
					return;
				}
				default: {
					ctx.ui.notify(
						"Subcommands: show, on, off, model [<key>], effort <level>",
						"warning",
					);
					return;
				}
			}
		},
	});

	async function handleModelPick(ctx: ExtensionCommandContext): Promise<void> {
		const models = ctx.modelRegistry
			.getAvailable()
			.map((m) => `${m.provider}/${m.id}`)
			.sort((a, b) => a.localeCompare(b));
		if (models.length === 0) {
			ctx.ui.notify("No models available in registry.", "warning");
			return;
		}
		const picked = await ctx.ui.select("Pick a translation model:", models);
		if (!picked) return;
		config = { ...config, modelKey: picked };
	}
}

function formatConfig(c: Config): string {
	return [
		"Classical CN translation:",
		`  enabled:    ${c.enabled ? "on" : "off"}`,
		`  model:      ${c.modelKey || "(not set)"}`,
		`  effort:     ${c.effort}`,
	].join("\n");
}

async function showSettings(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
): Promise<void> {
	// Simple text-based settings in TUI — inline with Pi's design philosophy
	ctx.ui.notify(formatConfig(config), "info");
}
