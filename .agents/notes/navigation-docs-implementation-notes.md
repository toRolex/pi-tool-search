# Navigation docs implementation notes

## 范围与决策

- 修改根 README、包 README、tooling 历史笔记、resume/fork 探针 README 与本文；主线程另在 AGENTS 增加一条开发/排障触发指针。不改生产代码、manifest、skills 或用户配置；不提交。
- 重新读取实际文档、根 scripts/格式/lint 配置、config.ts、extension.ts 与后续恢复设计。临时 retro 仅作输入，不复制完整内容入仓库。
- 入口放根 README：可变安装位置通过 `pi list` 发现；开发 clone、安装 copy、运行 core 分开定位。不缓存绝对依赖路径或版本对照表。
- 包 README 保留历史包身份与 API 契约，只修安装/开发指针、已撤销的 picker 描述和 Layout。
- tooling 当前裁决置顶，保留误判 owner 与反向恢复 Biome 的因果记录。handoff 是动态快照，不作为删除来源未确认改动的依据。
- 探针是机制取证；旧修法由后续 BLOCKED 设计取代。诊断 green 不作为恢复修复 green。

## Deviations

无。主线程采用一条 AGENTS 导航指针，以便开发/排障任务触发根 README 入口；不将架构与配置说明复制到常驻上下文。

## 验证

- 本地 `./node_modules/.bin/prettier --write` 仅对范围内五份 Markdown 格式化；随后相同范围 `--check`，退出码 0。
- 本地 `node --input-type=module` 检查五份文档的相对 Markdown 链接及目标标题 anchor：14 项，0 失败，退出码 0；跳过外部 URL，不验证远端 issue 状态。
- 主线程独立运行 `/tmp/navigation-docs-check.cjs`：14 个本地链接/anchor 通过，51 个生产源码、测试与配置文件的 SHA-256 与本轮基准一致，退出 0。
- 主线程对上述五份文档及 AGENTS 运行本地 Prettier `--check`，退出 0。
- 独立文档审查返回 PASS；核对改动前快照、复盘要求、scope/配置源码，无必要修改。主线程随后复跑链接/hash 与六份文档 Prettier，均退出 0；另确认包 README API contract 原样保留，AGENTS 仅新增一条指针。
- 不运行 runtime probe，不触碰用户配置。未声称生产检查全绿。

## 未解决项

- 恢复完整修复仍为 BLOCKED；本文只建立导航与 supersedes 链接。
- handoff skill 的模板改进不在本轮范围；tooling 笔记仅保留此次事故的交接教训。
