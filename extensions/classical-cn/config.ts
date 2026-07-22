import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const CONFIG_FILENAME = "classical-cn.json";

export interface Config {
	/** "provider/model" string resolved via ctx.modelRegistry */
	modelKey: string;
	/** Reasoning effort for translation calls */
	effort: string;
	/** Master switch */
	enabled: boolean;
}

export const DEFAULT_CONFIG: Config = {
	modelKey: "",
	effort: "off",
	enabled: true,
};

export function configFilePath(agentDir: string): string {
	return join(agentDir, CONFIG_FILENAME);
}

const EFFORT_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const;

function strOrUndef(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

export function mergeConfig(partial: unknown): Config {
	const p = (partial ?? {}) as Record<string, unknown>;
	return {
		modelKey: strOrUndef(p.modelKey) ?? DEFAULT_CONFIG.modelKey,
		effort:
			typeof p.effort === "string" &&
			(EFFORT_LEVELS as readonly string[]).includes(p.effort)
				? p.effort
				: DEFAULT_CONFIG.effort,
		enabled:
			typeof p.enabled === "boolean" ? p.enabled : DEFAULT_CONFIG.enabled,
	};
}

export async function loadConfig(agentDir: string): Promise<Config> {
	try {
		const raw = await readFile(configFilePath(agentDir), "utf8");
		return mergeConfig(JSON.parse(raw));
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export async function saveConfig(
	config: Config,
	agentDir: string,
): Promise<void> {
	const file = configFilePath(agentDir);
	const tmp = `${file}.tmp`;
	await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	await rename(tmp, file);
}

export function applySettingChange(
	config: Config,
	id: string,
	value: string,
): Config {
	switch (id) {
		case "enabled":
			return { ...config, enabled: value === "on" };
		case "model": {
			// "provider/id" or bare id
			const trimmed = value.trim();
			return { ...config, modelKey: trimmed.length > 0 ? trimmed : "" };
		}
		case "effort":
			if ((EFFORT_LEVELS as readonly string[]).includes(value))
				return { ...config, effort: value };
			return config;
		default:
			return config;
	}
}
