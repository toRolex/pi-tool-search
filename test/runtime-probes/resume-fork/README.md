# pi 1.0.4 会话工具恢复取证

本探针验证当前 installed pi 1.0.4。只模拟模型响应。AgentSession、SDK factory、AgentSessionRuntime、工具执行、extension lifecycle 与 SessionManager 持久化都是真实 core。CLI 探针启动实际 `dist/bundle/cli.js` 子进程。没有真实 provider HTTP、MCP 或生图，因此不称为外部服务 E2E。

## 重跑

若安装位置不同，先设置 `PI_PROBE_PACKAGE_DIR`，指向 installed `@earendil-works/pi-coding-agent` 的 package root。版本不是 1.0.4 时探针拒绝运行。Node 需要支持 installed pi，当前实测为 v22.23.2。

```sh
node test/runtime-probes/resume-fork/probe.mjs builtin restoration
node test/runtime-probes/resume-fork/probe.mjs builtin diagnosis
node test/runtime-probes/resume-fork/probe.mjs repo diagnosis
node test/runtime-probes/resume-fork/cli-probe.mjs builtin
node test/runtime-probes/resume-fork/cli-probe.mjs repo
node test/runtime-probes/resume-fork/compact-evidence.mjs --run-dir <本轮已结束的绝对运行目录>
node test/runtime-probes/resume-fork/compact-evidence.test.mjs
```

第一条预期退出1。它保留“恢复应成功”的 red，不把当前缺陷改写为成功。后续 diagnosis 命令预期退出0，只证明已观察到的机制。`compact-evidence.mjs` 只归档显式 `--run-dir` 指定的运行目录。归档名使用该目录的完整 basename，已有归档会导致命令失败，不会覆盖。脚本不扫描 latest 指针，不删除运行目录、缓存或 latest 文件。归档后原始文件仍保留。只传入本轮已结束的运行目录，活跃运行的文件不保证形成一致快照。

每轮的 cwd、HOME、TMPDIR、agentDir、settings、auth 路径和 sessionDir 都在本目录 evidence 的独立临时目录。禁用自动网络刷新、telemetry、默认资源、MCP。仅注册离线 provider 和两个无副作用工具。provider 密钥是无效的离线占位字符串。探针过滤继承的常见凭据环境变量，不读取真实 settings 或其他项目 transcript。

## 已测结论

真实 SDK fresh 的 `session_start_post` 与 `before_agent_start` 都只有 `tool_search` 和 `keep_tool`。请求 `select:probe_tool` 后，active 与持久化 loadout 都增加 `probe_tool`。resume 与 fork 的 `session_start_post` 又只有前两个，但首次请求前的 persisted transcript 仍有三个。首个请求产生 `toolsRemoved` 并从 transcript loadout 删除 `probe_tool`。在两个新会话重新 select 都能加载并再次持久化。

builtin 真实 SDK factory 路径的恢复失败，不是仓库扩展造成。真实 constructor 对同一份 core 生成的 transcript 省略 `initialActiveToolNames` 后，三个工具在 bind 前后和请求后都保留。对照只改变 constructor 输入，没有调用私有恢复方法或替换 core 实现。

仓库扩展还有第二个独立原因。相同 constructor 对照在 bind 前恢复三个工具，仓库 `session_start` 把 `probe_tool` 剪掉。`before_agent_start` 不会重新恢复。工具是正常 direct 注册后由仓库配置延期，与 builtin deferred exposure 的注册方式不同。此差别是两种实际设计，不假装是同一个实验变量。

真实 CLI fresh 的两个 prompt 产生 select toolCall、真实 toolResult 和 system delta。`--fork` 与 `--session` 两个独立 CLI 进程都失去 loaded tool。CLI fork 是启动时复制，SDK fork 是真实 runtime replacement，二者分别取证。CLI 的 session_start reason 由 CLI 自己产生，不伪造为 runtime fork reason。

## 来源与历史最小建议

下列旧修法建议已被后续 [restoration-repair-design](../../../.agents/notes/restoration-repair-design.md#结论) 取代，不是已批准修法。当前完整自动恢复为 **BLOCKED**：需要 core 提供工具选择来源与有效恢复策略，不实施 preserve-only 子修。跟踪入口：[issue #10](https://github.com/toRolex/pi-tool-search/issues/10)。本探针的 diagnosis green 只确认机制，不表示恢复已修复。

`evidence/source-locations.log` 保存实读 installed source 的行号与片段。

- installed `dist/core/sdk.js` 第149行总是计算数组，第302行传入 `initialActiveToolNames`。
- installed `dist/core/agent-session.js` 第212至213行只在该值为 undefined 时恢复 transcript。第1364行是实际恢复实现。
- installed `dist/extensions/tool-search/tool.js` 第4至8行承诺 loaded tools 能跨 resume/fork 保留。
- 仓库 `packages/pi-tool-search/src/extension.ts` 的 `session_start` 无条件按 deferred 配置过滤 active，新的 closure 没有上一会话的 `activatedBySearch`。

建议 core factory 在已有合法 loadout 的恢复场景，不把默认 fresh tool selection 当成显式 override。只有明确 tools/noTools 约束才覆盖，恢复路径必须继续遵守 allowlist/exclude。需要上游先决定显式 defaultTools 对恢复的优先级。本任务只证明省略 initial 的机制，未实现或验证完整优先级修复。

仓库侧最小建议是从 active branch 的持久化 loadout 重建已加载集合，session_start 不再剪掉这些名字。只读当前 active 不够，因为 core 当前先丢失 builtin deferred tools，且 direct tools 默认注册会激活。应使用真实恢复分支作为证据，不从全文件或其他 branch 猜测。未改 `extension.ts`，未加兼容逻辑。

## 证据索引

- `evidence/red.log` 是当前代码下的原样失败输出，末行含退出码1。
- `evidence/green-builtin.log` 与 `green-repo.log` 是真实 SDK 诊断输出，末行含退出码0。
- `evidence/green-cli-builtin.log` 与 `green-cli-repo.log` 是真实 CLI 诊断输出。
- `evidence/builtin-restoration.json`、`builtin-diagnosis.json`、`repo-diagnosis.json` 保存 lifecycle、active、request declarations 和 core 生成的 transcript。
- `evidence/cli-builtin.json` 与 `cli-repo.json` 保存真实 CLI argv、退出码、lifecycle、loadout 与 transcript。
- 两个 `harness-*-failure.log` 是探针自身失败，不能当产品 red。第一次忘记 user content 会被 core 规范化为文本块。第二次错误复用 dispose 后的 extension runner。都已修正并重新跑真实路径。

既有 compact JSON 中旧 sessionFile 与 cwd 是取证时原路径，当时的临时目录已清理。原始 entries 保留在 JSON，不用旧路径作为 fixture。新脚本归档后保留运行目录，重跑会生成新合法 session。

## 验证边界

`node --check` 检查三个 mjs。`eslint` 检查三个 mjs 通过。`prettier --check` 对四个源码通过。LSP 最后四个文件为 inconclusive，不宣称类型检查全绿。根 ESLint 未配置独立 TS 探针，ignored warning 已记录。探针跨 installed 动态 import，使用局部 any 来接住真实公共运行时，不作为生产类型设计。

诊断 green 不是修复 green。没有验证真实远程 provider、真实 MCP 延迟注册、compaction、交互 TUI `/fork` picker、显式 `--tools`/`--exclude-tools` 优先级或重启 trust flows。
