# pi-tool-search fork：修复 create_goal/get_goal 未隐藏

## 根因（运行时取证，非猜测）

1. 插桩 `session_start`：`pi-goal-x` 在扩展加载时同步注册工具，并非"晚注册"。`session_start` 时 create_goal/get_goal 已 active 且进入 directTools，deferred 列表也完整（27 项，含这两个）。fork 的隐藏逻辑本身工作正常，`post-setActive` 后 active 集已不含它们。
2. 插桩 `before_agent_start`：两事件之间，active 集里重新出现了 create_goal/get_goal。
3. 元凶：`pi-goal-x/extensions/goal-state.ts` 的 `installGoalToolProfile()`——在它自己的 `session_start` handler（async，`await core.loadState(ctx)` 之后执行，晚于 fork 的同步 session_start）和**每个 `before_agent_start`**（goal-events.ts:353）里无条件 `current.add(goalTool)` 并 `pi.setActiveTools`。它 merge 时不认识 defer 概念。
4. pi core 证据：`setActiveToolsByName` 同步改 `agent.state.tools` 并重建 system prompt；`before_agent_start` handler 按扩展加载顺序串行 await（runner.js emitBeforeAgentStart）。用户 settings 里 fork 的包排最后 → 其 handler 最后跑，turn 开始时剪枝能赢。

## 修复决策

- 在 fork 增加 `before_agent_start` 剪枝：`active.filter(name => !deferred || activatedBySearch.has(name))`，仅当结果有变化才调 `setActiveTools`。
- 增量合并，不碰非 deferred 工具，满足"不得覆盖用户手动开关"约束的既有语义（session_start 本就每次会话重藏全部 deferred，故 turn 开始重申同一策略是一致的；indistinguishable 的"用户手动重开 deferred 工具"场景由 xsettings.toml 作为意图源头裁决）。
- 记录 `activatedBySearch`：tool_search 激活的 deferred 工具保持整 session 可见（避免回归现有"激活一次持续可用"UX）。钩在 directScope.setActive 包一层。
- 已知边界：codemode 作用域内的 tool_search 激活不经过 directScope.setActive，其激活会被下一轮剪掉（正常会话模型走 direct 路径，可接受）。
- 顺序依赖：剪枝胜负取决于 fork 包在 settings 列表中晚于 pi-goal-x 加载。用户当前配置满足（pi list 确认排最后）。不改 pi core、不 patch pi-goal-x（第三方包，scope creep）。

## 验证

- `pi -p` 复现输出（修复前，12 个）：`read, bash, edit, write, grep, find, use_skill, list_skills, codemode, create_goal, get_goal, tool_search`
- 修复后（10 个，goal 工具消失）：`read, bash, edit, write, grep, find, use_skill, list_skills, codemode, tool_search`，stderr 为空。
- 回归：让模型调 tool_search 激活 web_search，同 turn 内 8 个 deferred 工具成功激活可见；stderr 干净。activatedBySearch 保证激活后整 session 保持。
- 未写自动化测试：bug 只在真实扩展生态（pi-goal-x + xsettings）下复现，单测需完整 pi runtime，属 integration-heavy，按 playbook 跳过。

## Deviations

- handoff 主嫌疑"晚注册工具漏网快照"不成立，实测否决；按新证据改打 `before_agent_start` 兜底（handoff 修复方向中的备选项）。
- 顺手给两处存量 implicit-any 参数加了结构类型标注（LSP 无 vendored @earendil-works 类型解析不出；仓库无本地 tsc，最小标注消除 blocker）。
