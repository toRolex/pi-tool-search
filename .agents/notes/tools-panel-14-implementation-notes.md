# #14 最小持久工具面板实现记录

## 边界与 seams

- Spec：toRolex/pi-tool-search #13/#14。仅 #14；复杂 TOML 编辑、全工具发现与长会话外部同步分别留给 #15–17。
- 采用票中已确认的 Seam A（mock Pi 扩展装配，真实 TUI 组件输入）与 Seam B（配置纯函数及注入文件系统）。不测试私有 Set。
- 独立 workspace tools-14，bookmark feature/tools-panel-14。初始 parent 已经 integration；integration notes snapshot 导致 stale，已 update-stale，父提交 3063a5a5。
- Context7 resolve Pi SDK 失败：`TypeError: fetch failed`，无 library ID，不能 query。改核实锁定依赖官方发布物源码/类型，不宣称文档服务成功。
- npm ci --ignore-scripts 仅安装本 workspace 锁定依赖；报告 3 个既有依赖漏洞，不做票外升级。

## 决策

- 面板只列 assigned direct scope；自身及 scope 外不接管，不先实现 #16。
- 初步写盘只支持规范 `[tools]` 下单行 `deferred` 数组与文件缺失；其他合法形态明确拒绝，安全编辑扩展交给 #15。
- 持久策略与 search-loaded 状态分离；面板显式 deferred 操作撤销搜索豁免，普通搜索与 select 共享最新策略。

## TDD 证据

| 切片（均在本 workspace）                          | 实际 RED                                                                                   | GREEN                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| canonical array 单工具 hide/show 与 CRLF 外部字节 | `-t 'hide/show replaces'`：缺少 setDeferredTool export；随后 serializer 空格与精确期望不符 | 1 pass / 0 fail / 5 assertions                                  |
| suffix `# [leave this]` 与特殊名字                | `-t 'array-like suffix'`：贪婪匹配吃掉数组外注释，精确字节断言失败                         | 改为理解引号/转义的单行数组扫描；2 pass / 0 fail / 6 assertions |
| UI → 持久文件 → active → select                   | `-t 'TUI user can defer'`：尚未注册 /tools，command undefined                              | 1 pass / 0 fail / 6 assertions                                  |
| self / scope外 / native exposure 边界             | `-t 'editable scope'`：native/codemode/hidden/model-only 错误出现在可编辑列表              | 1 pass / 0 fail / 12 assertions                                 |
| 写失败真实 UI 回滚                                | `-t 'failed atomic save'`：FS 未传入写入路径，disk-full未报错且保存生效                    | 1 pass / 0 fail / 6 assertions                                  |
| 普通搜索与 select 最新策略一致                    | `-t 'ordinary search and select'`：普通搜索误加载非 deferred 的 inactive wind              | 1 pass / 0 fail / 3 assertions                                  |

- Seam A 不 mock 本插件内部模块；真正 SettingsList/SelectList 收到 Enter/方向键输入，断言最终文本、文件、active 和搜索返回值。UI写失败测试能捕获组件在回调前预改显示值的问题。
- 后续回归覆盖同值明确 deferred 卸载、打开不卸载、三个回合、重新加载、新实例、恢复 direct、非TUI三种mode、非法TOML打开/选择、外部名字保留及更新全部策略、legacy共存。
- Seam B 覆盖文件创建、规范单行array、CRLF/Unicode/无末尾换行、后缀注释中方括号、特殊字符串、去重/幂等、unsupported/invalid安全拒绝、实际原子writer的外部编辑/创建竞争检测、stage失败无部分文件。

## 验收与实现决策补充

- SDK getActiveTools/setActiveTools 同步 API；写盘成功后更新policy及active。回合钩子仅触碰assigned scope内deferred，不处理配置误写的自身或scope外名字。
- SettingsList 在 onChange 前改变 currentValue，失败必须 updateValue 回滚；SelectList 子菜单让用户可以明确再次选择当前 deferred，不必先direct再deferred。
- 正常搜索与select每次执行共用一次policy provider快照；无provider的独立搜索组件保留旧契约。
- 原子writer为同目录临时文件+fsync+rename；创建用exclusive link避免覆盖；提交前再次读源检测已观察到的外部变化。成功提交后的临时清理失败发warning，不能被误报为保存失败让内存停在旧策略。
- 顾问只读复核未发现#14必须修复项。unknown名字按语义保留；数组内部可规范化，仅区间外要求逐字节。采纳simplifier的同回调集合复用；其他baseline清理不扩入本票。
- Context7 Pi SDK及smol-toml resolve均fetch failed，使用已安装官方发布物类型/源码：dev SDK/TUI 0.84.2 与 smol-toml；研究中1.0.4路径已不存在，本机现有官方SDK为1.1.0，类型、example `/tools` 的ctx.mode/custom/SettingsList及getAllTools exposure已只读核实。未宣称1.1.0完整交互验收。
- root源码检查需要顶层pi-ai、proper-lockfile解析链接以及@types/proper-lockfile；在本workspace的node_modules补齐。npm ci删掉了被跟踪的vendored node_modules/typebox，已用jj restore恢复原字节；最终diff无依赖/lock/manifest改动。临时类型安装仅 --no-save --package-lock=false，未升级交付依赖。
- 实际执行项目脚本：`bun run format`、`bun run check:format`、`bun run lint`、`bun run typecheck`、`bun run test`。format/check/lint/typecheck全通过；tool-search **83 pass / 0 fail / 249 assertions**，xsettings **112 pass / 0 fail / 411 assertions**，合计195测试。

## 剩余限制（不提前实现后续票）

- #15：缺键/表、多行、quoted/dotted/inline等合法形态仍明确拒绝；含三引号的文档也保守拒绝。数组外字节保留，内部会规范化并去重。
- #16：仅管理assigned scope，尚不显示全注册工具及只读原因。
- #17：无file watcher或完整长会话/分支恢复；打开刷新policy而不撤销loaded，toggle重读文件。本票不修复resume/fork既有BLOCKED问题。
- 比较源与rename之间仍有非合作外部writer竞态窗口，非严格跨进程CAS；不承诺锁协议。host setActive异常的跨磁盘/host事务不在解析/写盘失败保证内。
- 未操作真实Pi配置，未启动用户交互Pi，未push/PR/关闭issue，也未绕过GitHub认领权限拒绝。

## Deviations

- 用户指定 jj workspace；不使用 wt、Git 写操作、dynamic workflow，也不写真实 Pi 配置或 GitHub。
