# #15 手写 TOML 安全编辑

## 边界与前置

- 自己 workspace tools-15，bookmark feature/tools-panel-15，初始 @ ryvwpxuq，parent sqwyzvoozmxsomnzxxqktoxlwosyuspm（#14 已合入）。仅实现 #15，不做 #16/#17。
- 已读原 default README Developer navigation / GLOSSARY（只读）、本 workspace package Layout、#14 notes、研究指针及 GitHub #13/#15（只读，无 comments）。
- 用户及 spec 已指定 Seam A（真实面板输入到配置/active/UI）与 Seam B（配置公开函数与注入文件系统）。使用这些已确认 seams。
- 身份 rolex <torolex@163.com>，jj 配置与 @ author 一致。无实际 .env/私钥；保留 tracked vendored typebox，不安装、不改 manifest/lock。
- Context7 smol-toml / Jujutsu resolve 均 `TypeError: fetch failed`，无有效 ID，无法 query-docs；核实 integration 锁定发布物 smol-toml dist/index.d.ts 的 parse/stringify，无 CST/span API。jj 用已加载 workflow 和本机 --help 核实。

## 决策

- 全文 parse 验证后 lexical scan，只定位语义 tools.deferred，不用正则匹配整文件，不 stringify 全文。
- 数组内部注释需保留；注释数组只改元素和逗号，保留全部注释及 trivia；无内部注释数组可维持 #14 规范化与幂等契约。
- 原子写沿用 #14，提交前源比较仅检测已观察到的冲突；比较与 rename 间仍有非合作 writer 竞态，不承诺跨进程 CAS。

## TDD

| 实现切片                                              | RED（实际执行）                                                | GREEN                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 多行数组 / 内部注释 / 非目标三引号字符串              | `-t 'multiline array preserves'`：#14 直接 unsupported         | 1 pass / 9 assertions；完整 lexical tokens，comment 数组只改元素/逗号                      |
| quoted / escaped / dotted / inline keys，特殊字符名字 | `-t 'quoted, escaped'`：找不到 range、明确拒绝                 | 两个 #15 配置测试 2 pass / 19 assertions；递归定位 inline assignment，完整语义路径         |
| 真实面板缺键 / 缺表创建                               | `-t 'actual panel creates'`：Cannot save /tools，UI维持 direct | 3个 #15 测试 3 pass / 51 assertions；记录 table/header/root/inline 插入点，保留既有字节    |
| TOML 1.1 inline 表尾逗号                              | `-t 'missing inline keys'`：生成双逗号，编辑后 parse 拒绝      | 忽略 comment/newline 判断末个显著 token，避免重复逗号；7个 #15 测试 7 pass / 82 assertions |

- 不虚构额外 RED：后加的 regression 覆盖已由上述实现或 #14 满足。包括多行转义字符串、注释去重/全清空/幂等、复杂外部编辑重读、真正面板冲突拒绝与修复重试、legacy 清理失败后 panel 保存与新文件优先。
- 保存只调整目标工具 active；外部另一个工具的新增 deferred 策略在既有 before_agent_start 重申，不将单工具保存变成全局 unload（避免越界扩入 #17）。两项面板测试初版对此误设期望，修正测试而非改实现。
- 真正原子writer：独立 Bun subprocess mock node:fs 的 writeFileSync/fsyncSync/renameSync，验证原文件完整保留、临时目录清理、之后正常保存成功；不污染其他测试。Context7 Bun resolve 也 fetch failed，API 行为由实际 subprocess 测试核实。
- 完整测试结果：tool-search **91 pass / 0 fail / 360 assertions**；xsettings **112 pass / 0 fail / 411 assertions**；合计 **203测试 / 771 assertions**。另对 CRLF/Unicode prefix/suffix 用原始 Buffer 验证字节完全一致。

## 复核与交付

- 顾问只读复核未发现 #15 必须修复项；补齐其建议的 implicit parent table / root dotted EOF comment / inline 末项无逗号带注释组合，均通过。
- simplifier 建议：采纳 kept token Set 查询；格式化已展开 scanner 游标分支。未做票外重构。
- 文档仅 root/package README 的 writer 支持范围与失败提示小段；明确无跨进程事务保证，不改 #16 全注册发现或 #17 长会话语义。
- `bun run check` 全链通过：format、lint、typecheck、两包全部 tests。最初 lint 报 unnecessary assertion / regex escape，已局部修正。未改依赖、manifest、lock；依赖仅 ignored symlink 指向 integration/node_modules，tracked typebox 保持原字节。
- integration 最新 tip 仍为 sqwyzvoozmxsomnzxxqktoxlwosyuspm，已是自己的祖先；不创建无意义空 merge。最终核对后移动自己的 bookmark。
- 未 GitHub 写入、推送、认领或关闭 issue；未改用户 Pi 配置、default/其他 workspace @；未用 wt、Git写、isolation 或 dynamic workflow。

## 剩余限制

- 源比较与 rename 间仍有非合作外部writer竞态；无锁协议或严格 CAS。不将原子文件替换说成跨进程事务。
- 无内部注释的数组仍可规范化；有内部注释则保留注释及空白，但删改元素/逗号可能使注释成为独立行。缺键/表通过插入新字节实现，既有内容不重写。
- 若配置 tools 为 scalar/array、deferred 非字符串数组/含空名字、非法 TOML 或无法唯一可靠定位，则明确拒绝，不借清洗破坏原内容。
- 未执行真实用户 Pi 交互或升级 smoke；测试使用隔离 tmpdir + 真正 TUI组件键盘输入。#16/#17和 resume/fork BLOCKED 不在本票。

## Deviations

- Context7 不可用，以上为本地锁定官方发布物证据，不宣称官方文档查询成功。
