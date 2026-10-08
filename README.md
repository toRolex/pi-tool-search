# pi-tool-search (maintained fork)

Claude-Code-style deferred tool loading for [Pi](https://github.com/earendil-works/pi-coding-agent).

Most tools stay out of the model's tool declarations. A `tool_search` tool discovers and loads them on demand, so the system prompt stays small and tools load progressively.

## Why this fork exists

The original [`@luan.sh/pi-tool-search`](https://pi.dev/packages/@luan.sh/pi-tool-search) was removed from its upstream repository ([luan/agents](https://github.com/luan/agents), commit `46145bc`, "Remove the custom code mode runtime and tool search packages"). The maintainer now relies on Pi's built-in `tool_search`, which only covers tools with `codemode`/`deferred` exposure (mainly MCP tools).

This fork keeps the original capability: deferring regular `direct` tools (built-ins and extension tools) behind a searchable loader. Pi's built-in extension cannot do this; its `isSearchable()` only accepts `codemode` and `deferred` exposure.

## What is inside

Vendored from npm at the last published versions, with fixes:

| Package                   | Version | Source       |
| ------------------------- | ------- | ------------ |
| `@luan.sh/pi-tool-search` | 0.3.8   | npm          |
| `@luan.sh/pi-xsettings`   | 0.3.6   | npm, patched |
| `@luan.sh/pi-libtui`      | 0.3.9   | bundled      |

Changes against the published packages:

- `packages/pi-xsettings`: `typebox` moved from `dependencies` to `peerDependencies: "*"` (matches upstream commit `52646c8`, silences Pi's host-package warning).
- Root manifest exposes one extension entry: `tool-search`. The xsettings and libtui extensions are not loaded by this fork.

## Install

```sh
pi install git:github.com/toRolex/pi-tool-search
```

Disable Pi's built-in tool-search extension (same `tool_search` name, different scope):

```json
{
	"extensions": ["-builtin:tool-search"]
}
```

## Configure

List deferred tool names in `~/.pi/agent/tool-search.toml`:

```toml
[tools]
# Add comments freely; only named tools are deferred.
deferred = ["web_search", "herdr_spawn_agent"]
```

Tool Search reads this file at initialization. A missing file means an empty deferred list. Invalid TOML is reported as an error. On first initialization, an existing `[tools]` section in `xsettings.toml` is migrated once: the legacy deferred list is written to the new file and the old `[tools]` section removed; other sections are preserved. The new file takes precedence if already present. `pi.defaultTools` is not migrated (deprecated; no consumer). `/xsettings` is no longer provided by this fork. The status indicator falls back to Pi's native spinner.

### Persistent `/tools` panel

In interactive TUI mode, `/tools` lists **all registered tools**, sorted by name; only this extension's assigned direct scope is editable. `[x] direct` means the schema stays exposed; `[ ] deferred` means `tool_search` can load it on demand, **not disabled**. Enter/Space opens an explicit direct/deferred choice. Each selection atomically saves `tool-search.toml` and updates current active declarations without `/reload`; new instances inherit the saved policy.

A search-loaded managed tool still displays deferred. Reopening the panel does not unload it; choosing deferred again explicitly unloads it so search can load it again later. `tool_search` itself, host deferred/codemode (including native MCP), hidden/model-only exposures and tools outside the assigned scope are readonly. These rows show observed active/inactive state and host exposure when available, **not this extension's deferred policy**. Selecting a readonly row shows a reason but Enter/Space cannot change it. Reasons use only host-observable metadata; without clear evidence they report only “Outside current assigned scope”, not guessed disabled/strict-selection provenance. The discovery catalog never enlarges the search index or enables excluded tools. Configured scope-excluded and unregistered names remain preserved.

Offline component demo (temporary policy, no user Pi configuration): `bun test/runtime-probes/tools-panel/discovery-demo.ts`.

The editor supports single/multiline string arrays, quoted/escaped/dotted keys, inline tables and multiline strings. It preserves bytes outside the existing `tools.deferred` array, all comments (including inside the array) and unregistered names. Missing files, keys or tables are created without rewriting existing content. Arrays without internal comments may be normalized; comment-bearing arrays retain comments and whitespace while changing elements/commas. Invalid TOML, non-string/empty entries or layouts that cannot be safely located are explicitly rejected. Parse/write failures preserve the original file, policy, active tools and displayed selection; fix the cause and retry. Each save checks for observed concurrent edits before atomic commit and rejects conflicts. A non-cooperating writer can still race between that check and rename: this is not an unconditional cross-process transaction.

Reopening the panel refreshes persisted policy, registered tools and observed active state without unloading search-loaded tools. Every selection rereads disk before changing one name; search → direct → deferred immediately revokes the previous load exemption, and search can load the tool again. Each turn reasserts the latest successfully read/saved policy only within the assigned scope, preserving unrelated active tools; the deferred hint lists only managed, currently unloaded tools. Read errors report an error and retain the previous valid policy and load state.

Each new session reads the persisted policy and resets search-load exemptions. The extension retains its initially assigned scope even when active tools were already pruned; it never recaptures newly active outsiders or restores unrelated/inactive direct tools. This reset is not a fix for the existing blocked automatic resume/fork restoration. Manual edits apply after reopening `/tools`, the next session initialization or `/reload` (no file watcher and no per-turn disk read). Non-TUI modes receive an explicit error. Do not install Pi's official example `tools.ts` alongside this extension: its same-named `/tools` command controls session-only enable/disable, whereas this command persists direct/deferred policy globally.

### Git-source upgrade smoke

After the release branch is pushed with approval, reproduce the upgrade check in a real Pi environment:

1. Run `pi update --extensions`, then restart Pi. Confirm the startup banner contains exactly one `pi-tool-search` `tool-search` entry.
2. Run `pi -p` with a `tool_search` availability probe. Confirm the tool is present.
3. Directly invoke `tool_search`; confirm it activates a matching deferred tool and previews remain readable, with no missing extension-host errors.
4. In an interactive session, edit `tool-search.toml`; verify the current behavior is unchanged, run `/reload`, then confirm the new deferred list takes effect.
5. Restore the user's original configuration and verify legacy migration preserved non-`[tools]` sections.

Execution is pending push approval; do not run against user configuration before approval.

## License

MIT, inherited from the upstream project.
