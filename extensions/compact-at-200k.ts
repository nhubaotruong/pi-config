import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const COMPACT_THRESHOLD_TOKENS = 200_000;

const CONTINUE_MESSAGE =
	"[auto-compact] The conversation was compacted to stay under the context limit. " +
	"Nothing was cancelled — pick up exactly where you left off, using the summary above " +
	"for prior context, and continue the task without asking for confirmation.";

export default function (pi: ExtensionAPI) {
	let previousTokens: number | null | undefined;
	// Set when we trigger compaction ourselves, so we only auto-continue our own compactions.
	let continueAfterCompaction = false;

	const triggerCompaction = (
		ctx: ExtensionContext,
		customInstructions?: string,
	) => {
		if (ctx.hasUI) {
			ctx.ui.notify("Compaction started", "info");
		}
		ctx.compact({
			customInstructions,
			onComplete: () => {
				if (ctx.hasUI) {
					ctx.ui.notify("Compaction completed", "info");
				}
			},
			onError: (error) => {
				continueAfterCompaction = false;
				if (ctx.hasUI) {
					ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
				}
			},
		});
	};

	pi.on("turn_end", (_event, ctx) => {
		const usage = ctx.getContextUsage();
		const currentTokens = usage?.tokens ?? null;
		if (currentTokens === null) {
			return;
		}

		const crossedThreshold =
			previousTokens !== undefined &&
			previousTokens !== null &&
			previousTokens <= COMPACT_THRESHOLD_TOKENS;
		previousTokens = currentTokens;
		if (!crossedThreshold || currentTokens <= COMPACT_THRESHOLD_TOKENS) {
			return;
		}
		// Compacting from turn_end ends the agent loop, so the run has to be restarted
		// explicitly once the summary lands.
		continueAfterCompaction = true;
		triggerCompaction(ctx);
	});

	pi.on("session_compact", (event, ctx) => {
		previousTokens = null;

		const shouldContinue = continueAfterCompaction;
		continueAfterCompaction = false;
		// `fromExtension` is about who *generated the summary* (via session_before_compact),
		// not who *requested* the compaction. We trigger via ctx.compact() without
		// providing a custom summary, so fromExtension is always false here.
		// The `continueAfterCompaction` flag is what tracks our own compactions.
		// willRetry means the runtime already replays the aborted turn for us.
		if (!shouldContinue || event.willRetry) {
			return;
		}

		// Let the compaction entry settle before injecting the nudge.
		setTimeout(() => {
			if (ctx.hasPendingMessages()) {
				return;
			}
			pi.sendMessage(
				{
					customType: "auto-compact-continue",
					content: CONTINUE_MESSAGE,
					display: true,
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		}, 0);
	});

	pi.registerCommand("trigger-compact", {
		description: "Trigger compaction immediately",
		handler: async (args, ctx) => {
			const instructions = args.trim() || undefined;
			triggerCompaction(ctx, instructions);
		},
	});
}
