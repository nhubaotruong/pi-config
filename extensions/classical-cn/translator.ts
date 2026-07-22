import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "./config.ts";

const EN_TO_CLASSCN_SYSTEM = [
	"Translate the following text to Classical Chinese (文言文).",
	"Preserve all code, file paths, commands, and technical terms exactly as-is.",
	"Respond with the translation only, no explanations.",
	"If the text is already in Classical Chinese, return it unchanged.",
].join(" ");

const CLASSCN_TO_EN_SYSTEM = [
	"Translate the following Classical Chinese (文言文) to English.",
	"Preserve all code, file paths, commands, and technical terms exactly as-is.",
	"Respond with the translation only, no explanations.",
	"If the text is already English, return it unchanged.",
].join(" ");

export type Direction = "en-to-classcn" | "classcn-to-en";

export async function translate(
	config: Config,
	ctx: ExtensionContext,
	text: string,
	direction: Direction,
): Promise<string | undefined> {
	if (!config.enabled) return undefined;
	if (!config.modelKey || text.length === 0) return undefined;

	const slash = config.modelKey.indexOf("/");
	if (slash <= 0 || slash >= config.modelKey.length - 1) return undefined;

	const provider = config.modelKey.slice(0, slash);
	const modelId = config.modelKey.slice(slash + 1);
	const model = ctx.modelRegistry.find(provider, modelId);
	if (!model) return undefined;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) return undefined;

	const systemPrompt =
		direction === "en-to-classcn" ? EN_TO_CLASSCN_SYSTEM : CLASSCN_TO_EN_SYSTEM;
	const baseUrl = model.baseUrl.replace(/\/+$/, "");

	const body: Record<string, unknown> = {
		model: model.id,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: text },
		],
		max_tokens: text.length > 10000 ? Math.min(text.length * 2, 32000) : 4096,
		temperature: 0,
	};
	if (config.effort !== "off" && model.reasoning) {
		body.reasoning_effort = config.effort;
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${auth.apiKey}`,
	};
	if (auth.headers) Object.assign(headers, auth.headers);

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok) return undefined;

	const json = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const result = json.choices?.[0]?.message?.content;
	return result?.trim() || undefined;
}
