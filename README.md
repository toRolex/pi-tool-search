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
| `@luan.sh/pi-code-mode` | 0.3.9 | bundled |
| `@luan.sh/pi-libtui` | 0.3.9 | bundled |

Changes against the published packages:

- `packages/pi-xsettings`: `typebox` moved from `dependencies` to `peerDependencies: "*"` (matches upstream commit `52646c8`, silences Pi's host-package warning).
- Root manifest wires both extensions so a single `pi install git:...` loads the pair.

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

List the tools to defer in `~/.pi/agent/xsettings.toml`:

```toml
[tools]
pi-tool-search.tools = ["web_search", "herdr_spawn_agent"]
```

Tools not listed stay declared to the model. Edit interactively with `/xsettings` after the session starts. Reopen the session after changing the file.

The first run compiles a small Rust helper (`code-mode-host`); a Rust toolchain is required.

## License

MIT, inherited from the upstream project.
