# Verified issues pickup

## 目标与边界

接续交接文档。先修 compact 清理 P2。恢复状态先只读设计，再按实际 API 的限制决定是否实现。保留已有 scope、namespace 与探针成果。不提交、推送、建 PR、部署或修改用户配置。

## Session pickup todos

1. [x] Locate the prior trail.
2. [x] Reconstruct operational state.
3. [x] Diff done vs pending.
4. [x] Route the remaining work to the matching playbook and pick the verdict.
5. [x] Verify the inherited claims against the original goal on the real artifact.

交接记录与两份独立报告作为 prior trail。仓库已有 jj，身份与 Git 配置一致。接入前检查未发现项目 .env、pem、credentials 文件。已有工作副本修改保留，不建立新 revision，以遵守本次不提交约束。

## Bug fix todos

1. [x] Reproduce it yourself on the matching surface via the control skill (Non-negotiables).
2. [x] Binary-search the cause.
3. [x] Plan the fix.
4. [x] Verify on the same surface.
5. [ ] Stage the commits so the failing repro lands before the fix in git history. skip: 用户未授权提交，保留可重跑的 red-green 证据。
6. [ ] Run **Opening a PR**. skip: 用户未授权 PR 或推送。

主线程用 Node VM 执行实际 compact 主体，文件系统替换为内存实现。没有 latest 指针时仍删除三个其他目录。断言 unarchived and active runs must survive 失败，退出 1。没有真实删除。

## Swarm todos

1. [x] Frame
2. [x] Fan out
3. [x] Aggregate
4. [x] Report

按独立任务分区，不竞赛。cleanup-fix 独占脚本、新增隔离测试与自己的 notes。restoration-design 只读生产与 core，仅写自己的设计报告。完成条件为清理回归通过且独立验收完成。恢复若无法尊重显式限制，保留 BLOCKED，不自动扩大工具权限。

## Throughput checkpoint

两条路径并行。P2 实现与恢复 API 调查互不依赖。主线程只复现、编排、读取精简交付物与运行独立验收。原 evidence 不参与破坏性实验。

## 原则

Separate Before Serializing Shared State 改变写入分配。代理不共享修改目标，验证用独占临时目录。

Guard the Context Window 改变调查分工。大范围 core API 阅读交给恢复调查代理，主线程只接收可核对的接口证据与边界。

Prove It Works 改变验收。主线程已复现实际脚本错误，随后重跑交付测试，而非接受代理总结。

## 验收与结论

P2 改为单个显式 --run-dir 归档，不扫描 latest，不删除源或缓存，使用 run basename 与 wx 防覆盖。主线程在旧脚本上运行新增回归，原样 0 passed; 8 failed，退出 1。最终同命令原样 8 passed; 0 failed，退出 0。实现途中 macOS canonical path 校验曾失败 3 例，修正后再次通过。README 同步为保留数据的归档语义。

主线程 bun run test 实测 tool-search 59 pass、xsettings 112 pass。tool-search noEmit 类型检查、相关 ESLint、归档脚本 syntax 与 Prettier 均通过。全仓 bun run typecheck 仍退出 1，proper-lockfile TS7016 基线未处理。

独立 reviewer 的 cleanup-safety-independent-verification.md 给 PASS。实际重跑 8 例，并补充 18 个独立场景及 10 轮四进程竞争，明确未验证故障原子发布。Comment Sicko 只读审查 PASS，删除、恢复、重跑均 0。

恢复方案本轮 BLOCKED，不修改生产 extension。主线程完整读两份隔离 API 实验脚本并独立运行 node /tmp/pi-restoration-design-26471/observe.mjs 与 observe-084.mjs，均退出 0。两版 default 与 explicit-same 的 active、registry、settings 同观测，公开 API 无显式选择来源。hard deny/noTools-all/exclude 的工具无法通过 setActiveTools 扩大。这不是恢复 green。完整修复需 core 提供选择 provenance 与合法 loadout 的优先级。

原 evidence 未改。没有 installed copy 或用户配置变更，没有提交、推送、PR 或部署。代理设计探索出现额度、503 与 --panes 启动失败，已在各自 notes 记录。没有把 dropout 当通过。

## Deviations

不重取已完成 scope 与 namespace 的历史 red。原 runtime 恢复 red 作为已有证据，不在共享 evidence 再跑。最终会重跑现有测试确认未回归。
