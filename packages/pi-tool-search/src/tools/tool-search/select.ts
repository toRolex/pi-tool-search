export const SELECT_PREFIX = "select:";
export const DEFERRED_SECTION_KEY = "deferred-tools";

export interface SelectQuery {
	readonly requested: readonly string[];
}

/** undefined when the query does not start with "select:" (after trimStart). */
export function parseSelectQuery(query: string): SelectQuery | undefined {
	const trimmed = query.trimStart();
	if (!trimmed.startsWith(SELECT_PREFIX)) return undefined;
	const requested: string[] = [];
	for (const segment of trimmed.slice(SELECT_PREFIX.length).split(",")) {
		const name = segment.trim();
		if (name.length === 0 || requested.includes(name)) continue;
		requested.push(name);
	}
	return { requested };
}

/** undefined means the section should be deleted from systemPromptOptions.sections. */
export function renderDeferredSection(pending: readonly string[]): string | undefined {
	if (pending.length === 0) return undefined;
	const example = pending.length > 1 ? `select:${pending[0]},${pending[1]}` : `select:${pending[0]}`;
	return `These tools are available but their schemas are not loaded: ${pending.join(", ")}.\nUse tool_search with query "select:<name>" (e.g. "${example}") to load tool schemas before calling them.`;
}
