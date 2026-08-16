import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const COMPACT_THRESHOLD_TOKENS = 192_000;

// Hysteresis margin: after the first compaction the trigger threshold is
// raised by this amount. Without it, the auto-continue message makes the model
// redo the same work, tokens cross the threshold again, and the session loops
// compact → continue → redo → compact, which looks like the model repeating
// the same output forever.
const HYSTERESIS_MARGIN_TOKENS = 16_000;

// Delay before injecting the continue message, letting the session rebuild its
// context after compaction.
const CONTINUE_DELAY_MS = 100;

const CONTINUE_MESSAGE =
	"[auto-compact] The conversation was compacted to stay under the context limit. " +
	"Nothing was cancelled — pick up exactly where you left off, using the summary above " +
	"for prior context, and continue the task without asking for confirmation.";

interface SessionState {
	/** Token count from the previous turn_end, for edge-crossing detection. */
	previousTokens: number | null | undefined;
	/** Set when we trigger compaction ourselves, so we only auto-continue our own compactions. */
	continueAfterCompaction: boolean;
	/** Guards against sending the continue message more than once per compaction. */
	continueSent: boolean;
	/** Effective trigger threshold; raised by the hysteresis margin after the first compaction. */
	triggerThreshold: number;
}

export default function (pi: ExtensionAPI) {
	// Per-session state. Module-level state would leak across sessions and
	// trigger compactions / continue messages in the wrong session.
	const sessions = new Map<string, SessionState>();

	const sessionKey = (ctx: ExtensionContext): string =>
		ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();

	const getState = (ctx: ExtensionContext): SessionState => {
		const key = sessionKey(ctx);
		let state = sessions.get(key);
		if (!state) {
			state = {
				previousTokens: undefined,
				continueAfterCompaction: false,
				continueSent: false,
				triggerThreshold: COMPACT_THRESHOLD_TOKENS,
			};
			sessions.set(key, state);
		}
		return state;
	};

	const triggerCompaction = (
		ctx: ExtensionContext,
		state: SessionState,
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
				state.continueAfterCompaction = false;
				if (ctx.hasUI) {
					ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
				}
			},
		});
	};

	pi.on("turn_end", (_event, ctx) => {
		const state = getState(ctx);
		const usage = ctx.getContextUsage();
		const currentTokens = usage?.tokens ?? null;
		if (currentTokens === null) {
			return;
		}

		const crossedThreshold =
			state.previousTokens !== undefined &&
			state.previousTokens !== null &&
			state.previousTokens <= state.triggerThreshold;
		state.previousTokens = currentTokens;
		if (!crossedThreshold || currentTokens <= state.triggerThreshold) {
			return;
		}
		// Compacting from turn_end ends the agent loop, so the run has to be restarted
		// explicitly once the summary lands.
		state.continueAfterCompaction = true;
		state.continueSent = false;
		triggerCompaction(ctx, state);
	});

	pi.on("session_compact", (event, ctx) => {
		const state = getState(ctx);
		state.previousTokens = null;
		// Raise the trigger threshold so the model gets room to make progress
		// before the next compaction, breaking the compact → redo → compact loop.
		state.triggerThreshold = COMPACT_THRESHOLD_TOKENS + HYSTERESIS_MARGIN_TOKENS;

		const shouldContinue = state.continueAfterCompaction;
		state.continueAfterCompaction = false;
		// `fromExtension` is about who *generated the summary* (via session_before_compact),
		// not who *requested* the compaction. We trigger via ctx.compact() without
		// providing a custom summary, so fromExtension is always false here.
		// The `continueAfterCompaction` flag is what tracks our own compactions.
		// willRetry means the runtime already replays the aborted turn for us.
		if (!shouldContinue || event.willRetry || state.continueSent) {
			return;
		}
		state.continueSent = true;

		// Let the compaction entry settle before injecting the nudge.
		const key = sessionKey(ctx);
		setTimeout(() => {
			// Skip if the session was shut down or replaced in the meantime.
			if (sessions.get(key) !== state) {
				return;
			}
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
		}, CONTINUE_DELAY_MS);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		sessions.delete(sessionKey(ctx));
	});

	pi.registerCommand("trigger-compact", {
		description: "Trigger compaction immediately",
		handler: async (args, ctx) => {
			const instructions = args.trim() || undefined;
			triggerCompaction(ctx, getState(ctx), instructions);
		},
	});
}
