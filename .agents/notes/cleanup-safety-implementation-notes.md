# 清理脚本安全修复记录

## 接续与范围

接续 `/var/folders/d9/_0gbv97x6332wsrqhr4fcyj80000gn/T/handoff-tool-search-verified-issues.md` 的新增 P2。先读 independent-code-review.md、independent-verification.md、probe README、实际 compact 脚本及 producer 发布 result/latest 的代码。沿用独立报告的根因，不重跑真实 SDK/CLI 恢复调查。恢复缺陷不在本次交付。

独占修改 compact-evidence.mjs、新隔离 compact-evidence.test.mjs、此 notes。未操作原 evidence、用户配置、installed copy 或版本控制。README 的命令同步交主线程处理。

## 检查点

Session pickup 已重建 pending P2。Bug fix 先执行实际脚本副本得到 red，再选设计、最小修复、同一 CLI 隔离 green。提交、推送、PR 与版本控制重建步骤按用户禁止跳过。throughput checkpoint 为隔离 red，候选设计只读并行，作者 green 后交主线程独立复核。

## 根因与数据 shape

旧脚本的归档输入来自 latest 指针，但删除输入是重新枚举的全部公共前缀目录。前缀不是所有权。旧归档按 variant 命名并无条件覆盖，latest 删除也没有 ownership 校验。

实际数据是 `{ runDir }` 指针、一个 runDir 的 result 对象，以及 `transcripts: [{ path, entries }]` 归档。producer 在退出之前发布 result/latest，没有可靠完成或所有权标记。不能把 latest 或 result 的存在当清理授权。调用者应等待自己启动的 probe 结束再归档。

## Architect 候选与选择

候选 A 是显式 `--run-dir <runDir>`。调用者从自己的 probe 输出取得路径。归档只读取该目录，不扫描 latest。目标是 `evidence/<runDir basename>.json`，独占创建且永不删除源文件。这个单命令隐藏 transcript 聚合与目录边界检查，不引入额外公开函数。

候选 B 是保留无参 latest 批量发现。先快照指针，每个 run 独立归档并保留所有 sources/latest。它能避免删除，但仍自动消费其他 worker 指针，覆盖同 variant 的 latest 会漏掉旧 run。若加显式完成/ownership manifest 再清理，又要求改 producer。当前授权不允许此改动。没有可靠完成标记时，无法证明精确 run 清单就能安全删除。

按显式选择、不可覆盖、零共享删除、接口规模四项选择 A。从候选 B 保留零删除与 run-specific 归档，不保留自动发现。接受每个 run 需单独命令且占用磁盘不自动下降，以换取现有证据保留。

两名 k3 architect runner 曾并行派出，均额度失败。临时 glm 候选 A 完成。候选 B 的 deepseek/glm 重试均因 herdr `unknown option: --panes` 未启动。因此完整双代理候选探索未完成，B 为本地独立结构草案。没有把失败代理当验收。A 回报的 latest 等于 commit marker、文件时间戳证明旧覆盖、保留旧无参清理建议均未采纳。没有相关证据支持这些结论。

## 实现与偏离

删除所有目录/指针扫描和 rmSync。拒绝无参或错误参数。一个显式 runDir 必须是当前 evidence 的直接真实子目录且不是 symlink。result、session directory、transcript 文件检查普通文件或目录，拒绝静态 symlink 输入。macOS `/var` 与 `/private/var` alias 导致首次修复验证只有 5 pass，3 fail。观察实际子进程 stderr 后，父目录比较改为 realpath canonical 比较，保留 runDir 本身 lstat 的 symlink 拒绝。

归档使用 run basename，保留不同轮次。writeFileSync 的 `wx` 在并发相同归档时只允许一名创建者，既有文件及 symlink 都不会覆盖。所有读取/解析在创建归档之前完成。latest 不读取、不更新、不删除，指针换主也无副作用。

偏离旧清理语义。现在是保守归档器，不自动 GC。没有引入 owner/finished 协议、锁或跨文件迁移。pre-implement 技能调用晚于实现，记录在本文件补齐，未伪称执行前创建。

## 隔离回归

测试复制实际清理脚本到 mkdtemp 私有 root，每例有私有 evidence；通过 Node 子进程调用 CLI，而非 mock 文件系统。只有测试 finally 删除本测试创建的临时 root。8 个用例覆盖无参数保留未归档/活跃/他人目录、真实 entries 聚合及换主 latest 保留、旧归档保护、同 variant 两轮、未完成目录、run symlink、session symlink、并发独占创建。

原始 red 输出如下。退出码 1。

```text
FAIL no arguments preserve unarchived, active and other-worker directories
FAIL explicit run archives real entries without removing sources or latest
FAIL existing archive is never overwritten
FAIL two same-variant runs get separate archives
FAIL incomplete run fails without removing partial evidence
FAIL run directory symlink is rejected
FAIL session symlink is rejected without archiving external content
FAIL concurrent archive writers have exactly one winner
0 passed; 8 failed
```

随后按主线程建议给 catch 加入 assertion 原因，仍在修改脚本之前重跑相同 red。完整原因输出在 `/tmp/pi-compact-safety-red.log`，其中并发结果实测 `[0, 0]`，而期望 `[0, 1]`。临时日志路径不作为长期行为证据，测试可独立重跑。

最终 green 原样输出如下。退出码 0。

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

完整命令如下。

```sh
node test/runtime-probes/resume-fork/compact-evidence.test.mjs
node --check test/runtime-probes/resume-fork/compact-evidence.mjs
node --check test/runtime-probes/resume-fork/compact-evidence.test.mjs
./node_modules/.bin/eslint test/runtime-probes/resume-fork/compact-evidence{,.test}.mjs --max-warnings 0
./node_modules/.bin/prettier --check test/runtime-probes/resume-fork/compact-evidence{,.test}.mjs
bun run test
```

以上均退出 0。bun run test 中 tool-search 59 pass，xsettings 112 pass。新隔离脚本由第一条 Node 命令运行，不假称 bun test 自动覆盖它。全仓 typecheck 未重跑，继承报告的 proper-lockfile 基线问题未处理。

新使用命令如下。

```sh
node test/runtime-probes/resume-fork/compact-evidence.mjs --run-dir /absolute/path/to/this/probe/evidence/run-directory
```

## 安全边界与剩余风险

不删除任何原 runDir、未归档/活跃/他人目录或 latest，不覆盖任何既有 archive。不在实际 evidence 运行归档实验。没有断言 provider、MCP 或 resume/fork 修复。

显式参数是归档意图，不是 owner 或完成证明。对活跃 run 的手动归档可能取得不一致读，调用者需等 producer 退出。该行为仍不会删除它的证据。检查只拒绝静态 symlink，没有实现抵御恶意同机攻击者在 lstat/read 之间替换文件的 OS 沙箱。

wx 保护已有归档及并发创建，不保证进程崩溃或磁盘满时新归档完整。异常可能留下新建的部分文件，后续重试将拒绝覆盖。源数据和 latest 保留，可独立恢复。归档一致性、自动 GC 或事务发布需另开范围，不能靠本次无 owner 的输入授权删除。

## 原则落实

Model the Domain 令输入收敛为一个显式 run，而不是公共前缀。Separate Before Serializing Shared State 删除共享 latest/run 的写入与删除，只给每个 run 独立归档。Fix Root Causes 移除从前缀猜 ownership 的根因。Test Behavior, Not Implementation 用真实 CLI 和磁盘内容断言。Prove It Works 保留 red/green 与可重跑脚本。Exhaust the Design Space 比较显式选择和批量指针两种结构，代理 dropout 明确记录。unslop 与 technical-writing 让记录区分实测、取舍和未验证风险。
