# #16 全工具发现与只读边界实现记录

## 边界与 seams

- 仅实现 #16；base 为 #14 integration sqwyzvoozmxsomnzxxqktoxlwosyuspm，自己的 tools-16 workspace / feature/tools-panel-16，作者 rolex <torolex@163.com>。
- 使用 #13 已确认的 Seam A：mock host 扩展装配、真实 SettingsList / SelectList 输入，观察文本、持久文件与 active/search 结果。独立 describe，避免 #15 配置测试冲突。不修改 config.ts。
- 已读原 default README Developer navigation / GLOSSARY（只读）及本 base README/package Layout、#13/#16、研究与 #14 notes。
- Context7 resolve @earendil-works/pi-coding-agent 失败：`TypeError: fetch failed`，无 ID，无法 query-docs。核实锁定官方 0.84.2 SettingsList：无 values/submenu 的项不可操作，description 可解释原因；当前官方 1.1.0 ToolInfo 暴露 exposure，使用窄结构性兼容，不升级依赖。
- ignored 依赖逐项链接 integration/node_modules，只读复用；保留跟踪 vendored typebox。没有 npm ci、manifest/lock 修改。

## 实现决策

- 展示目录来自当前 getAllTools，不改变 session_start assigned direct scope 或搜索索引。
- assigned scope 内复用 direct/deferred 持久语义；其他条目不根据配置或 inactive 推断本插件 deferred。
- 禁止 GitHub 写入、push/close、Git 写操作、wt/isolation/dynamic workflow、用户 Pi 配置操作。

## TDD

| 切片                                | 实际 RED                                                                 | GREEN                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 全注册排序、混合可编辑/只读真实操作 | `all registered tools are sorted`：outside 未展示，索引 -1，排序断言失败 | 1 pass / 16 assertions；readonly Enter/Space 不落盘、不改 active，zebra 可 defer/select；未知与范围外配置保留                                           |
| 可信只读理由                        | `readonly reasons use host exposure`：缺 `Host exposure: codemode`       | 1 pass / 17 assertions；native/codemode/hidden/model-only 根据 host exposure 说明，未知 outside 仅报告范围外，自身禁止修改，索引仍仅 1 个 assigned 工具 |
| 内联 exposure 与策略分离            | 同一 seam 新断言：native/code 只显示 active，缺 `host deferred/codemode` | GREEN；不把 host deferred 当本插件持久 policy，也不把 inactive 当 deferred                                                                              |

- #14 已有真实 UI 回归因新增自身只读行导致首选项不再是 weather；只调整测试输入多一次 Down，不改变行为契约。旧“不可见”的断言更新为“可见但 readonly”；其搜索边界断言保留。
- 独立 demo：`bun test/runtime-probes/tools-panel/discovery-demo.ts`，真实扩展与 TUI 组件、mock host、临时配置，输出 before/native理由/outside理由/after 并独立 assert。已经通过；不启动用户 Pi。展示 5 个 registered，搜索索引只含 2 个 assigned，readonly 操作不 save/activate，defer 后 select 可加载。
- 首次全量 `bun run check` 已通过：format、lint、两个包 typecheck，tool-search 85 pass / 284 assertions，xsettings 112 pass / 411 assertions（合计 197 tests）。
- jj CLI Context7 resolve 同样 fetch failed；通过本机 `jj new --help` / `bookmark move --help` 核实，不冒充官方文档服务成功。

## 复核与交付

- 顾问只读验收：静态符合 #16，无必须修复项。执行器已实际运行全测试与 demo，非仅阅读测试。
- 采纳简化复核建议：面板理由改顺序判断，测试预期改显式理由表；不做票外重构。
- integration 最新 tip 交付前再次核对为 sqwyzvoozmxsomnzxxqktoxlwosyuspm，已经是自己的祖先，因此按用户要求不创建空 merge。已执行 `bookmark move feature/tools-panel-16 --to @`（本已指向自己的同一 change，报告 no bookmarks to update）；没有修改其他 workspace @。
- 最终 `bun run check` 与独立 demo 再次全绿：tool-search 85 pass / 285 assertions，xsettings 112 pass / 411 assertions，合计 197 tests；readonly 测试额外注入禁止 writer，并确认未调用 host active setter，不只比较最终文件字节。
- 作者再次核对 rolex <torolex@163.com>；config.ts、manifest、lock 与 vendored typebox 的目标 diff 为空。

## Deviations / 限制

- 本 workspace base README 尚无 Developer navigation；已读原 default 对应导航，未将用户未提交文档引入自己的 change。
- #15 复杂 TOML 与 #17 长会话问题不提前实现。
