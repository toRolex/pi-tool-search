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
