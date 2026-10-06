# Scope advertising implementation notes

## 范围与约束

只修改 `packages/pi-tool-search/src/extension.ts`，新增 `packages/pi-tool-search/test/scope-advertising.test.ts` 与本记录。不改 `definition.ts`、现有测试、用户配置或 installed copy。不执行版本控制操作。不派 subagent，独立 review 交主线程。

## Bug fix 检查点

1. Reproduce it yourself on the matching surface via the control skill (Non-negotiables).
   用用户指定的真实 extension 与 mock host，从 TOML 输入到 lifecycle、工具 execute、广告 section 复现。
2. Binary-search the cause.
   对照 scope 快照、registry 与广告路径。读取实际源码，不依赖 handoff。
3. Plan the fix.
   不新增跨函数接口。只修当前函数内的 pending 过滤。
4. Verify on the same surface.
   新测试先 red，再 green，随后运行 tool-search 全测试。
5. Stage the commits so the failing repro lands before the fix in git history.
   skip: 用户禁止版本控制操作。保留先失败后修复的命令输出。
6. Run **Opening a PR**.
   skip: 用户禁止 PR。

## 数据形状与候选

Scope 是 session_start 时 active 且已注册的工具名集合，排除 tool_search。pending 是 registry deferred ∩ scope ∖ active。

候选 A 在 before_agent_start 的 pending 过滤中加入 scope 名集合。广告边界对齐现有 select 边界，其他消费者不变。
候选 B 将 getDeferredNames 改为 scoped deferred。会同时影响传给 select 的 callback，虽有既存 scope 检查，仍扩大变更行为面。

选择 A。无需新增接口或兼容逻辑。用户指定测试 seam 已明确，不另行询问。遵循 Model the Domain，集合表达 membership。遵循 Laziness Protocol，仅过滤广告，不改加载权限。

## 吞吐检查点

单 owner，三个独占文件。先完成可复跑的集成回归，再最小修复，最后全测试及局部静态检查。测试是 Build the Lever 的可复跑证据。

## 源码证据

`session_start` 将注册且 active 的工具快照保存到 directTools。`definition.ts` 的 select 先检查 scope.tools 名称以及 deferred 名称。`getDeferredNames` 只检查 registry。原广告只检查该列表与 loaded，遗漏 directTools membership。注册且 TOML deferred 但 session_start inactive 的工具因此被广告，却无法 select。

## 验证记录

新测试通过真实 createToolSearchExtension 注册 hooks 与工具，用仓库内临时 TOML 配置。outside 已注册且 deferred，但 session_start inactive。测试先验证 select 拒绝，再比较完整 section，随后加载 scope 内 weather 并连续两轮验证不再广告。missing 验证 registry 过滤，read 验证非 deferred 不广告。临时目录由 afterEach 删除。

Red 命令 `bun test packages/pi-tool-search/test/scope-advertising.test.ts`。退出码 1。原样输出如下。

```text
bun test v1.3.12 (700fc117)

packages/pi-tool-search/test/scope-advertising.test.ts:
54 | 	]);
55 | 	expect(active).toEqual(["tool_search", "read"]);
56 |
57 | 	const sections: Record<string, string> = { unrelated: "keep" };
58 | 	handlers.get("before_agent_start")!({ systemPromptOptions: { sections } });
59 | 	expect(sections).toEqual({
                       ^
error: expect(received).toEqual(expected)

  {
    "deferred-tools":
- "These tools are available but their schemas are not loaded: weather.
- Use tool_search with query "select:<name>" (e.g. "select:weather") to load tool schemas before calling them."
+ "These tools are available but their schemas are not loaded: outside, weather.
+ Use tool_search with query "select:<name>" (e.g. "select:outside,weather") to load tool schemas before calling them."
  ,
    "unrelated": "keep",
  }

- Expected  - 2
+ Received  + 2

      at <anonymous> (/Users/rolex/Documents/Codes/githubProject/MyProject/pi-tool-search/packages/pi-tool-search/test/scope-advertising.test.ts:59:19)
(fail) advertises and loads scoped deferred tools but rejects deferred tools inactive at session start [4.54ms]

 0 pass
 1 fail
 5 expect() calls
Ran 1 test across 1 file. [503.00ms]
```

Red 证实 select 已正确拒绝，故只修广告路径。实现增加 scopeNames 集合与一个 membership 条件。没有跨函数新接口。

Green 命令 `bun test packages/pi-tool-search/test/scope-advertising.test.ts`。退出码 0。原样输出如下。

```text
bun test v1.3.12 (700fc117)

packages/pi-tool-search/test/scope-advertising.test.ts:
(pass) advertises and loads scoped deferred tools but rejects deferred tools inactive at session start [5.84ms]

 1 pass
 0 fail
 12 expect() calls
Ran 1 test across 1 file. [492.00ms]
```

全测试命令 `cd packages/pi-tool-search && bun test test`。退出码 0。输出末尾原样如下。

```text
 51 pass
 0 fail
 143 expect() calls
Ran 51 tests across 2 files. [334.00ms]
```

主动 LSP 检查两个 TypeScript 文件，2 clean，0 diagnostics。`bunx prettier --check packages/pi-tool-search/src/extension.ts packages/pi-tool-search/test/scope-advertising.test.ts .agents/notes/scope-advertising-implementation-notes.md` 输出 `All matched files use Prettier code style!`。`bunx eslint packages/pi-tool-search/src/extension.ts packages/pi-tool-search/test/scope-advertising.test.ts --max-warnings 0` 与 `bunx tsc --noEmit --incremental false -p packages/pi-tool-search/tsconfig.json` 均退出 0，无输出。使用 noEmit 避免创建构建产物。

## 交付与风险

最终文件为本记录、extension.ts 与新 scope-advertising.test.ts。没有修改现有 tool-search.test.ts 或 definition.ts，没有改 select 范围。

Prove It Works 与 Test Behavior, Not Implementation 决定从真实 extension 入口到 hook、工具 execute、section 和 active 集合验证。No-comments 仅检查本次新增行，本次未新增注释，没有需要删除的注释。主线程执行独立 review。

宿主为 mock，未验证用户实际 Pi 会话或 installed copy。当前测试与任务指定 seam 一致。session_start 后新增注册或外部 reactivation 的其他行为不在本任务范围，不添加猜测性的兼容逻辑。

## Deviations

用户禁止派发与版本控制，相关 playbook 步骤由本 owner 串行完成或跳过。技能工具拒绝加载 user-only 技能，已完整读取对应 SKILL.md，未修改技能。
