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

## 追加：切换到 git 安装暴露的第二个问题（commit 6dcd9b0 + 7ac2eeb）

- `pi remove <本地绝对路径>` 才能移除本地包（相对路径不匹配，pi 按解析后绝对路径识别）。
- `pi install git:github.com/toRolex/pi-tool-search` 会在克隆目录跑依赖安装，清掉仓库根 vendored 的提升补偿 node_modules；peerDependencies 被抑制安装，`typebox` 从树中消失。
- `pi-xsettings` 的 `createRequire("typebox/schema")` 走 Node 原生解析，**不经 pi 的扩展模块映射**（映射只覆盖静态 import 的 typebox 根、/compile、/value），于是断链。
- 修复：改为静态 `import { Check } from "typebox/value"`（host 映射内、本地与 git 安装都解析得到），删除 unknown 守卫 machinery。`proper-lockfile`/`smol-toml` 是声明过的 dependencies，克隆中存活，未动。
- 同款地雷排查：仓库内其余 createRequire 用法均指向已声明依赖，无同类风险。
- git 安装下复验：工具列表 10 个无 goal 工具、stderr 空、tool_search 激活回归通过。
- 教训：vendored 提升补偿只对本地路径安装有效；git 安装的正确姿势是只依赖 host 映射 specifier + 各包自己声明的 dependencies。

## Deviations

- handoff 主嫌疑"晚注册工具漏网快照"不成立，实测否决；按新证据改打 `before_agent_start` 兜底（handoff 修复方向中的备选项）。
- 顺手给两处存量 implicit-any 参数加了结构类型标注（LSP 无 vendored @earendil-works 类型解析不出；仓库无本地 tsc，最小标注消除 blocker）。
