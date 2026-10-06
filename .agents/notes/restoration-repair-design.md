# Resume 与 fork 恢复设计

## 结论

完整自动恢复为 BLOCKED。本轮不改生产扩展，不交 preserve-only 子修，不改 installed pi 或配置。

扩展能保证已被 core 禁止的普通工具不能通过 `setActiveTools` 重新激活。扩展不能识别显式 `tools`、`noTools` 与默认选择的来源。因此不能同时承诺 fresh 默认隐藏、显式选择优先与 resume/fork 自动恢复。不能根据 active 的形状猜测来源，再自动扩大 active。

主线程决定是否实施。推荐先要求 core 提供选择来源与有效恢复策略，再在 repo 扩展接入。扩展私有 journal 不能补足这项信息。

调查只读。唯一仓库写入为本文。没有读取任何用户 session transcript，没有扫描其他 branch 或其他项目 transcript。没有运行共享 evidence probe。隔离实验在 `/tmp` 创建新 SessionManager，1.0.4 仅追加本实验的 system declaration，没有 provider 请求。

## 调查流程与来源

完整读取 poteto-mode、how、architect、arena 及适用原则叶子。先 ground，再比较结构候选。throughput checkpoint: n/a, read-only investigation。

首读交接文件 `/var/folders/d9/_0gbv97x6332wsrqhr4fcyj80000gn/T/handoff-tool-search-verified-issues.md`、`.agents/notes/independent-verification.md`、`test/runtime-probes/resume-fork/README.md` 与 `packages/pi-tool-search/src/extension.ts`。

API investigator 返回 `/tmp/pi-tool-observability-report.md`。本文用实际源码与隔离实验核对关键结论。第二 how investigator 的 glm 启动失败，替补 luna 在主线程要求收敛时中断。两个 k3 architect runner 未交付可验收 artifact，不计为支持证据。下列三候选由本调查综合，不能称为已完成多模型交叉验收。

## 准确版本与 API

0.84.2 package root 为 `packages/pi-tool-search/node_modules/@earendil-works/pi-coding-agent`。本机 realpath 为 `/Users/rolex/.pi/agent/git/github.com/toRolex/tmp-earendil/node_modules/@earendil-works/pi-coding-agent`。

1.0.4 package root 为 `/Users/rolex/Library/pnpm/global/v11/105ce-18dbda8f62723330-0/node_modules/.pnpm/@earendil-works+pi-coding-agent@1.0.4_@aws-sdk+credential-provider-node@3.972.84_@smithy+signature-v4@5.7.4_ws@8.22.0/node_modules/@earendil-works/pi-coding-agent`。

以下 `dist/` 行号相对对应 package root。

| 事实                          | 0.84.2                                                                                   | 1.0.4                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| factory 总是计算 initial 数组 | `dist/core/sdk.js:132-137,255-257`                                                       | `dist/core/sdk.js:145-150,301-305`                                                             |
| constructor transcript 恢复   | 没有这套恢复                                                                             | `dist/core/agent-session.js:212-213` 仅 initial 为 undefined 时恢复                            |
| 选择来源                      | 没有公开来源                                                                             | 私有 `_usesDefaultTools`，`agent-session.js:189-196` 与 `agent-session.d.ts:268`，不对扩展公开 |
| 启动事件                      | `extensions/types.d.ts:415-421`                                                          | `extensions/types.d.ts:554-561`，只有 reason 与 previousSessionFile                            |
| 扩展工具接口                  | `extensions/types.d.ts:949-953`                                                          | `extensions/types.d.ts:1249-1261`                                                              |
| 设置接口                      | `ExtensionAPI.getSettings` 不存在                                                        | `getSettings()` 只给 effective settings，不给 SDK tools/noTools 来源                           |
| ToolInfo                      | `extensions/types.d.ts:1146-1148`，无 exposure                                           | `extensions/types.d.ts:1542-1547`，有 exposure、namespace、annotations                         |
| readonly session 接口         | `session-manager.d.ts:140`，有 getBranch、buildContextEntries，无 buildSessionProjection | `session-manager.d.ts:178`，有 getBranch、buildContextEntries、buildSessionProjection          |

重要纠正。两版 `ctx.sessionManager` 的 readonly 接口都不暴露 `buildSessionContext()`。1.0.4 扩展应读 `buildSessionProjection().messages`，不能照 core 私有代码直接调用 readonly 上不存在的方法。0.84.2 的上下文还没有这套 system tool delta 契约，不能用 1.0.4 的类型 cast 宣称兼容。

### hard constraints 与 active policy 不是同一件事

0.84.2 的 registry 在 `agent-session.js:1943-1978` 用精确名称 Set 过滤 allowed/excluded。setter 在 `:631-645` 只激活 registry 中存在的名字。

1.0.4 的 `_isAllowedTool` 在 `agent-session.js:1114-1120`。registry 在 `:2817,2819,2849` 过滤。setter 的 `_applyToolLoadout` 在 `:1151-1155` 只接纳 registered、非 hidden、可 activatable 工具。

1.0.4 MCP 是例外规则，不是简单的全局严格 allowlist。普通 allowlist 可保留未命名 MCP；空 allowlist 或含 `mcp__` 的匹配式会过滤 MCP。见 `agent-session.js:191-196`。未命名但保留的 MCP 只有非 direct exposure 且已注册 `tool_search` 才能声明。见 `:1128-1130`。exclude 优先拒绝。wildcard 匹配为 1.0.4 规则，0.84.2 不是相同语义。

因此可证明普通 direct probe 的 hard deny 不会被 setter 绕过。不能把这一点扩大为所有 MCP 请求、prepareLoadout 投影与显式选择来源都兼容。

## 隔离运行证据

可由主线程独立重跑，脚本只读 package，资源发现禁用，ModelRuntime 禁网络刷新。没有调用 prompt，没有模型 HTTP，也没有真实 MCP。脚本不是 OS 网络沙箱。

```sh
node /tmp/pi-restoration-design-26471/observe.mjs
node /tmp/pi-restoration-design-26471/observe-084.mjs
node /tmp/pi-restoration-design-26471/observe-fresh.mjs
node /tmp/pi-restoration-design-26471/observe-fresh-084.mjs
```

四条均退出 0。前两条用相同 resume 事件。1.0.4 有实验自建的 system loadout，0.84.2 不伪造新 schema。后两条为空 transcript 与 startup 事件。每条生成自己的 `/tmp/pi-restoration-api-*`，不读用户 session。

输出分别为 `/tmp/pi-restoration-design-26471/observations.json`、`observations-084.json`、`observations-fresh.json`、`observations-fresh-084.json`。对应日志为同目录的 `observe.log`、`observe-084.log`、`observe-fresh.log`、`observe-fresh-084.log`。两个主体脚本通过 `node --check`。

主线程已读取并独立运行前两条，均退出 0。独立输出为 `/tmp/pi-restoration-design-main-104.log` 与 `/tmp/pi-restoration-design-main-084.log`。后两条仅作者运行，不冒称独立验收。

每版比较两种输入。输入 A 不传 tools，配置 defaultTools 覆盖 builtin registry，custom direct probe 默认注册。输入 B 显式 tools 覆盖全部同一 registry，包括 probe。两者的 active、all tools、设置和相同事件完全一致，assertions 通过。1.0.4 的 probe exposure 都是 direct。来源不同，扩展可见信息相同。

其余 assertions 证明显式 `tools:['read']`、`noTools:'all'`、exclude probe 都不能由 setter 增加 probe；`noTools:'builtin'` 与空 defaultTools 仍允许 extension/custom direct probe。空 defaultTools 不是 noTools all。

实验迭代错误保留边界。首轮 1.0.4 explicit 未列 powershell/grep/find/ls，all tools 比较失败，不能算同观测证据。补齐全部 registry 后才通过。首轮 0.84.2 调用不存在的 SettingsManager.getSettings 失败，改用 getDefaultTools 后通过。0.84.2 setter 会保留重复名字，本实验不把这一点当恢复结果。

## 当前 active branch 的合法 loadout

1.0.4 首选 `ctx.sessionManager.buildSessionProjection().messages`。它遵循当前 leaf，并处理 compaction 与 context edit。`session-manager.js:201-228,256-282,1084-1089` 给出投影实现。扩展不能调用 `getEntries()` 再扫描全树，也不能读取 previousSessionFile 或 parentSession 追踪其他分支。

`getBranch()` 只可用于当前 leaf 的 lineage 元数据。工具声明应以投影后的 messages 为准，不能把压缩前的 system delta 重新加回。compaction entry 可以携带 systemMessage，投影处理位于 `session-manager.js:166-190`。旧 compaction 缺快照时不得从已压缩历史猜补 loadout。

合法 1.0.4 声明来自 system message 的 `toolsAdded` 完整定义与 `toolsRemoved` 名字引用。schema 见 sibling `pi-ai/dist/types.d.ts:352-367`。`pi-ai/dist/utils/transcript.js:41-52` 按顺序先删除后添加。同名 Map 最后定义生效。最后一条 system message 不是完整快照，不能只取它；空 loadout 也不能当成没有历史。

SessionManager 文件解析并不完成消息 validation，源码注释在 `session-manager.js:169-170`。repo 边界需拒绝 malformed delta，输出 invalid，而非部分采信后扩大 active。可从消息中只验证 loadout 所需字段，不能执行 transcript 中携带的定义。tool name 最终仍须匹配当前 registry 与 exposure policy。schema、注册可用性、选择授权是三项独立条件。

必须区分 absent、valid empty、valid nonempty 与 invalid。纯提示 system message 可存在而无 tool delta；不能据其存在断言已有工具加载记录。工具执行历史、旧 `tool_search` 文本输出与助手宣称都不是合法 loadout。

## 三个结构候选

| 候选                                        | 调用者体验与边界                                                                                                    | 优点                                         | 不采纳原因                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A。repo branch reducer 自动恢复             | session_start 读取当前投影并合并注册工具；before_agent_start 保留重建集合                                           | 不另建状态存储，修第二个扩展裁剪原因         | 不知道显式选择来源。恢复 missing active 属自动扩大。只 preserve 已 active 又无法修 factory，且 fresh 显式选择仍不兼容 |
| B。extension 私有 journal                   | select 后 append 自定义 snapshot，恢复时仅读当前 branch 最后版本                                                    | 可支持 0.84.2 的未来会话，区分本扩展选择记录 | 不支持既有 loadout，无权威 user toggle/他扩展 delta，仍不知道当前 tools/noTools 来源。增加双重状态与同步负担          |
| C。core policy seam，扩展只做 deferred 规则 | core 拥有 selection 来源、合法当前 loadout、pending registration 与约束。repo 只在默认 fresh 分支隐藏 TOML deferred | 一处权威策略，明确处理显式选择与版本差异     | 现有两版公开 API 不足，需要上游能力或受控 SDK factory 接入，本轮 BLOCKED                                              |

选择 C。接受完整修复暂缓，换取不猜权限和不引入半兼容状态。A 的 active-branch 验证规则可移入 C，但不实施 preserve-only 子修。拒绝 B 的私有 journal。最小代码量不等于最小完整修复，不能省掉授权来源。

## 推荐最小完整方案

调用者仍只安装 repo extension，不增加恢复 flag，不要求读取其他 session。fresh 默认隐藏 deferred；select 后正常持久化；默认 resume/fork 恢复合法当前 loadout；显式选择遵守 core 已确定的优先级。

以下是所需 API 设计，不是当前已经存在的接口。

```ts
type LoadoutEvidence =
	{ kind: "absent" } | { kind: "valid"; names: readonly string[] } | { kind: "invalid"; reason: string };

type SelectionPolicy =
	| { kind: "default"; loadout: LoadoutEvidence }
	| { kind: "explicit"; requested: readonly string[] }
	| { kind: "no-tools"; mode: "all" | "builtin" }
	| { kind: "unknown" };
```

core 持有 registry filtering、MCP matching、exposure 与 late-registration pending。它提供只读 policy/effective loadout，或直接完成授权后的恢复，再给扩展一个确定的 default-fresh 标识。repo 不读取 process.argv、私有 `_usesDefaultTools` 或任意设置文件来猜 SDK 输入。unknown 与 invalid 不得自动增加 active。

最小 repo 变更点为现有 `extension.ts` 内 lifecycle reconciliation。不要先建多层服务。数据结构先替换只能记录 select 的 `activatedBySearch`，把 branch evidence 与 activation authority 分开。`directScope.setActive` 不能继续同时承担初始化裁剪和“搜索已激活”的记账，初始化不能误标搜索授权。

core factory 的默认恢复修正还须解决 `initialActiveToolNames` 总有值的问题。已有合法 loadout、默认策略时不传 fresh initial；显式 tools/noTools 时保留明确策略。defaultTools 对 resume 是否只作 fresh 默认，需要上游明确，不可从名字推断。

repo 在完整 policy 能力可用前应保留现状并报告受限，不改 installed pi。不做 constructor 私有字段 patch，不调用 `_restoreToolsFromTranscript`，不挂代理拦截未知 API。

## 兼容保证与测试矩阵

本轮“实测”只覆盖 direct probe 的 API 行为。完整生命周期 red 已由 independent-verification 留证，本轮没有重跑共享探针。

| 场景                         | 当前可保证                                                                                       | 实施前必须证明                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| fresh 默认隐藏               | 当前 extension 明确剪裁 TOML deferred；源码证据                                                  | 真实 SDK 与 CLI 首次 declaration 无 deferred，非 deferred 不变                                                              |
| fresh 显式 tools 含 deferred | 扩展无法识别其来源，BLOCKED                                                                      | explicit 优先于 default hiding，且不追加 tools 之外的普通工具                                                               |
| 默认 resume/fork             | factory 与 extension 两条缺陷有独立证据                                                          | 真实 SDK replacement、CLI --session/--fork、TUI fork 在首请求前恢复，首请求不产生错误 removal                               |
| noTools all、tools 空        | 两版 direct registry/setter deny 实测                                                            | 搜索工具、MCP、晚注册均不使声明或 callable 意外增加                                                                         |
| noTools builtin              | builtin 初始关闭，custom probe 可用，实测                                                        | 恢复 builtin 旧声明的优先级由 core 策略确定，不由扩展猜                                                                     |
| defaultTools                 | 设置可读不代表来源可读；空 defaultTools 仍有 custom probe                                        | fresh、resume、reload 新增/删除/手动关闭行为逐一断言                                                                        |
| allowlist 与 exclude         | direct hard deny 实测；两版匹配语义不同                                                          | 1.0.4 wildcard、MCP passthrough、mcp__ matcher、exclude precedence 与 hidden exposure                                       |
| tree                         | 1.0.4 navigateTree 在恢复 context 后重跑工具恢复，`agent-session.js:3336-3346`                   | 仅目标当前 branch 生效。select 前后节点、valid empty、root、summary，旧保护集合不泄漏                                       |
| reload                       | 1.0.4 保存当前 active/pending，新 defaultTools 仅 default 来源添加，`agent-session.js:2931-2960` | fresh 尚未持久化、select 后、用户关工具、配置新增、extension closure 重建均不误放行                                         |
| compaction                   | 1.0.4 投影支持 systemMessage 快照；不是 E2E 验证                                                 | 新旧 compaction、remove 后再压缩、缺快照、invalid 快照不从旧历史补工具                                                      |
| 晚注册                       | core pending 在 `:1365-1371,2885-2886` 等待注册；首请求清空 pending 在 `:1381-1383`              | 注册发生于 session_start 前后、首请求前后、exclude 名字、reload。扩展初始 scope 不漏新合法工具，也不扩大到 inactive outside |
| malformed 与旧版             | SessionManager 不全面校验；0.84.2 无同等 loadout                                                 | invalid 拒绝；旧会话明确 absent/unsupported，不从文本或其他 branch 猜                                                       |

当前 extension 的 `directTools` 仅取 session_start active，见 `extension.ts:36-48`。factory 已丢失或晚注册工具不在这份 scope。仅填 `activatedBySearch` 无法解决 scope；无条件改为全部 getAllTools 又会破坏 inactive-at-start outside 的已有契约。必须在完整 policy 能力下证明 authorized scope，而非扩大候选集。

## 优先级与退出条件

1. P2 清理独立处理。主线程已报告 PASS，采用显式归档不删除，本设计不碰该脚本。
2. 为恢复建立上述阻塞证据与最小 upstream policy 契约。本轮完成。
3. core 策略与 API 可用后，一次完成 factory 与 repo reconciliation，保留 scope/namespace 契约，不发布半兼容状态。
4. 测真实 SDK 与 CLI 的 fresh、resume、fork，再扩充 tree、reload、compaction 与 late registration。作者诊断 green 不替代 restoration green。

无法安全 repo-only 修复的边界为显式选择来源丢失、0.84.2 缺 tool loadout 契约、授权 scope 与晚注册时序、未经验证的 MCP projection。用户当前安装仍没有本轮改动。本轮没有提交、推送或部署。

应用的原则改变了具体选择。Exhaust the Design Space 促成三个结构候选。Model the Domain 促成 evidence 与 authority 的联合类型，而非增加同步布尔。Boundary Discipline 让 malformed loadout 在投影边界拒绝。Laziness Protocol 拒绝私有 journal 和多层 pass-through。Prove It Works 要求真实 SDK 同观测与 hard-deny assertions，不能以缺字段的文档推测代替实验。Separate Before Serializing Shared State 让每次实验使用独占 tmp，不运行共享 evidence 清理。
