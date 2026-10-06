# Resume 与 fork runtime 取证

本文件只记录任务2。只写本文件与 `test/runtime-probes/resume-fork/`。不改扩展、不改 installed copy、不执行版本控制操作、不派发。

## Playbook todo

- [x] Capture the live signal on the matching surface via the control skill: a CPU profile for a spinning process, a heap snapshot for a leak, a CDP trace for a visual glitch. A real artifact, not a guess.
- [x] Reduce the artifact to the smoking gun: the function on the hot path, the retainer chain from the leaked object to a GC root, the loop firing without input. Parse large artifacts in a subagent (the **guard-the-context-window** principle skill), keep the reduced finding in the main thread.
- [x] Prove the mechanism before believing it. Inject instrumentation via CDP eval on the running process, or hotfix the live code without reloading, to confirm the hypothesis cheaply.
- [x] Map the finding back to source: file, symbol, the line that allocates or schedules.
- [x] Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only forensics`.

任务的对应信号是实际生命周期 active tools 与真实 core 生成的 system transcript。没有 CPU 或 heap 症状。第二步自行解析，用户禁止再派发。第三步只改变探针的公共 API 输入，不 hotfix installed code。

## 读取与约束

已读项目 `AGENTS.md`、`docs/agents/domain.md`、pstack 规则、poteto-mode 完整内容与已应用原则叶子。技能 tool 拒绝 user-only skill 后，按用户指定路径直接完整读取。已读 runtime-forensics、how、architect、unslop、technical-writing、show-me-your-work。已加载 pre-implement、tdd、diagnosing-bugs 与 LSP navigation。

仓库 node_modules 是 pi 0.84.2。验证必须显式 import 当前全局 installed pi 1.0.4，不能用仓库依赖替代。

已读 installed 1.0.4 的 `docs/sdk.md`、`sessions.md`、`session-format.md`、`message-types.md`、`cli-integration.md`、`environment-variables.md`、`custom-provider.md` 与 SDK examples 06、11、13、14。读取 dist 的 SDK、AgentSession、runtime、services、tool-search 及 public declarations。

## 设计选择

数据形状是观测记录列表。每条记录包含 scenario、lifecycle、active 与 persisted loadout。会话由 SessionManager 管理，不手写 JSONL。

候选A是单个 SDK 探针。用真实 SDK factory 和 AgentSessionRuntime 的 fresh/switch/fork，离线模型仅返回 toolCall 与文本。工具执行、生命周期和 transcript 持久化都用真实 core。优点是观测点完整、易比较 constructor 输入。缺点是不能证明 CLI 参数接线。

候选B是 CLI RPC 探针。隔离 agentDir、HOME、sessions、cwd，加载离线 provider 与观测扩展。用真实 CLI resume/fork。优点是覆盖 CLI。缺点是接口观测和 subprocess 协调增加成本。

选择先A，若离线 provider 通过真实 CLI 则补B。不新增生产接口，不添加兼容逻辑。用户已经明确 public seams 是真实 CLI/SDK 会话生命周期与 active/transcript，直接执行，不再要求确认。

## Red/green 含义

Red 断言 builtin 注释承诺的 resumed loadout 被保留。若失败，只修探针或增加诊断证据，不改产品。Green 断言已验证的当前行为与隔离、安全、合法 transcript 条件。恢复预期的 red 必须保留，禁止更换期望后宣称恢复修复。

## 决策记录

原样命令输出与真实 transcript 保存在 `test/runtime-probes/resume-fork/evidence/`。最初的两个探针失败分别来自 user content 规范化和复用 dispose 后的 extension runner，保留日志并明确不是产品 red。修正后才获得恢复断言的真实 red。

已跑真实 CLI json 模式，fresh、启动 `--fork`、`--session` 都通过离线 provider 完成。与 SDK runtime fork 独立取证，不把启动 fork 标成 runtime fork。CLI fresh 请求 baseline 和 select，两个模型请求由真实 core 执行并持久化合法 loadout。

SDK factory builtin resume/fork 在 session_start 前丢失 active，但 transcript 有已加载工具。首个 prompt 写入 removal。对同一合法 transcript 只省略 constructor initialActiveToolNames，真实 constructor 恢复成功。仓库扩展的对照在 bind 前恢复成功、session_start 后被剪掉。因此 core factory 与仓库 lifecycle 是两个独立原因。

fresh、runtime resume、runtime fork 都实测 select，重新 select 可加载并再持久化。未更改扩展。诊断 green 只锁定此行为，恢复 red 仍退出1。

`compact-evidence.mjs` 提取 core 生成 transcript entries 后删除自己的运行目录、jiti 与模型缓存，当前只保留可重跑脚本、精简 JSON 和文本日志。对照使用副本，不再污染原始 source transcript。

三个 mjs 的 `node --check` 与 ESLint 通过。四个源码的 Prettier 通过。最后 LSP 为 inconclusive；独立 TS 探针被根 ESLint ignore，不能声称全类型检查通过。

主线程请求的只读交叉review读取 `src/search.ts`、namespace tests 与 README。8 tests通过。README 的 own metadata outranks namespace-only 保证忽略 BM25 文档长度。反例 namespace-only x 的 score 0.29647070539538706，高于长描述 render_chart 的 0.19822169256086927。已点对点报告主线程，没有改其他 worker 文件。

## Deviations

- 用户禁止再派发。因此 how、architect 的模型角色自行顺序执行。主线程负责独立 review。
- 用户任务禁止修生产代码。诊断结果变绿不等于恢复缺陷修复。
