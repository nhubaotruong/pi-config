/**
 * Block Sudo Extension
 *
 * Blocks any bash command that invokes `sudo`. Use as a safety guard for
 * agents that should never need elevated privileges. If a command truly
 * requires root, run it manually outside the agent.
 *
 * Install: drop into ~/.pi/agent/extensions/ (auto-discovered) or load with
 *          `pi -e ~/.pi/agent/extensions/block-sudo.ts`.

 *
 * Notes:

 * - Comments and content inside single/double-quoted regions are stripped

 *   before matching so `echo "use sudo" # note` is not a false positive.

 *   Quoting state is tracked best-effort.

 * - Heredocs and complex interpolation are not fully parsed; sudo inside

 *   them is still blocked (fail-closed).
 */

import {
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const SUDO_PATTERN = /(?:^|[\s;&|])sudo\b/m;


/** Strip `#` comments and content inside single/double-quoted regions. */

function stripComments(command: string): string {

	return command

		.split("\n")

		.map((line) => {

			let inSingle = false;

			let inDouble = false;

			let result = "";

			for (let i = 0; i < line.length; i++) {

				const c = line[i];

				if (c === "\\") {

					i++;

					continue;

				}

				if (!inDouble && c === "'") {

					inSingle = !inSingle;

					result += " ";

					continue;

				}

				if (!inSingle && c === '"') {

					inDouble = !inDouble;

					result += " ";

					continue;

				}

				if (c === "#" && !inSingle && !inDouble) {

					break;

				}

				if (inSingle || inDouble) {

					continue;

				}

				result += c;

			}

			return result;

		})

		.join("\n");

}


export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const command = event.input.command;
		if (typeof command !== "string" || !command) return;

		if (SUDO_PATTERN.test(stripComments(command))) {
			return {
				block: true,
				reason:
					"sudo is blocked by the block-sudo extension. " +
					"Run the command yourself if elevated privileges are required.",
			};
		}
	});
}
