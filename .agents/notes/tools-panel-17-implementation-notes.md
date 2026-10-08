# #17 长会话策略一致性

## 边界与前置

- 自己 workspace tools-17 / bookmark feature/tools-panel-17；base integration ssvmoyoy / 2a7194f8（#14/#15/#16与测试适配已合入）。作者 rolex <torolex@163.com>，已核对配置与change。
- 已读 #13/#17（gh只读，均无comments）、研究指针、#14–16 notes、原default Developer navigation/GLOSSARY（只读用户文件）、本workspace README/package Layout。
- 使用 #13 已确认 Seam A：mock host公开扩展装配、真实SettingsList/SelectList输入；只断言持久字节、渲染、active、search返回与prompt section。按名字用focusPanelTool导航，不依赖首行。
- Context7 resolve Pi SDK：TypeError: fetch failed，无有效library ID，无法query-docs。核实integration锁定官方0.84.2发布源码agent-session.js的同步getAllTools/getActiveToolNames/setActiveToolsByName和extensions/types.d.ts的session_start reasons。
- ignored依赖逐项symlink到integration/node_modules，保留tracked typebox；不安装、不改manifest/lock。一次shell链接尝试因zsh特殊变量path覆盖PATH失败，未修改文件，改用dependency变量成功。
- 仅#17。不修已有resume/fork自动restoration BLOCKED；不改其他workspace @、integration bookmark、用户Pi配置，不推送或GitHub写，不用wt/Git写/isolation/dynamic workflow。

## 决策

- 配置有效快照只在成功读取/保存后更新；回合重申不引入file watcher。
- 面板重新取registered与active只是展示快照，不把发现目录当搜索scope。打开不撤销搜索加载。

## TDD

| 切片                                        | 实际 RED                                                                                       | GREEN                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 同实例新会话保留裁剪前assigned scope        | `-t 'new session resets search loads'`：wind变readonly，第二次session从active重建scope丢失wind | 固定首次scope（独立scopeAssigned标记）；1 pass / 10 assertions |
| 新会话重读配置，读取失败不污染policy/loaded | `-t 'session initialization rereads'`：未报Cannot initialize Tool Search，原实现不读盘且清豁免 | 成功读盘后才更新/clear/prune；两个切片2 pass / 19 assertions   |

- 后续矩阵为已有实现的验收回归，不虚构额外RED：search→direct→deferred、重复回合第三方激活/去激活、prompt过滤scope外、新registered仅readonly、外部policy与active重开刷新、parse错误保留loaded/policy、修复重试、空assigned scope、新会话不接管outside、不恢复inactive direct；new/resume/fork只验证插件session-start reset，非真实restoration验收。
- 完整回归首轮3 fail：新增矩阵对active顺序误设（search setter先保留scope外再assigned，测试改正确顺序，不改生产）；两条旧测试断言factory snapshot跨session永远不更新，与#17最新持久策略矛盾。保留迁移首次初始化断言，并更新后续session断言为最新文件。
- 所有weather真实输入定位改focusPanelTool，不依赖tool_search首行或固定次数。SelectList内部上下选择只是选择policy，不是定位工具。
- `bun run check`初次typecheck发现harness不完整ctx直接断言错误，改显式unknown适配mock；随后format/lint/typecheck/tests全通过：tool-search101 pass / 478 assertions、xsettings112 pass / 411 assertions，合计213 tests / 889 assertions。独立discovery-demo通过。

## 已确认决策

- 顾问架构复核推荐：instance首次assigned scope持有到reload（包括合法空scope），后续不union新active；先成功read再清加载与prune。采用此保守方案，避免scope随裁剪缩小或接管他人。
- 持久direct不等于强制active：新session保留inactive direct；仅明确面板direct才激活。统一处理session_start reasons不加入branch工具自动恢复。
- README/package文档同步：重开fresh快照、最新有效policy每回合重申、load exemption撤销、session reset/固定scope、读错保留状态、无watcher/逐回合读盘及BLOCKED边界。

## 交付复核

- simplifier只读复核：无需进一步简化，独立初始化标记与显式行为断言应保留。
- strong-model-consultant只读验收：无确定必须修复项；采纳文档提醒，澄清旧picker措辞为搜索assigned scope与全registered面板readonly。
- 补真实EISDIR读错误回归，区别于parse错误/ENOENT空策略：重开报错、保留loaded与policy、之后修复正常重开。不改变实现。
- 顾问提到的外部policy移出/加入deferred不会自动清已有豁免：这是打开不卸载loaded契约，明确面板选择才清豁免。未引入票外外部编辑卸载语义；没有声明解决首次初始化失败期间host loadout时序或自动restoration。
- 最新integration仍为ssvmoyoy / 2a7194f8，已是自己的祖先，不造空merge；最终只移动feature/tools-panel-17到tip，不移动integration。
- Context7 Jujutsu resolve同样fetch failed；通过本机bookmark move --help核实CLI，并用祖先revset核对base。
- 无manifest/lock/config.ts/其他workspace或用户配置变更。独立demo最终复跑通过；check因新测试/notes尚未格式化报2个文件，局部格式化后再次执行全链通过。最终tool-search102 pass / 486 assertions、xsettings112 pass / 411 assertions，合计214 tests / 897 assertions；format/lint/typecheck全绿。

## Deviations / 限制

- Context7服务不可用，发布源码观察不冒充官方文档查询成功。
