# 独立验收

## Verdict

ISSUES。scope 广告修复、namespace 索引与诊断链通过独立重跑。恢复功能仍失败，属于已知未修缺陷。诊断 green 不代表修复 green。

采用 Prove It Works。直接运行真实 installed SDK、AgentSessionRuntime 与 CLI，不依赖旧归档或 agent 自报。未修改生产源码、用户配置或 installed copy。未执行版本控制、提交、推送或继续派发。

## 运行与结果

独立日志与 compact transcript 保存在 `/tmp/pi-independent-verify/`。探针源码原样复制到 repo 中同层级的独占 `test/runtime-probes/independent-m4LYmd/`，确保相对 import 仍指向当前生产扩展。运行后用副本 compact 清理 owned runtime/session/cache，再把 compact JSON 复制到上述独立输出目录。删除独占源码副本，不覆盖原 evidence。

- `bun run test` 退出 0。tool-search 59 pass、152 assertions；xsettings 112 pass、411 assertions。
- `cd packages/pi-tool-search && ../../node_modules/.bin/tsc --noEmit --incremental false` 退出 0。
- 相关 eslint 与 prettier 退出 0。prettier 范围为根 README、tool-search src/test 和 resume-fork README、三个 mjs、offline-extension.ts。
- `bunx eslint . --max-warnings 0` 退出 0。
- 三个 mjs 的 `node --check` 通过。
- builtin restoration 退出 1。准确断言是 `resume must restore the loaded tool before session_start`，false !== true。此 red 符合 README。
- builtin/repo SDK diagnosis 均退出 0。
- builtin/repo CLI diagnosis 均退出 0。
- `bun run typecheck` 退出 1。tool-search build 通过，xsettings TS7016 proper-lockfile 声明缺失。全仓非全绿。

## 隔离核查

先完整读 README、probe.mjs、cli-probe.mjs、offline-extension.ts、compact-evidence.mjs，再运行。

SDK 的 HOME、TMPDIR、XDG_CACHE_HOME、agentDir、auth、settings、sessionDir 与 cwd 使用独占目录。ModelRuntime 显式 `refreshOnCreate:false`、`allowModelNetwork:false`；settings 内存创建；默认扩展/skills/templates/themes/context 禁用。仓库 configPath 显式指向临时 TOML，没有使用用户默认配置。离线 provider 返回模拟响应，无远程 HTTP；两个 probe tools 无副作用。常见凭据环境变量被过滤，但这不是完整 OS 网络沙箱或穷尽式 credential 清洗。

CLI 子进程显式 `--offline --no-mcp` 及资源禁用参数，并传递独占 env/cwd/session-dir。SDK probe 不传 `--no-mcp`，但只加载指定离线扩展，不加载用户 MCP 配置。仅仅读 installed package。

原 compact 有共享目录风险，因此没有在原目录运行它。独占副本 compact 后只剩 compact JSON，无 owned runtime/session/cache 目录。原归档不被本次命令覆盖。

## 行为证据

独立 `builtin-diagnosis.json` 与 `repo-diagnosis.json` 中 fresh session_start_post、before_agent_start 都只有 `tool_search`、`keep_tool`。select_result 无错误，fresh.after_select 的 active/persisted 都含 `probe_tool`。真实 provider_request declarations 也含加载后的工具。

SDK resume/fork 的 session_start active 不含 `probe_tool`，persisted 却仍含三个工具。首次请求后 persisted 只剩两个。core 生成 transcript 有 `toolsRemoved:[{name:"probe_tool"}]`。重新 select 后 active 与 persisted 又恢复三个。

CLI 两种 variant 各启动 fresh、--fork、--session 三个真实进程。fresh 的 select_result 来自真实 tool execution，isError=false，持久化三个工具。fork/resume session_start_post 与 before_agent_start 仅两个，最终 persisted 仅两个。

## 问题

### P1，既有 core 恢复缺陷

installed package root 为 `/Users/rolex/Library/pnpm/global/v11/105ce-18dbda8f62723330-0/node_modules/.pnpm/@earendil-works+pi-coding-agent@1.0.4_@aws-sdk+credential-provider-node@3.972.84_@smithy+signature-v4@5.7.4_ws@8.22.0/node_modules/@earendil-works/pi-coding-agent`。

准确位置为该 root 下 `dist/core/sdk.js:149`、`:302` 与 `dist/core/agent-session.js:212-213`。factory 总是生成 initialActiveToolNames 数组并传入 constructor，constructor 只在 undefined 时恢复 transcript。`:1364-1371` 为实际恢复实现。

独立 builtin 对照省略 initial 输入。constructor bind 前、bind 后、prompt 后均保留三个工具；标准 factory resume/fork 丢失。因果判断有源码与运行对照支持。`dist/extensions/tool-search/tool.js:5-8` 的跨 resume/fork 保留承诺与本次行为不符。

未验证完整修复优先级。显式 tools/noTools、defaultTools、allowlist/exclude 必须另测。恢复不是本次 scope/namespace 实现的交付，不判为它们新引入的失败。

### P1，既有仓库扩展恢复缺陷

`packages/pi-tool-search/src/extension.ts:16` 新 closure 初始化空 activatedBySearch；`:36-48` 的 session_start 无条件滤除 deferred；`:58-61` 的 before_agent_start 继续按该集合剪裁。

独立 repo constructor 对照 bind 前确实三个工具，bind 后只剩两个，prompt 后 transcript 删除 probe_tool。说明即使 core 恢复成功，扩展仍会清掉加载状态。builtin 对照 bind 前后保持三个。两种 variant 的 exposure 不同，不把它们当完全单变量实验；repo 自身 bind 前后对照支持第二个独立原因。

### P2，compact 的 owned 声明过强

`test/runtime-probes/resume-fork/compact-evidence.mjs:8-21` 读取全部 latest 指针并覆写既有 compact 归档。`:23-27` 按通用名称前缀删除目录及所有 latest 文件，没有 run-specific ownership 标识。并发 worker 也在相同 evidence 下生成相同前缀，无法保证 README 所称不删除其他 worker 文件。`:10` 只验证父目录，不验证所有权。

本次通过独占副本规避，没有生产修改。建议日后传入明确 runDir 列表或独占 evidence root，再允许删除。这里是源码静态可证的风险，没有破坏性实验。

### P2，全仓既有类型基线

`packages/pi-xsettings/src/config/pi-settings-sync.ts:7` 的 proper-lockfile import 缺声明。当前全仓 typecheck TS7016。日志为 `/tmp/pi-independent-verify/full-typecheck.log`。仅判为当前可复现的全仓基线，不在未读取历史时声称确定的引入提交。

## 边界

provider/model 输出是模拟的，工具搜索、执行、AgentSession、SDK factory、runtime replacement、SessionManager 与 CLI 子进程是真实 core。probe_tool 只被加载，不被调用；被实际调用的是 tool_search。没有真实 provider HTTP、MCP 延迟注册、TUI /fork picker、compaction、trust flows 或显式 tools/exclude 优先级证据。

scope-advertising.test.ts 的 mock extension 行为测试确认 inactive-at-start outside 不被广告/加载，weather 可 select，加载后跨两个 before_agent_start 保留。namespace-search.test.ts 确认 namespace name/description/instructions 可搜索、无关字段不匹配、排序非特权及 extension 加载链。这些是单元证据，不宣称真实 MCP E2E。

README 安装升级 smoke 明确待批准，未在用户真实配置执行。当前 src 类型测试使用仓库 pinned 0.84.2，运行取证使用 installed 1.0.4。不能把两者的通过合成所有 SDK 版本兼容承诺。
