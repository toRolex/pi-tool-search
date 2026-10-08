# /tools 面板实现记录

## 任务图

Spec：GitHub toRolex/pi-tool-search #13。关联 tickets 通过正文 Parent 链接，原生 subIssues 查询为空，不能据此认定没有子项。

- #14 最小完整闭环，无 blocker。
- #15 安全编辑 TOML，依赖 #14。
- #16 全工具发现与只读边界，依赖 #14。
- #17 长会话一致性，依赖 #14、#15。

## 决策

- 用户明确要求用 jj 而非 wt。独立 jj workspace 隔离 implementer，bookmark 表达 integration branch；不使用 Git 写操作或 wt。
- Integration 从 main 创建，原 default workspace 的用户文档修改不纳入交付。术语可只读参考原目录 GLOSSARY.md。
- 探索证据：/tmp/pi-tool-search-issue-13-research.md，基线 59 个测试通过。Context7 连接失败，API 契约需用实际依赖源码核验，不能宣称已查询成功。
- 按 ticket frontier 实现；#14 合入后启动 #15、#16，#15 合入后启动 #17。

## Deviations

- 用户指定 jj workspace 替代技能默认 Git worktree/branch；版本管理全部使用 jj。
- 旧 merger 会话无法承接主会话的新授权；用户明确授权后，由主会话用 jj 完成 #15–17 合入。未绕过此前 GitHub assignee 写入拒绝，后续授权明确排除推送与 GitHub 写入。

## 集成与验收

- #14 合入后开启 #15、#16 并行实现；#16 先完成。两票合入后出现四个真实面板测试失败：#15 的固定首行假设不适用于 #16 的全工具排序。通过真实组件按工具名导航修复，保留全部原有断言；实际 RED 4 fail → GREEN 4 pass。
- #15 与 #16 联合检查全绿后启动 #17；#17 合入后，integration 实际 `bun run check` 全通过：format、lint、typecheck、tool-search 102 tests、xsettings 112 tests，共 214 tests / 897 assertions / 0 fail。
- 独立离线 `test/runtime-probes/tools-panel/discovery-demo.ts` 通过；并非真实用户 Pi 交互或升级 smoke。
- 以 `main`（a73478b9）至功能集成 tip d9a08cad 执行 code-review 双轴审查，Standards 与 Spec 均为 0 项发现。因权限检查服务暂时不可用，两轴实际启动存在时间差，但审查上下文保持独立。
- 四个实现 bookmark 均验证为 integration 祖先，再用 `jj workspace forget` 清理 tools-14、tools-15、tools-16、tools-17 的登记。保留目录与成果 bookmark：integration 的 ignored 依赖链接实际指向 tools-14，直接删除会破坏检查环境；物理删除另需确认及依赖独立化。
- 原 default workspace 的用户文档内容保留，不纳入本次 integration。未推送、创建 PR、评论或关闭 GitHub issues；tracker 关闭环节未执行。

## 已知边界

- Context7 查询连接失败，API 契约以锁定官方发布物源码核实，不能宣称官方文档查询成功。
- 原子文件替换不是无条件跨进程 CAS；比较源与提交之间仍存在非合作 writer 的竞态边界。
- 未修复既有 resume/fork 自动 restoration 的 BLOCKED 问题。
