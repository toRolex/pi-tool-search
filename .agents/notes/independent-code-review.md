# 独立 code review

## 结论

**ISSUES**。发现 1 个 P2，置信度 99/100。问题在诊断 probe 的证据清理，不在此次生产修复。

此次 scope 广告与 namespace 索引未发现高置信正确性问题。未将既存 resume 缺陷列为此次回归。没有 P1。没有另需处理的高置信 P3。

## 范围与方法

先完整读取 `/Users/rolex/.pi/agent/skills/poteto-mode/SKILL.md`，再完整读取 no-comments 的 SKILL.md 与 `references/comment-sicko.md`。用户禁止继续派发，故自行进行独立注释检查，不调用子 agent，不删除注释。

审查范围如下。

- `packages/pi-tool-search/src/extension.ts:66-67` 的 scopeNames 与 pending 过滤。
- `packages/pi-tool-search/src/search.ts` 的 namespace 类型与索引。
- `packages/pi-tool-search/test/scope-advertising.test.ts` 与 `namespace-search.test.ts`。
- `packages/pi-tool-search/README.md` 的 namespace、select 与 v3 契约。
- `test/runtime-probes/resume-fork/probe.mjs`、`cli-probe.mjs`、`compact-evidence.mjs`、`offline-extension.ts` 与 README。

为核对接口与结果，只读关联 definition、result、select、config、index 和现有包内测试。读取三份实现 notes 只用于确定边界，不将 agent 自报当验证结果。未发现适用 CLAUDE.md。依据已提供的 AGENTS.md、任务要求及实际源码审查。

未使用 Git 或 jj 读取 diff、状态、历史。未执行提交、推送或修改 installed copy、用户配置、生产文件。未读取其他项目 transcript。实际解析的 transcript 仅为本范围 evidence JSON 内嵌的离线 probe entries。唯一新增报告是本文件。

throughput checkpoint: n/a, read-only investigation。

## P2

### 清理扫描会删除未归档或仍在运行的其他 probe 目录

置信度 99/100。

位置为 `test/runtime-probes/resume-fork/compact-evidence.mjs:23-27`，具体删除发生在第 24-25 行。与 `test/runtime-probes/resume-fork/README.md:18` 的“不删除其他 worker 的文件”承诺冲突。

第一轮只按 `latest-*.json` 指针归档。第二轮却重新枚举整个 evidence，递归删除所有目录名匹配 `^(builtin|repo|cli)-(restoration|diagnosis|builtin|repo)-` 的目录。删除名单不来自已成功归档的 runDir，也没有运行状态或 ownership 校验。

这些前缀正是所有运行共享的前缀。SDK 在 `probe.mjs:20` 建目录，直到第 189 行才写 latest 指针。CLI 在 `cli-probe.mjs:19` 建目录，直到末尾才写 latest 指针。因此正在运行的另一个 worker 已有匹配目录，但没有 latest 指针。清理脚本仍会删除它。顺序重跑相同 variant 也会覆盖 latest 指针，旧轮次没有被归档便被统一删除。

独立复现使用 Node VM 执行实际脚本主体，仅替换文件系统函数为内存模拟，不写盘、不实际删除。模拟 evidence 没有任何 latest 指针，只有以下目录。

```text
builtin-diagnosis-ACTIVE
repo-diagnosis-OLDER
cli-repo-WORKER
unrelated
```

实际主体仍调用以下删除，并输出 PASS。

```text
rmSync(evidence/builtin-diagnosis-ACTIVE, { recursive: true })
rmSync(evidence/repo-diagnosis-OLDER, { recursive: true })
rmSync(evidence/cli-repo-WORKER, { recursive: true })
PASS compacted actual core-generated transcripts into JSON; removed only owned runtime/cache directories
```

影响是未归档 transcript、事件与失败现场永久丢失。并行 probe 可在后续写入时失败。这不是既存 resume 恢复缺陷，是本次新增清理脚本的隔离问题。

建议删除全目录前缀扫描。先建立本次成功归档的精确 runDir 清单，仅在归档写入成功且运行已结束后删除清单内目录。未被 manifest 引用的旧目录与其他活跃目录保留。增加无 latest、并行活跃 runDir、同 variant 两次运行的隔离回归测试。README 在实现满足承诺前不应宣称不会删其他 worker 文件。

## 注释检查

此次生产新增注释只有 `packages/pi-tool-search/src/search.ts:8`。它解释为何不从依赖导入 ToolNamespace，属于当前不可改变的外部依赖约束，符合 no-comments 保留例外。

直接核对根与包 package.json，devDependency 均钉在 pi 0.84.2。该版本 `dist/core/extensions/types.d.ts` 无 ToolNamespace。installed pi 1.0.4 则有该类型。注释不是重复字段形状，也不是 workaround 正确性抑制。

scope 两行未新增注释。两个新增测试与四个 probe 源码没有阶段旁白、注释掉的代码、lint 或 TypeScript 正确性抑制。未把 extension.ts 既有注释当本次新增问题。删除 0，恢复 0，重跑注释 agent 0，MUST KILL 0。用户禁止修改，未提供或执行架构改写。

## 生产正确性与测试

### ToolNamespace 与数据路径

直接读取 installed package，不采用 notes 内的类型描述作为结论。当前安装解析后的 package root 如下。

```text
/Users/rolex/Library/pnpm/global/v11/105ce-18dbda8f62723330-0/node_modules/.pnpm/@earendil-works+pi-coding-agent@1.0.4_@aws-sdk+credential-provider-node@3.972.84_@smithy+signature-v4@5.7.4_ws@8.22.0/node_modules/@earendil-works/pi-coding-agent
```

其 package.json 的 version 为 1.0.4。`dist/core/extensions/types.d.ts:404-414` 的 ToolNamespace 为 name 必填，description 与 instructions 可选，均为 string。`ToolInfo` 在第 1542-1547 行含 `namespace?: ToolNamespace`。仓库本地类型逐字段一致，不是 string namespace 的猜测性兼容。

installed `dist/core/agent-session.js:1074-1084` 的 getAllTools 原样返回 definition.namespace。仓库 extension 的 directTools 保存 getAllTools 条目，未丢 namespace。搜索字段 `search.ts:75-76` 将 name、description、instructions 加入同一 token 流，缺失的可选字段用空串处理。

### Scope boundary

`extension.ts:39-41` 的 assigned scope 是 session_start 时注册且 active 的其他工具。第 66-67 行广告使用该 scope 与已注册 deferred 名称的交集，再排除 loaded。与 definition 的 select 检查保持同一边界，没有扩大加载权限。

新增 scope 测试实际调用 createToolSearchExtension，读取临时 TOML，执行 hooks 与工具 execute。它逐字验证 outside 被拒绝、weather 被广告和加载、无关 section 保留、加载后两轮不再广告。missing 不在 registry，read 非 deferred。检查不是仅测内部 helper。

### BM25 与非法 select

namespace 未新增字段权重。K1 为 1.2，B 为 0.75，仍共用词频与文档长度。两条 ranking 测试的因果描述与源码一致。独立内存检验把 query chart 放在 description 或 namespace，保持词频和长度相等，两者 score 均为 `0.1823215567939546`，按工具名 alpha、bravo 排序。

独立调用 executeToolSearch 验证 `select:weather,outside`、`select:weather,missing`、`select:weather,keep` 与空 select。全部为 invalid_select，activation.added 为空，setActive 调用次数为 0。outside 不在 scope，missing 未注册，keep 在 scope 但非 deferred。没有部分激活。

### 实际执行结果

本次实际执行以下命令，不引用前 agent 的 pass 数作为验收证据。

```sh
bun test packages/pi-tool-search/test/scope-advertising.test.ts packages/pi-tool-search/test/namespace-search.test.ts
bun test packages/pi-tool-search/test
./node_modules/.bin/tsc --noEmit --incremental false -p packages/pi-tool-search/tsconfig.json
./node_modules/.bin/eslint packages/pi-tool-search/src/{extension,search}.ts packages/pi-tool-search/test/{scope-advertising,namespace-search}.test.ts test/runtime-probes/resume-fork/{probe,cli-probe,compact-evidence}.mjs --max-warnings 0
node --check test/runtime-probes/resume-fork/probe.mjs
node --check test/runtime-probes/resume-fork/cli-probe.mjs
node --check test/runtime-probes/resume-fork/compact-evidence.mjs
```

新增测试 9 pass、0 fail、21 expect。包内全量 59 pass、0 fail、152 expect。noEmit 且关闭 incremental 的 typecheck 退出 0。上述 scoped ESLint 退出 0。三个 mjs 语法检查退出 0。测试按其已有机制创建临时 fixture，未编辑任何测试或生产源码。未把 offline-extension.ts 的 any 当生产类型设计，也未宣称该独立 TS probe 类型检查通过。

## README 核对

`packages/pi-tool-search/README.md:102-107` 的 select 处理与 parseSelectQuery、definition 一致。第 138-155 行 v3 类型与 result.ts 一致，包括 readonly select 数组与 invalid_select。第 158-167 行 counts、已满足请求的 loaded、混合非法请求的 all-or-nothing、select rankedMatches 仅含实际 activated 名称均正确。

第 190-193 行 ToolNamespace 和 getAllTools 的声明由上述 installed 类型与实现支持。namespace 无独立权重的表述正确。

第 84-89 行 BM25 描述重复一遍，是非阻断编辑冗余，不列为高置信功能问题。README 的旧上游包身份、picker 和 Layout 表属于未改的基线，本次不报。

## Probe 真实性、隔离与证据边界

probe.mjs 使用 installed 的 createAgentSessionServices、createAgentSessionFromServices、AgentSessionRuntime 与 SessionManager。CLI 脚本第 60 行指定真实 dist/bundle/cli.js，第 84 行 spawnSync 启动子进程。offline-extension 仅模拟 provider stream，tool_search 工具执行、active 更新和 transcript 写入走实际 core，没有直接伪造恢复结果或手写期望 transcript。

读取并重新解析五份 compact JSON。用当前 installed 的 buildSessionContext 和 pi-ai getCurrentTools 重建其内嵌 entries，而不是仅检查 observations、日志里的 PASS 或 agent 总结。

- 五份 source-before-resume 都重建出 keep_tool、probe_tool、tool_search。
- entries 包含真实 tool_search 的 `select:probe_tool` toolCall 与非错误 toolResult。
- SDK resumed 和 forked transcript 包含 probe_tool 的 toolsRemoved，重新 select 后最终 loadout 恢复三个工具。
- builtin constructor-control 最终保留三个工具。repo constructor-control 包含 removal，最终只有 keep_tool 与 tool_search。
- 两份 CLI JSON 的 fork、resume transcript 重建结果均只有 keep_tool 与 tool_search，与 recorded persisted 一致。CLI argv 指向真实 bundle，三个 exitCode 都为 0。
- 检查所有内嵌 entry parentId 均能在对应 entries 中找到，未发现断链。

直接读取当前 installed `dist/core/sdk.js:149,302` 与 `agent-session.js:208-213,1364-1371`，确认 factory 传入数组，而 constructor 仅在 initialActiveToolNames 为 undefined 时恢复 transcript。README 对当前恢复机制的描述有源码与内嵌 transcript 支持。此缺陷未修，本次不作为修复回归。

SDK 控制组自行构造 Agent 与 AgentSession，不是只对 factory 原样输入删除单字段的严格单变量实验。源码中的条件明确支持 initialActiveToolNames 机制，但结果不证明恢复优先级修复已经验证。README 第 41 行和第 60 行已明确建议与未验证边界，本次不报成产品错误。

单轮 SDK 在 import installed 之前重设 HOME、TMPDIR、agentDir、auth、model-store 和 sessions，并禁用模型网络与刷新。CLI 给子进程独立 env、cwd 和 sessionDir，传入 offline 与禁用默认资源、MCP 的参数。离线 provider 直接生成 stream，两个工具 execute 无外部副作用。凭据过滤仅承诺常见环境变量，不宣称穷尽所有 secret 名称。除已报告的 compact 目录删除问题，未发现本范围内读取真实用户 settings 或其他项目 transcript 的证据。

本次未重新运行会向 evidence 写入、归档或删除文件的完整 CLI 与 SDK probe。用户只允许写本报告。真实 CLI 执行的证明强度因此是代码路径、已有原始 argv 与 transcript 的独立一致性检查，不是本次新增 live CLI 运行。没有把既有日志的退出码当本次命令执行结果。未验证真实远程 provider、MCP、TUI、compaction 或 allowlist 优先级。

## 原则与约束落实

已完整读 Prove It Works 叶子。该原则改变验证方式，使用实际包测试、installed 类型与源码、由 core 重新计算 transcript loadout，以及执行实际清理脚本主体的内存复现，不接受前 agent 自报。

已完整读 unslop 与 technical-writing。报告给出路径、行号、实测结果和验证边界，不将诊断 green 写成修复 green。

用户禁止派发、代码修改和版本控制，覆盖技能内的派发与应用修复步骤。建议仅在本报告提出，没有执行。
