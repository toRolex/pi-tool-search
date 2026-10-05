import type { AgentToolResult, Theme } from "@earendil-works/pi-coding-agent";
import { ComponentStack, icon } from "@luan.sh/pi-libtui";
import { settleToolCallPreview, ToolActivity, ToolTranscript, toolCallPreview } from "@luan.sh/pi-libtui/tool";
import type { ToolSearchDetails, ToolSearchInput } from "./result.ts";

interface PresentationContext {
	readonly executionStarted: boolean;
	readonly state?: object;
	readonly args?: { readonly query?: string };
	readonly isError: boolean;
	readonly invalidate: () => void;
	readonly lastComponent: object | undefined;
}

export function renderToolSearchCall(query: string, theme: Theme, context: PresentationContext) {
	if (context.executionStarted) return new ComponentStack();
	return toolCallPreview(
		context.state ?? context,
		new ToolTranscript({
			theme,
			view: {
				verb: "Search tools",
				detail: query,
				status: "queued",
				marker: icon("search"),
			},
		}),
	);
}

export function renderToolSearchResult(
	result: AgentToolResult<ToolSearchDetails>,
	theme: Theme,
	context: PresentationContext,
	expanded: boolean,
) {
	settleToolCallPreview(context.state ?? context);
	const details = result.details;
	if (!isToolSearchDetails(details)) {
		return ToolActivity.reuse(context.lastComponent, {
			theme,
			requestRender: context.invalidate,
			view: {
				action: {
					verb: "Tool search failed",
					detail: context.args?.query,
					status: "failed",
					marker: icon("search"),
				},
				failure: resultText(result) || "Tool search failed",
			},
		});
	}
	const failed = context.isError;
	const noMatch = details.status === "no_match";
	const invalidSelect = details.status === "invalid_select";
	const verb = failed
		? "Tool search failed"
		: invalidSelect
			? "Invalid select"
			: noMatch
				? "No tools found"
				: "Loaded tools";
	const rows = details.rankedMatches.map((match) => `${match.name}  ${match.description}`);
	const view = {
		action: {
			verb,
			detail: details.input.query,
			status: failed
				? ("failed" as const)
				: invalidSelect || noMatch
					? ("warning" as const)
					: ("succeeded" as const),
			marker: icon("search"),
			meta: [`${details.counts.matches} matches`, formatDuration(details.timing.durationMs)],
		},
		running: false,
		payload: rows.length
			? { kind: "text" as const, text: rows.join("\n"), revision: details.activation.after.length + rows.length }
			: invalidSelect
				// Derived from details, not result.content: a persisted result may carry
				// an empty content array, so the diagnostics must come from the input.
				? { kind: "text" as const, text: invalidSelectText(details.input), revision: details.activation.after.length }
				: undefined,
		mode: expanded ? ("full" as const) : ("preview" as const),
	};
	return ToolActivity.reuse(context.lastComponent, {
		theme,
		requestRender: context.invalidate,
		view,
		previewRows: 4,
	});
}

function isToolSearchDetails(details: unknown): details is ToolSearchDetails {
	if (!details || typeof details !== "object") return false;
	const candidate = details as {
		version?: unknown;
		tool?: unknown;
		status?: unknown;
		input?: { mode?: unknown; query?: unknown; requested?: unknown; unknown?: unknown; alreadyActive?: unknown };
		rankedMatches?: unknown;
		activation?: { after?: unknown };
		counts?: { matches?: unknown };
		timing?: { durationMs?: unknown };
	};
	if (candidate.tool !== "tool_search") return false;
	if (!Array.isArray(candidate.rankedMatches)) return false;
	if (
		!candidate.rankedMatches.every(
			(match) =>
				match !== null &&
				typeof match === "object" &&
				typeof match.name === "string" &&
				typeof match.description === "string",
		)
	)
		return false;
	if (!Array.isArray(candidate.activation?.after)) return false;
	if (!Number.isFinite(candidate.counts?.matches)) return false;
	if (!Number.isFinite(candidate.timing?.durationMs)) return false;
	if (candidate.version === 2) {
		return (
			(candidate.status === "loaded" || candidate.status === "no_match") &&
			typeof candidate.input?.query === "string"
		);
	}
	if (candidate.version !== 3) return false;
	if (candidate.status !== "loaded" && candidate.status !== "no_match" && candidate.status !== "invalid_select") return false;
	const input = candidate.input;
	if (input?.mode === "search") return typeof input.query === "string";
	if (input?.mode === "select") {
		return (
			typeof input.query === "string" &&
			Array.isArray(input.requested) &&
			Array.isArray(input.unknown) &&
			Array.isArray(input.alreadyActive)
		);
	}
	return false;
}

function invalidSelectText(input: ToolSearchInput): string {
	if (input.mode !== "select" || input.unknown.length === 0) return 'No tool names after "select:".';
	return `Unknown or non-deferred tools in select query: ${input.unknown.join(", ")}. No tools were activated.`;
}

function resultText(result: AgentToolResult<ToolSearchDetails>): string {
	return (Array.isArray(result.content) ? result.content : [])
		.flatMap((item) => {
			if (!item || typeof item !== "object") return [];
			const entry = item as { type?: unknown; text?: unknown };
			const type = entry.type;
			const text = entry.text;
			return type === "text" && typeof text === "string" ? [text] : [];
		})
		.join("\n");
}

function formatDuration(milliseconds: number): string {
	return milliseconds < 1_000 ? `${Math.max(0, Math.round(milliseconds))}ms` : `${(milliseconds / 1_000).toFixed(1)}s`;
}
