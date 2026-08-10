// =============================================================================
// pi-fabric-hashline-bridge.ts
// -----------------------------------------------------------------------------
// Companion extension for pi-hashline-edit-pro.
//
// Blocks the built-in `edit` tool when invoked from inside a pi-fabric
// `fabric_exec` run (detected via `event.toolCallId.startsWith("fabric_")`,
// pi-fabric's NESTED_TOOL_CALL_ID_PREFIX). The block reason points the model
// at `extensions.replace`, the captured hashline-anchored replace tool.
//
// Inside `fabric_exec`, captured extension tools are reached via:
//   • Full-code mode (default — `fabric.fullCodeMode: true` or
//     `schema.mode: "enforce"`): `extensions.replace({ ... })` directly.
//   • QuickJS mode: `tools.call({ ref: "extensions.replace", args: { ... } })`.
// The block reason lists both syntaxes so the model picks the working one on
// the first retry instead of guessing.
//
// Install: drop into ~/.pi/agent/extensions/ and add to settings.json:
//   "extensions": ["extensions/pi-fabric-hashline-bridge.ts"]
// Disable with PI_FABRIC_HASHLINE_BRIDGE=0.
// =============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

const FABRIC_NESTED_PREFIX = "fabric_";

const FABRIC_EDIT_REASON = [
	"[pi-fabric-hashline-bridge] `pi.edit` from inside `fabric_exec` is blocked.",
	"",
	"Use the captured hashline-anchored `replace` tool (pi-hashline-edit-pro: stable hashes, per-edit undo) — never the built-in edit. Inside `fabric_exec` the syntax depends on the runtime:",
	"  Full-code mode (default): `extensions.replace({ path, remove_from, remove_to, replacement_text })`",
	"  QuickJS mode:            `tools.call({ ref: \"extensions.replace\", args: { path, remove_from, remove_to, replacement_text } })`",
	"",
	"Same pattern for the other captured tools:",
	"  read:  `extensions.read({ path, offset, limit })`            |  QuickJS: `tools.call({ ref: \"extensions.read\", args: { path, offset, limit } })`",
	"  undo:  `extensions.undo_last_replace({ path })`              |  QuickJS: `tools.call({ ref: \"extensions.undo_last_replace\", args: { path } })`",
].join("\n");

export default function (pi: ExtensionAPI): void {
	if (process.env.PI_FABRIC_HASHLINE_BRIDGE === "0") return;

	pi.on("tool_call", (event) => {
		if (!isToolCallEventType("edit", event)) return;
		if (!event.toolCallId.startsWith(FABRIC_NESTED_PREFIX)) return;
		return { block: true, reason: FABRIC_EDIT_REASON };
	});
}
