# P2 清理安全修复：独立验证

## 结论

**PASS**。指定范围未发现置信度 ≥80 的功能或规范问题。无 ISSUES，无 BLOCKED。

完整读取：

- `test/runtime-probes/resume-fork/compact-evidence.mjs`：43 行。
- `test/runtime-probes/resume-fork/compact-evidence.test.mjs`：131 行。
- `test/runtime-probes/resume-fork/README.md`：仅评价本轮显式归档语义。
- `.agents/notes/cleanup-safety-implementation-notes.md`。

未重复 Comment Sicko 的 no-comments 审查。未派子代理。唯一仓库写入是本报告。未运行仓库 evidence 上的 compact；未修改已有证据、生产代码、用户配置或 installed copy；未提交、推送或初始化版本控制。

## 源码审查

| 检查点         | 结论与位置                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 显式输入       | compact 第9–14行要求参数数量正确且 flag 为 `--run-dir`。无参先失败，不扫描或操作证据。                                                    |
| 目录边界       | 第15–22行通过真实父路径约束 direct child，并拒绝 run 本身的静态 symlink。兼容 macOS `/var`、`/private/var` 路径别名。                     |
| 输入类型       | 第23–29行检查 result 普通文件与 sessions 普通目录；第36–39行逐一验证并解析 transcript。                                                   |
| 不删除共享数据 | 归档器没有删除调用；只读显式 run。latest、其他 worker、其他 variant 与相同 variant 的旧 run 均不参与发现或删除。                          |
| 独立归档       | 第40行以完整 run basename 命名，避免按 variant 合并不同轮次。                                                                             |
| 拒绝覆盖       | 第41行 `flag: "wx"`；所有读取及 JSON 解析先于新归档创建。已有文件或目标 symlink 不能被覆盖。                                              |
| 文档一致       | README 明示已结束 run、原文件/latest 保留、已有归档失败，以及活跃输入不保证一致快照。notes 明示非 GC、静态 symlink 限制和非事务写入边界。 |

没有把显式参数视为完成或 ownership 证明；实现与文档均不承诺这种能力。

## 实际执行：项目隔离回归

环境：Node `v22.23.2`，ESLint `v10.12.0`，Prettier `3.9.9`。

命令：

```sh
node test/runtime-probes/resume-fork/compact-evidence.test.mjs
```

退出码 **0**。原样输出：

```text
PASS no arguments preserve unarchived, active and other-worker directories
PASS explicit run archives real entries without removing sources or latest
PASS existing archive is never overwritten
PASS two same-variant runs get separate archives
PASS incomplete run fails without removing partial evidence
PASS run directory symlink is rejected
PASS session symlink is rejected without archiving external content
PASS concurrent archive writers have exactly one winner
8 passed; 0 failed
```

完整读过测试，确认其先复制实际 compact 到 `mkdtemp` 私有 root，再启动副本。只有 finally 删除本测试创建的 root；不会运行原路径 compact。

## 实际执行：独立补充回归

通过 `node --input-type=module` 的 stdin harness 执行，未新增仓库测试文件。每例复制实际 compact 到系统临时目录；全部调用副本。用递归树快照对比目录、文件字节和 symlink 目标，不只检查某个 sentinel。成功用例要求新增路径只能是预期 archive；失败用例要求整个 fixture 不变。结束仅删除各例私有 root。

**18 个独立场景，18 PASS，0 FAIL；命令退出码 0。**

| 场景                             | 实际结果                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no args                          | 退出1，stderr 含 Usage，整个树不变。                                                                                                                            |
| 显式归档成功                     | 退出0；活跃、未归档、其他 worker、嵌套 runtime/cache、latest 文件和 latest symlink 保留。只新增目标 archive。                                                   |
| transcript 聚合                  | 两个 session 按文件名排序；`source-before-resume.jsonl` 与 `constructor-control.jsonl` 的 entries 精确保留。                                                    |
| 同 variant 两轮                  | ROUND1/ROUND2 分别保留 first/second result 与不同 entries；重归档第一轮退出1，已有 archive 字节不变。                                                           |
| run symlink                      | 指向已有合法 run 的 link 仍拒绝；树不变。                                                                                                                       |
| result symlink                   | 指向外部 JSON，拒绝；树不变。                                                                                                                                   |
| sessions symlink                 | 指向外部目录，拒绝；树不变。                                                                                                                                    |
| session-file symlink             | 指向外部 transcript，拒绝；树不变。                                                                                                                             |
| 两类 optional transcript symlink | 分别测试 source-before-resume、constructor-control 指向外部文件，均拒绝；树不变。                                                                               |
| archive symlink                  | 目标指向外部已有文件，退出1；link 与外部内容不变。                                                                                                              |
| dangling archive symlink         | 退出1；未创建外部目标，树不变。                                                                                                                                 |
| 缺 result / 损坏 session         | 两例均退出1；没有 archive，部分原始证据保留。                                                                                                                   |
| evidence 外目录 / 嵌套 run       | 两例均退出1；整个树不变。                                                                                                                                       |
| 错 flag / 多余参数               | 两例均退出1；整个树不变。                                                                                                                                       |
| 重复并发竞争                     | 10轮，每轮4进程同时归档同一 run。每轮退出码排序均为 `[0,1,1,1]`；总计10成功、30拒绝，10个 archive 均可解析且内容属于各自轮次；每轮除新增 archive 外整个树不变。 |

此补充回归使用构造的 JSONL 数据，验证的是真实 CLI 与文件系统行为，不是新的 SDK/CLI provider 调查。

## 实际执行：静态检查

以下命令均退出 **0**：

```sh
node --check test/runtime-probes/resume-fork/compact-evidence.mjs
node --check test/runtime-probes/resume-fork/compact-evidence.test.mjs
./node_modules/.bin/eslint test/runtime-probes/resume-fork/compact-evidence.mjs test/runtime-probes/resume-fork/compact-evidence.test.mjs --max-warnings 0
./node_modules/.bin/prettier --check test/runtime-probes/resume-fork/compact-evidence.mjs test/runtime-probes/resume-fork/compact-evidence.test.mjs test/runtime-probes/resume-fork/README.md .agents/notes/cleanup-safety-implementation-notes.md
```

ESLint 无输出、无 warning。Prettier：`All matched files use Prettier code style!`。

额外主动 LSP 检查两份 mjs，`source=lsp`、`waitMs=2000`：`clean=2`、`diagnostics=0`，unsupported/unavailable/failed/inconclusive 均为0。仅此两文件，不宣称全仓类型检查通过。

## 被审文件身份

补充回归执行前后 SHA256 一致，确认验证期间四份被审文件未发生变化：

```text
4d6fd8c49080cf7900b48c720f4207a8350f3bb0d439ec78599e50c33b968dab  compact-evidence.mjs
3be4d39817cf16461b502e813cc49e22eed2da8841184f46047cf26d1419a48e  compact-evidence.test.mjs
222e978f38b7a89f778463970b6413b227eda8755d9c117cff8f6a5dff5e9739  README.md
aadb69a008b1cd9324b644201b2de43695a3a72e0343a44bd435df20583c04e5  cleanup-safety-implementation-notes.md
```

## 未验证边界

- 未运行旧危险脚本；notes 的历史 red 与历史全仓 `bun run test` 结果不是本次独立验证结果。
- 未运行真实 evidence 归档或 SDK/CLI 探针；不证明 provider、MCP、resume/fork 缺陷已修复。
- 未重跑全仓 lint/format/test/typecheck；仅指定范围静态检查和隔离回归。
- 未验证活跃 producer 的跨文件一致快照、owner/finished 协议或自动 GC。显式输入不提供这些能力。
- 测试静态 symlink，未模拟恶意进程在 lstat/read 之间换路径的 TOCTOU 攻击、根 evidence 被替换或远程文件系统差异。
- 未注入磁盘满、权限故障、进程崩溃或写入中断。`wx` 不等于原子完整发布；新 archive 可残留部分内容，但实现不删除源证据。该边界已被 notes 明示。
- optional transcript 的悬空输入 symlink 未专门测试；存在性检查可把它当缺失跳过，不宣称所有 symlink 都必定拒绝。

这些边界不阻断本轮“显式归档、无删除、拒绝覆盖”的 P2 验收。
