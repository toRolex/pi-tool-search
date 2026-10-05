# pi-tool-search fork：ToolSearch 对齐 Claude Code（名单可见、schema 不加载）

Handoff：/tmp/handoff-pi-tool-search-toolsearch-alignment.md。目标：deferred 工具名字对模型可见（schema 不加载），支持 `select:<name>` 精确激活。

## Todolist（Feature playbook）

1. `how`：pi 1.0.2 tool exposure 机制 + 注入点调研 → 派 how-explainer（cliproxy/glm-5.3-flash|low）
2. `architect`：设计探索（多方案并行或 skip 注明理由）
3. Throughput checkpoint（4 项，逐条注明或 n/a）
4. Delegate code-writing → 子代理实现
5. 验证：`pi -p` 工具名单 + stderr 空 + select: 激活回归
6. 小步提交 + push + `pi update git:github.com/toRolex/pi-tool-search`
7. Opening a PR（或 skip 注明理由）

## 设计调研（how-explainer 结论，已亲自抽查承重点）

- pi 1.0.2 原生 `ToolExposure` 五值：direct / model-only / codemode / deferred / hidden。schema 从不进 system prompt 文本，走 API tools 参数；`<tools>` 段只是每行 `- name: promptSnippet`。
- deferred 工具 = 普通 direct 工具被 fork 用 setActiveTools 撤下，模型侧完全不可见。对齐 CC 只需把名单注入模型上下文。
- **注入点（已验证）**：`before_agent_start` 的 `event.systemPromptOptions` 可变（types.d.ts:708 "Mutable prompt sections. Later handlers observe mutations made by earlier handlers."），改 `sections` = 增量 delta（diffSystemPromptSections）。自定义 section key 规则 `/^[a-z][a-z0-9_-]*$/`、不得叫 `preamble`（system-prompt.js:7,71）。返回 `{ systemPrompt }` 会 forceSystemPrompt 整段替换——禁止。
- promptSnippet 只对 active 工具渲染，不能承载 inactive 名单。
- `select:` 语法加在 fork tool_search execute 入口：`select:` 前缀跳过 searchTools，直接精确激活。
- DeferredToolPlaceholder 无对应物、不需要：pi 的 active set + `<tools>` 段天然承担占位职责。
- ffgrep/fffind 陈旧别名：名单生成时与 getAllTools() 实名求交集可挡 stale 项；别名是否过滤 → 实现时定，最终回复呈现给用户。

## 综合设计（arena 完成：base C1 + C2 嫁接 + judge 修正）

**裁决**：judge 17:16 判 C1（section 注入）为 base。决定性论据已亲自验证：pi-ai transcript.js:124 "A changed definition is a removal followed by an addition"——C2 的 prepareLoadout 改写 description 会在每次名单变化时触发 tool_search 的 toolsRemoved+toolsAdded 重声明，"零 transcript 写入"不成立。C2 的 prepareLoadout 机制本身可用但成本论证错。

**嫁接自 C2**：设置回调即 reconcile；ffgrep/fffind 保留（仅精确名去重，不猜 alias）；result guard 接受 v2|v3；薄 catalog（不做 CapabilityBoard 全量搬家——单调用者包装违反 minimize-reader-load）。

**judge 修正采纳**：不截断名单；section 与 select 用同一可执行 universe；all-already-active 不能误报 no_match；presentation 必须真改（成功分支只渲染 rankedMatches）。

**最终形状**：

1. 新文件 `select.ts`：`parseSelectQuery(query)` 纯解析（`select:` 前缀、逗号分隔、trim、去空段、去重保序；无前缀返 undefined）；`renderDeferredSection(names)` 返回 section 文本或 undefined（空名单删 key）。SECTION_KEY=`deferred-tools`（合法：小写连字符，非 preamble）。
2. `result.ts` v3：status 加 `invalid_select`；input 判别联合 search|select；guard 接受 v2|v3。
3. `definition.ts`：executeToolSearch 分支 select（全有或全无：unknown 非空 → 不激活任何工具；select 限 deferred 名单内（xsettings 为意图源）；already-active 幂等；limit 忽略）。fuzzy 路径逐字节不变。ToolSearchScope 不改；deferred 名单经新参数 `getDeferredNames` 传入 executeToolSearch 与 adapter。
4. `extension.ts`：before_agent_start 单 handler 两步——先剪枝（语义逐字不变），再渲染 section（pending = deferred ∩ getAllTools − activatedBySearch；空则删 key）。settings 回调重建 deferred 后与 getAllTools 交集即名单。不返回 systemPrompt。
5. `presentation.ts`：invalid_select 分支 + select 模式渲染（unknown 名单展示）。
6. tool_search description 加一句 select: 用法。

## 实现决策

- 派实现代理（cliproxy/grok-4.7 因 402 余额尽换 cliproxy/deepseek-v4.1-flash），交付后我逐文件审 diff：贴合 spec、guard 改写细致，**不回退**。gpt-6.1-sol 做只读评审（fix-first，两个 P2）。
- 评审修复（我亲自改）：① section 的 pending 改为按 `pi.getActiveTools()` 排除已加载（codemode 激活也能正确消失，不只靠 activatedBySearch）；② invalid_select 诊断改从 `details.input` 派生（codemode adapter 传 `content: []`，原实现丢诊断）。
- 测试补：真实 select 激活路径后下轮 section 删 key；adapter 空 content 路径诊断可见。
- jj 接入：`jj git init --colocate` + `bookmark track main@origin`，单一 change 提交（feature 原子：section 广告的就是 select 能加载的名单），推送 fbe7511c。

### Deviations

- 仓库 dev types 钉 0.84.2（无 `sections` 类型）：handler 用官方 `BeforeAgentStartEvent` + 窄化 cast + `if (!sections) return`。运行时 pi 1.0.2 恒有 sections，行为等价。
- delegate 为跑通 bun test/typecheck 在仓库外建了 `~/.pi/agent/git/github.com/toRolex/tmp-earendil` + symlink（@earendil-works 必须锁 0.84.2，>=0.85 与 vendored pi-libtui 类型不兼容）。不在 git 树内，留作后续 typecheck 环境。
- delegate 曾误删 git 跟踪的 vendored `node_modules/typebox`（跑 install 副作用），已 `git checkout -- node_modules` 恢复。
- 验证时发现 list_skills 消失：系用户自己在 pi-skill-tool 的交付（90f8b57 起合并为单一 use_skill + prompt 目录，见 /tmp/handoff-pi-skill-tool.md），非回归。

## 验证（真实表面，stderr 全部为空）

- `pi -p` 工具自报：11 个常驻（无 goal 工具 → 剪枝仍赢）。
- `pi -p` 逐字引用 deferred-tools section：25 个 deferred 名字 + select: 用法，与 xsettings 一致。
- `pi -p` 实调 `select:web_search`：返回 `Loaded tools: web_search.`，工具本 turn 可用。
- bun test 33/33，tsc --build 干净。

## 追加：grep/find 转 deferred（实测后启用）

- 用户确认暴露的 grep/find 已是 fff override 版；fff src/index.ts:776-810 证实 override 接管后 ffgrep/fffind 被 stale 剪枝，旧"陈旧副本误命中"隐患不存在。
- 实测声明体积：grep 1564B + find 1736B ≈ 3300B/请求（约 900 token），另有各自 4 行 guidelines。
- 加入 xsettings deferred 后：tools 数 11→9，请求体 18994B→15694B；section 广告 27 名；`select:grep,find` 激活后 fff grep 正常工作（3 匹配）。
- 配置已保留；回退：从 xsettings.toml [tools] 行去掉 "grep", "find"（备份 /tmp/xsettings.toml.bak）。

## 附录：mcp_servers section 缺失排查（非本 fork 责任）

- 现象：pi -p 单轮会话的 system prompt 无 <mcp_servers>，有 <deferred-tools>。
- A/B：把 fork 从 settings 摘除后 -p 仍无 mcp_servers → fork 无责。⚠️ 教训：A/B 期间派的 probe 子代理也在无 fork 状态下跑（子代理继承 settings），测完立即恢复并复验。
- 真因：-p 单轮模式首个 turn 的 before_agent_start 时，远程 MCP（context7）尚未连接完成，servers 列表为空 → renderServersSection 返 undefined → section 被删。同轮稍后工具才注册（ALL_TOOLS 实测含 mcp__context7__*）。交互式 TUI 启动阶段先等连接，section 从首 turn 就在。
- 干净状态复验：新会话 transcript sections 同时含 deferred-tools 与 mcp_servers；<tools> 段无 grep/find（已 defer）；tool_search 本就无 promptSnippet（前机制，schema 照常声明）。
- 排查方法：probe 扩展挂 before_provider_request 抓 system prompt（与 pi-skill-tool handoff 记录的同款手法）。

- **Blocking first steps**：how 调研（tool exposure + 注入点）先于一切设计；已阻塞完成。
- **Independent workstreams**：design 两 candidate 并行；实现后验证（bun test / typecheck / pi -p）可并行跑。
- **Shared mutable state**：单仓库单分支，extension.ts 是共享写入点 → 实现串行单代理，不拆分。
- **Smallest safe decomposition**：单 owner 实现即可——改动集中在 6 个文件、接口单一（executeToolSearch 分支 + handler 渲染），拆多 worker 会引入合并顺序协调成本，得不偿失。

## 实现决策

（待填）
