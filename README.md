# pi-tool-search (maintained fork)

Claude-Code-style deferred tool loading for [Pi](https://github.com/earendil-works/pi-coding-agent).

Most tools stay out of the model's tool declarations. A `tool_search` tool discovers and loads them on demand, so the system prompt stays small and tools load progressively.

## Why this fork exists

The original [`@luan.sh/pi-tool-search`](https://pi.dev/packages/@luan.sh/pi-tool-search) was removed from its upstream repository ([luan/agents](https://github.com/luan/agents), commit `46145bc`, "Remove the custom code mode runtime and tool search packages"). The maintainer now relies on Pi's built-in `tool_search`, which only covers tools with `codemode`/`deferred` exposure (mainly MCP tools).

This fork keeps the original capability: deferring regular `direct` tools (built-ins and extension tools) behind a searchable loader. Pi's built-in extension cannot do this; its `isSearchable()` only accepts `codemode` and `deferred` exposure.

## What is inside

Vendored from npm at the last published versions, with fixes:

| Package | Version | Source |
| --- | --- | --- |
| `@luan.sh/pi-tool-search` | 0.3.8 | npm |
| `@luan.sh/pi-xsettings` | 0.3.6 | npm, patched |
| `@luan.sh/pi-libtui` | 0.3.9 | bundled |

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

Tool Search reads this file once when it initializes; edits affect the running instance only after `/reload`. A missing file means an empty deferred list. Invalid TOML is reported as an error. On first initialization, an existing `[tools]` section in `xsettings.toml` is migrated once: the legacy deferred list is written to the new file and the old `[tools]` section removed; other sections are preserved. The new file takes precedence if already present. `pi.defaultTools` is not migrated (deprecated; no consumer). `/xsettings` is no longer provided by this fork. The status indicator falls back to Pi's native spinner.

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
