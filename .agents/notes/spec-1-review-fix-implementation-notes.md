# Spec-1 review fixes

## Decisions

- `before_agent_start` only prunes direct sessions when no Code Mode scope exists. Nested availability remains owned by that scope; outer active tools are untouched. Direct `activatedBySearch` protection and per-turn reassertion are retained.
- Migration now returns the parsed authoritative snapshot. Existing config is read once; a newly migrated config uses the serialized in-memory source rather than rereading the file. Cleanup failures still abort initialization and remain retryable.
- Tests use the shared extension harness for migration snapshots and dynamic scopes. Adapter integration uses the public SDK `list()` capability rather than global registry map internals.
- Added a residual xsettings registration and real `publish()` regression: observed `setActiveTools` calls continue to follow the TOML snapshot, not old publications.
- Shortcut cleanup lives in a separate parent change. The specified integration baseline already contained the void-return guard, so that change only adds both return-shape regressions and documents the guard. No rewriting of the supplied baseline.

## Validation

- Final full Bun suites: pi-tool-search 54 passed / 0 failed; pi-xsettings 112 passed / 0 failed.
- `bun install` altered tracked vendored typebox; restored it with `jj restore` before implementation.

## Deviations

- Review Spec-4 disposition, explicitly approved: the actual void guard already landed in `spec-1-t1` and is inherited by `spec-1-integration`. Keep the baseline unchanged. The independent change contains only the explanatory comment and two regression tests, with commit-body note `regression coverage for guard already landed in spec-1-t1`.
