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

The package registers no keybindings and no commands. It uses Pi's dynamic
tool APIs (`getAllTools`, `getActiveTools`, `setActiveTools`).

## Scope

`@luan.sh/pi-tool-search` always runs as a direct Pi tool. Its assigned scope
is the other tools that were active in Pi at session start. Loading a match
calls `pi.setActiveTools()` in that scope.

## Deferred scope

All tools remain registered with Pi, but checked tools start inactive. At
session start, the package builds the deferred-tool picker from its assigned
scope. It does not use every tool returned by `pi.getAllTools()` as a global
search index.

The assigned scope is the boundary for both the picker and the search:

- The direct scope contains only the active direct tools that Tool Search was
  assigned.
- Registered tools outside that scope are invisible to `tool_search`.
- Disabled tools, tools omitted by a strict `--tools` selection, and tools
  outside the current scope are not deferred and do not appear in the picker.

Checked names are removed from that scope before the first model request.
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
is read once when the extension initializes; changes apply after `/reload`.
An existing new-format file takes precedence. On first initialization, an
existing legacy `[tools]` section in `xsettings.toml` is migrated once, then
removed from that file; all other sections are preserved. `/xsettings` is no
longer provided by this fork. The activity indicator falls back to Pi's native
spinner. `pi.defaultTools` is deprecated and not migrated because it has no
consumer.

## Use the tool

The input is an object with a required query and an optional result limit
(integer, 1 to 8):

```json
{ "query": "search the web", "limit": 3 }
```

Search covers tool names, descriptions, parameter names, and parameter
descriptions, ranked with BM25 over stemmed tokens with prefix matching for
terms of three or more characters. It returns at most eight ranked matches.
A successful result reports `Loaded tools: ...`; a no-match result reports
that no inactive tool matched. Tool Search activates matches on the next model
request, using Pi's normal dynamic-tool loading behavior.

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
	version: 2;
	tool: "tool_search";
	status: "loaded" | "no_match";
	input: { query: string; normalizedQuery: string; limit: number };
	rankedMatches: Array<{ name: string; description: string; score: number }>;
	activation: { before: string[]; added: string[]; after: string[] };
	counts: { registered: number; searchable: number; matches: number; added: number };
	timing: { durationMs: number };
};
```

A scope passed to the tool has these operations:

```ts
type ToolSearchScope = {
	tools(): readonly { name: string; description: string; parameters?: unknown }[];
	active(): readonly string[];
	setActive(names: readonly string[]): void;
};
```

The scope owner remains responsible for deciding which names are available.
Tool Search only ranks inactive entries and asks that owner to add matches.

## Troubleshooting

- **A tool is not in the picker:** it was inactive before Tool Search built its
  scope, disabled by Pi's tool selection, or has not been registered yet. Tool
  Search does not make it deferred.
- **A checked tool still appears direct:** restart the session so the deferred
  set is applied at startup.
- **A query returns no matches:** search is limited to inactive tools in the
  assigned scope. Check the exact name and description exposed by the picker.

## Layout

| Responsibility                                        | File                                    |
| ----------------------------------------------------- | --------------------------------------- |
| Extension entry, scope selection, deferred activation | `src/extension.ts`                      |
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
