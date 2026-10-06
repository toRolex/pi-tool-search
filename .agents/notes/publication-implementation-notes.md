# 本轮发布记录

## 授权与范围

用户授权提交、推送、创建 PR，并将两个遗留问题发 issue。只发布本会话 scope 广告过滤、namespace BM25 索引、README v3 契约、新测试、resume/fork 取证探针与 compact 安全修复，以及相关 notes 和证据。不是增加恢复功能。不 merge、deploy、force-push，不改 installed copy 或用户配置。`/tmp` HTML demo 不入仓库。

唯一新增 notes 为本文件。已有两轮独立验收，本轮不再派发布者或 reviewer。已读 poteto-mode 全文、opening-a-pr、jj workflow/create、pr、GitHub rate limits、issue-tracker、triage-labels、Prove It Works、technical-writing、unslop 与 no-comments。user-only skill 工具拒绝后完整读取对应文件，不改技能。

## Opening a PR 检查点

1. Worktree。沿用用户明确指定的现有 cwd 和 jj change，保留已验收成果。没有 reset、patch out 或另建 worktree。首次 snapshot 前检查 secret 文件与 ignore，未发现候选敏感文件或已跟踪 secret。
2. Commits。发布一个已验收逻辑集合，不重建历史 red，不强行拆 stack。
3. PRs。实际读 production、tests、probe 源码、README diff、历史报告和证据。已有独立 comment review 保留一条解释 0.84.2 缺 ToolNamespace 的 why 注释。本轮未新增代码注释或 suppression。删除 README 重复的 BM25 句子。
4. Titles 与 descriptions。采用 Conventional Commit 标题。项目 pr 模板优先于 opening-a-pr 的通用章节，正文用 Summary、Evidence、Merge Danger。
5. Forge。用户明确指定 gh，所有发布写操作前再次无参数 gh repo view，所有 issue/PR 命令显式 --repo toRolex/pi-tool-search。
6. Size 与 readiness。一个非 draft PR，base 为 main。未启动 babysit，不自动合并。

throughput checkpoint 为单 owner 串行执行安全门、范围与证据审查、真实测试、issue 去重、创建 issue、描述 change、推送、创建并核验 PR。每段以实际检查收尾。

## 仓库与身份

cwd 为 `/Users/rolex/Documents/Codes/githubProject/MyProject/pi-tool-search`。无参数 gh repo view 确认 toRolex/pi-tool-search。git remote -v 只读确认 origin 的 fetch/push 都指向该仓库，没有 upstream remote。依然全程显式指定本仓库。

已有 colocated jj，Git 与 jj 有效身份均为 rolex / torolex@163.com。待发布 change 为 ksmuknwv，父提交与 fetch 后的 main@origin 都为 `06fd6449a86dc28f7d2978ef61df709e4c0a00e9`。远端未变化，无需 rebase。版本控制写入仅由 jj 执行。

初始清单 36 文件，全部属于授权范围。测试后清单未增加其他窗口修改或构建产物。本文件加入后应为 37 文件。发布前再次核对清单；若出现其他路径则停止混入。

## 敏感信息与归档

模式检查未发现真实 API key、GitHub token、AWS key 或 private key。离线 provider 的 apiKey 是 `offline-placeholder-not-a-secret`。完整遍历五份 JSON 的字符串与 messages，文本只有模拟 probe prompt、离线响应、工具元数据和加载结果，没有用户真实 transcript。

归档及 notes 包含 `/Users/rolex`、公开仓库位置、pnpm installed package 路径、隔离 probe 目录和临时实验位置。用户名与公开 GitHub 身份一致；路径不含凭据或其他项目会话。评估可分享，保留原路径以维持证据来源。旧 run 路径只作取证定位，不作可重跑 fixture。两个 probe 可用 PI_PROBE_PACKAGE_DIR 指定读者安装位置。

五份 JSON 原始缩进未满足仓库 Prettier。仅格式化这五份，逐份 JSON.parse 后 deepEqual 与格式化前对象完全一致。没有重跑共享 evidence producer 或旧清理器，不新增运行证据。历史 notes 中清理和 ranking 描述是当时记录，以后续 cleanup-safety 验收、最终 README 和本文件为当前状态。

## 本轮实际验证

日志仅保存在 `/tmp/pi-publication-checks/`，不提交临时日志或 demo。

- `bun run test` 退出 0。tool-search 59 pass、0 fail、152 assertions；xsettings 112 pass、0 fail、411 assertions。
- `node test/runtime-probes/resume-fork/compact-evidence.test.mjs` 退出 0，8 passed、0 failed。测试复制实际脚本到独占临时目录，不操作原 evidence。
- `./node_modules/.bin/tsc --noEmit --incremental false -p packages/pi-tool-search/tsconfig.json` 退出 0。
- `bun run typecheck` 退出 1。tool-search build 通过，xsettings 报 `src/config/pi-settings-sync.ts(7,32): error TS7016: Could not find a declaration file for module 'proper-lockfile'`。未修类型依赖或添加 shim。
- ESLint 限定 extension.ts、search.ts、两个新增 TS 测试和四个 mjs，`--max-warnings 0`，退出 0。offline-extension.ts 不在根 ESLint TS 配置范围，不称该独立 TS probe 类型检查全绿。
- 四个 mjs 的 node --check 均退出 0。
- 限定 Prettier 首轮发现五份 evidence JSON 格式问题。格式化后复跑相关源码、README、证据及全部本轮 notes，包括本文件。

不重新跑已两轮独立验收的真实 SDK/CLI 调查，不把历史 diagnosis green 当成本轮 restoration green。恢复仍 BLOCKED，真实外部 provider、MCP、交互 TUI、compaction 恢复与显式选择优先级没有完整 E2E 保证。

## 遗留 issue

预检 core remaining 5000、GraphQL remaining 4999。用 REST 小页查询 open PR 15 条、open issue 30 条和 labels 30 条，没有开放 PR 或 issue。labels 中没有 needs-triage，按授权不创建 label，不改用其他 triage 角色。

- https://github.com/toRolex/pi-tool-search/issues/10 记录 Pi resume/fork loaded 状态丢失，core factory 与 repo 裁剪两个原因、公开选择来源缺失的 BLOCKED 和 0.84.2/1.0.4 边界。
- https://github.com/toRolex/pi-tool-search/issues/11 记录 proper-lockfile TS7016，全仓已有失败，不声称本轮引入。

PR 只 Related 链接两项，不使用 Closes。当前未部署。

## 原则与偏离

Prove It Works 改变验收方式，实跑测试与真实 diff，核对 JSON 对象、remote base 和最终 PR 元数据，不使用代理自报替代检查。technical-writing 与 unslop 改变发布文字，直接列出作用、证据、风险与未修问题。未做额外 design/interrogate fan-out，因为用户明确已有两轮独立验收且本轮仅发布，不新增设计或实现恢复方案。

后续最终 PR URL、head、commit 和 jj 状态由发布者直接核验并交主线程，不为写回链接在推送后额外重写提交。
