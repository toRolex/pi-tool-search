import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { ToolSearchMatch } from "../../search.ts";

export interface ToolSearchRankedMatch {
	name: string;
	description: string;
	score: number;
}

export type ToolSearchInput =
	| {
			mode: "search";
			query: string;
			normalizedQuery: string;
			limit: number;
	  }
	| {
			mode: "select";
			query: string;
			requested: readonly string[];
			unknown: readonly string[];
			alreadyActive: readonly string[];
	  };

export interface ToolSearchDetails {
	version: 3;
	tool: "tool_search";
	status: "loaded" | "no_match" | "invalid_select";
	input: ToolSearchInput;
	rankedMatches: ToolSearchRankedMatch[];
	activation: {
		before: string[];
		added: string[];
		after: string[];
	};
	counts: {
		registered: number;
		searchable: number;
		matches: number;
		added: number;
	};
	timing: {
		durationMs: number;
	};
}

interface ToolSearchSelectInput {
	requested: readonly string[];
	unknown: readonly string[];
	alreadyActive: readonly string[];
}

interface ToolSearchResultInput {
	query: string;
	limit: number;
	matches: readonly ToolSearchMatch[];
	activeBefore: readonly string[];
	added: readonly string[];
	registeredCount: number;
	searchableCount: number;
	durationMs: number;
	select?: ToolSearchSelectInput;
}

export function createToolSearchResult(input: ToolSearchResultInput): AgentToolResult<ToolSearchDetails> {
	const rankedMatches = input.matches.map((match) => ({
		name: match.tool.name,
		description: match.tool.description,
		score: match.score,
	}));
	const after = [...new Set([...input.activeBefore, ...input.added])];
	const select = input.select;
	const status = select
		? selectStatus(select, input.added)
		: rankedMatches.length === 0
			? "no_match"
			: "loaded";
	return {
		content: [{ type: "text", text: select ? selectText(input, select) : statusText(input, status) }],
		details: {
			version: 3,
			tool: "tool_search",
			status,
			input: select
				? {
						mode: "select",
						query: input.query,
						requested: select.requested,
						unknown: select.unknown,
						alreadyActive: select.alreadyActive,
					}
				: {
						mode: "search",
						query: input.query,
						normalizedQuery: input.query.trim(),
						limit: input.limit,
					},
			rankedMatches,
			activation: { before: [...input.activeBefore], added: [...input.added], after },
			counts: {
				registered: input.registeredCount,
				searchable: input.searchableCount,
				matches: rankedMatches.length,
				added: input.added.length,
			},
			timing: { durationMs: input.durationMs },
		},
	};
}

function selectStatus(select: ToolSearchSelectInput, added: readonly string[]): "loaded" | "invalid_select" {
	if (select.unknown.length > 0) return "invalid_select";
	if (added.length === 0 && select.alreadyActive.length === 0) return "invalid_select";
	return "loaded";
}

function statusText(input: ToolSearchResultInput, status: ToolSearchDetails["status"]): string {
	return status === "no_match"
		? `No inactive tools match ${JSON.stringify(input.query)}.`
		: `Loaded tools: ${input.added.join(", ")}.`;
}

function selectText(input: ToolSearchResultInput, select: ToolSearchSelectInput): string {
	if (select.unknown.length > 0) {
		return `Unknown or non-deferred tools in select query: ${select.unknown.join(", ")}. No tools were activated.`;
	}
	if (input.added.length === 0) {
		return select.alreadyActive.length > 0
			? `Tools already active: ${select.alreadyActive.join(", ")}.`
			: `No tool names after "select:".`;
	}
	return select.alreadyActive.length > 0
		? `Loaded tools: ${input.added.join(", ")}. Already active: ${select.alreadyActive.join(", ")}.`
		: `Loaded tools: ${input.added.join(", ")}.`;
}
