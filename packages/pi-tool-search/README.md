# @luan.sh/pi-tool-search&nbsp;[<img src="https://pi.luan.sh/icons/pi.svg" width="14" alt="Pi gallery">](https://pi.dev/packages/@luan.sh/pi-tool-search)&nbsp;[<img src="https://pi.luan.sh/icons/npm.svg" width="14" alt="npm">](https://www.npmjs.com/package/@luan.sh/pi-tool-search)

`@luan.sh/pi-tool-search` adds `tool_search`, a normal Pi tool that finds and
activates tools which are currently inactive. It searches only the scope
assigned to it. It does not inspect or modify the global tool hierarchy.

## Preview

![@luan.sh/pi-tool-search in Bootty](https://pi.luan.sh/media/previews/pi-tool-search-350d7d9bacad.png)

[Watch the demo](https://pi.luan.sh/media/previews/pi-tool-search-14df51a672aa.mp4).

## Install

```sh
pi install npm:@luan.sh/pi-tool-search
```

Deferred tools are configured directly in `~/.pi/agent/tool-search.toml`; no xsettings extension is required.

The package registers `/tools` (TUI only), but no keybindings. It uses Pi's
dynamic tool APIs (`getAllTools`, `getActiveTools`, `setActiveTools`).

## Scope

`@luan.sh/pi-tool-search` always runs as a direct Pi tool. Its assigned scope
is the other eligible direct tools active before its first session-start pruning.
That assignment lasts for the extension instance. Loading a match calls
`pi.setActiveTools()` in that scope.

## Deferred scope

All tools remain registered with Pi, but managed configured deferred tools start
inactive. The search index uses only the initially assigned direct scope, not
all tools returned by `pi.getAllTools()`.

The assigned scope is the boundary for search and editable panel policies:

- The direct scope contains only the eligible active direct tools Tool Search was
  initially assigned, including tools subsequently made deferred/inactive.
- Registered tools outside that scope are invisible to `tool_search`, but appear
  as readonly rows in `/tools`.
- Disabled tools and tools omitted by a strict `--tools` selection are not managed
  deferred tools. Registered scope-excluded names can be displayed readonly, but
  the panel does not override their owner or infer exclusion provenance.

Configured deferred names are removed from the active set before the first model request.
`tool_search` itself stays active so the model can load a capability later.
When a query matches, activation is additive: existing active tools stay
active and only the matching tools are added. A no-match query changes
nothing. Loaded tools stay active for the rest of the session unless another
owner changes the scope.

## Deferred-tool configuration

Configure `~/.pi/agent/tool-search.toml`:

```toml
[tools]
# Comments are supported.
deferred = ["exec_command", "web__run"]
```

`tools.deferred` is an array of tool-name strings. A missing file or key means
an empty deferred list. Invalid TOML is reported as an error. Configuration
is read when the extension or a session initializes; manual edits apply after
`/reload`, the next session initialization or opening `/tools` to refresh policy.
There is no file watcher or per-turn disk read. Opening alone does not unload
search-loaded tools; a read error reports an error and retains the last valid state.
An existing new-format file takes precedence. On first initialization, an
existing legacy `[tools]` section in `xsettings.toml` is migrated once, then
removed from that file; all other sections are preserved. `/xsettings` is no
longer provided by this fork. The activity indicator falls back to Pi's native
spinner. `pi.defaultTools` is deprecated and not migrated because it has no
consumer.

## Persistent tool panel

In a TUI session, run `/tools`. All registered tools are sorted by name; only the assigned direct scope is editable. `[x] direct`
means persistently exposed; `[ ] deferred` means hidden until loaded by
`tool_search`, not disabled. Enter/Space opens a direct/deferred choice; Esc
closes it. Selecting a policy saves immediately and updates the active set,
without `/reload` or session entries. New instances inherit the saved file.

A deferred tool remains unchecked even when search has loaded it. Reopening
keeps that tool active. To unload it explicitly, select deferred again; it can
then be searched or selected again. Direct restores its declaration immediately.
Search → direct → deferred also clears the earlier search-load exemption.
Every turn reasserts the latest successfully read/saved policy within the assigned
scope, resisting unrelated extensions reactivating unloaded deferred tools while
preserving all other active state. Deferred hints track that policy and the active
set, advertising only assigned, currently unloaded tools.

A new session rereads policy and resets search-load exemptions, but retains the
scope captured before this extension's first pruning. Already-clipped active sets
cannot shrink it, and newly active outsiders cannot expand it. Inactive direct
names are not automatically restored. This plugin-level reset also handles
session-start events for resume/fork, but does **not** repair the existing blocked
host/branch automatic restoration flow.

Only tools assigned while active and direct at the instance's first session start are editable.
`tool_search` itself, host deferred/codemode (including native MCP), hidden/model-only
exposures and scope-excluded tools are listed **readonly**, never taken over.
Readonly rows show observed active/inactive state and host exposure when available,
not the managed direct/deferred policy. Their description explains the boundary;
Enter/Space performs no save or activation. Inactive alone is not evidence of
being deferred, disabled or excluded by strict selection. When host metadata does
not establish a more specific reason, the panel says only “Outside current assigned
scope”. This registered-tool catalog never expands the assigned search index.
Other active tools and configured outside/unregistered names are preserved by a toggle.

Run the independent offline component demo from the repository root:
`bun test/runtime-probes/tools-panel/discovery-demo.ts`. It uses a temporary policy
and a mock host, but the real extension and SettingsList/SelectList components;
it does not launch Pi or edit user configuration.

The writer safely locates single/multiline string arrays through literal,
quoted/escaped/dotted keys and inline tables, even with multiline strings elsewhere.
All bytes outside an existing array and all comments, including inside it, are
preserved; unregistered names remain. Comment-bearing arrays retain whitespace
while elements/commas change; arrays without internal comments may be normalized.
Missing files get an example comment; missing keys/tables are inserted without
rewriting existing content. Non-string/empty entries, malformed TOML or layouts
that cannot be safely located are explicitly rejected rather than overwritten.
Every selection rereads disk and changes only the selected tool's membership.
Observed conflicts are checked immediately before atomic commit and rejected.
A non-cooperating writer may still race between this check and rename; there is
no unconditional cross-process transaction. Parse/staging/rename failures leave
the original file, policy, active set and display unchanged; repair the cause and
retry. Non-TUI modes report an error instead of opening the panel.

Pi's official example `tools.ts` also registers `/tools`, but writes session-only
enable/disable entries. Do not load both same-named commands. This fork only
persists global direct/deferred policy; it never implements disable.

## Use the tool

The input is an object with a required query and an optional result limit
(integer, 1 to 8):

```json
{ "query": "search the web", "limit": 3 }
```

Search covers the tool name, the name with underscores as spaces, the
description, parameter names and parameter descriptions, and the group a tool
belongs to, meaning its namespace name, namespace description, and namespace
instructions. Ranking is BM25 (k1 = 1.2, b = 0.75) over stemmed tokens, with
prefix matching for query terms of three or more characters, at most eight
matches, and ties broken by tool name. A tool whose only matching text is its
namespace still matches. Namespace text carries no
separate weight, so it competes with the tool's own name and description through
the same term frequencies and document-length normalization.

### Load exact tools by name

Prefix the query with `select:` to load tools by exact name instead of
searching:

```json
{ "query": "select:exec_command,write_stdin" }
```

`select:` takes a comma-separated list. Segments are trimmed, empty segments and
duplicates are dropped, and the requested order is preserved. The request is
all-or-nothing: if any name is not registered, is registered but outside the
assigned scope, or is in scope but not in the deferred list, no tool is
activated at all. A `select:` query ignores the result limit. A name that is
already active is reported but not reactivated.

### Result text

| Situation                                | Text                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Search matched                           | `Loaded tools: weather_lookup.`                                                    |
| Search matched nothing                   | `No inactive tools match "weather".`                                               |
| Select loaded                            | `Loaded tools: exec_command, write_stdin.`                                         |
| Select loaded, some names already active | `Loaded tools: exec_command. Already active: read.`                                |
| Select found every name already active   | `Tools already active: read.`                                                      |
| Select contained a name it cannot load   | `Unknown or non-deferred tools in select query: missing. No tools were activated.` |
| Select carried no names                  | `No tool names after "select:".`                                                   |

Tool Search activates matches on the next model request, using Pi's normal
dynamic-tool loading behavior.

`tool_search` is not a parallel-call helper. There is no
`multi_tool_use.parallel` tool unless another package has separately
registered one.

## API contract

The package's Pi entry point is `src/extension.ts`. The module entry
(`src/index.ts`) exports `createToolSearchResult` for consumers that need to
build the same model-visible result shape, plus the stable result types
`ToolSearchDetails` and `ToolSearchRankedMatch`.

The result details are JSON-serializable and versioned:

```ts
type ToolSearchDetails = {
	version: 3;
	tool: "tool_search";
	status: "loaded" | "no_match" | "invalid_select";
	input:
		| { mode: "search"; query: string; normalizedQuery: string; limit: number }
		| {
				mode: "select";
				query: string;
				requested: readonly string[];
				unknown: readonly string[];
				alreadyActive: readonly string[];
		  };
	rankedMatches: Array<{ name: string; description: string; score: number }>;
	activation: { before: string[]; added: string[]; after: string[] };
	counts: { registered: number; searchable: number; matches: number; added: number };
	timing: { durationMs: number };
};
```

`status` is `loaded` for a search that matched, and for a select that loaded at
least one tool or found its request already satisfied. It is `no_match` for a
search with no match. It is `invalid_select` when the select query names
anything it cannot load, which includes a mix of loadable and unloadable names,
or when it names nothing at all. A `select:` input reports `requested`,
`unknown`, and `alreadyActive`; a search input reports `normalizedQuery` and the
applied `limit`. `counts` counts the tools in the assigned scope, the inactive
tools that were searchable, the returned matches, and the names actually
activated. `rankedMatches` carries the select names that were activated, with
score `1`.

A scope passed to the tool has these operations:

```ts
type ToolNamespace = {
	name: string;
	description?: string;
	instructions?: string;
};

type ToolSearchScope = {
	tools(): readonly {
		name: string;
		description: string;
		parameters?: unknown;
		namespace?: ToolNamespace;
	}[];
	active(): readonly string[];
	setActive(names: readonly string[]): void;
};
```

`ToolNamespace` mirrors the `ToolNamespace` type of
`@earendil-works/pi-coding-agent` 1.0.4. Pi's `getAllTools()` already returns
the namespace of every tool, so a scope that passes those entries through
directly gets namespace-aware search without any extra wiring.

The scope owner remains responsible for deciding which names are available.
Tool Search only ranks inactive entries and asks that owner to add matches.

## Troubleshooting

- **A registered tool is readonly in `/tools`:** it is outside the assigned direct
  scope or has an incompatible host exposure. The host may not reveal whether
  disabled/strict selection caused exclusion; do not infer that from inactive.
  Tool Search does not make it deferred. Unregistered tools are not listed.
- **A deferred tool is still active:** search-loaded tools stay active by design.
  Choose deferred again in `/tools` to unload it explicitly.
- **A query returns no matches:** search is limited to inactive tools in the
  assigned scope. Check the exact name and description exposed by the picker.

## Layout

| Responsibility                                        | File                                    |
| ----------------------------------------------------- | --------------------------------------- |
| Extension entry, scope selection, deferred activation | `src/extension.ts`                      |
| Persistent policy panel                               | `src/tools-panel.ts`                    |
| Deferred config, atomic editing and legacy migration  | `src/config.ts`                         |
| Tool definition and execution                         | `src/tools/tool-search/definition.ts`   |
| Result shape (`createToolSearchResult`)               | `src/tools/tool-search/result.ts`       |
| Transcript rendering                                  | `src/tools/tool-search/presentation.ts` |
| Search and ranking                                    | `src/search.ts`                         |
| Settings definitions                                  | `src/contributions/xsettings.ts`        |
| Module exports                                        | `src/index.ts`                          |

## Develop

Source: https://github.com/luan/agents, directory
harnesses/pi/agent/packages/pi-tool-search. Run `bun run typecheck` and
`bun test test` in that directory.
