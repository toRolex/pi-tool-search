# pi-tool-search：namespace 参与索引 + README v3 契约

任务（handoff）：`search.ts` 的 `ToolMetadata` 增加 optional `namespace`，把它 name/description/instructions 三类文本纳入 BM25 索引；README 更新为完整 v3 结果契约与 `select:` 用法。owner（Grok 额度耗尽）替换为接手者，禁止再派子代理，自己写码。

## 交付边界（硬约束）

- 独占：`packages/pi-tool-search/src/search.ts`、`packages/pi-tool-search/README.md`、新增 `packages/pi-tool-search/test/namespace-search.test.ts`、本 notes。
- 不改：`extension.ts`、`definition.ts`、`test/tool-search.test.ts`、`package.json`/lock/devDeps、`~/.pi/agent` 用户配置、installed copy；不做任何版本控制写操作（不 commit/push/PR）。
- 保持：BM25 打分、scope 语义、MCP 生命周期不变；不扩 exposure 支持。

## 前owner/并发改动核查

接手时 `git status` 与 `jj status` 均为空 = 前 owner 没留改动，无覆盖风险。

开工读文件期间工作副本出现并发改动（另一个任务的 agent 正在做 scope-advertising）：`M packages/pi-tool-search/src/extension.ts`（`pending` 加 `scopeNames` 交集）、`A test/scope-advertising.test.ts`、`A` 两个 notes。与我的四个文件完全不相交，不覆盖、不代改。它在改的 `extension.ts` 恰是我被禁止触碰的文件，所以我的 namespace 只能从 `search.ts` 的 `ToolMetadata` 这一个缝进去。

## 基础事实（一手核实，非推断）

pi 1.0.4 装机路径 `/Users/rolex/Library/pnpm/global/v11/.../@earendil-works+pi-coding-agent@1.0.4/`：

- `dist/core/extensions/types.d.ts:404` 定义 `ToolNamespace { name: string; description?: string; instructions?: string }`。这是对象，不是 string。
- 同文件 `ToolInfo = Pick<ToolDefinition,...> & { exposure; namespace?: ToolNamespace; annotations?; sourceInfo }`，`ToolDefinition.namespace?: ToolNamespace`。所以 `pi.getAllTools()` 的返回值本身就带 namespace，extension.ts 原样透传即已把 namespace 送到 `scope.tools()`，无需改 extension.ts。
- `dist/extensions/tool-search/tool.js` 的 `createToolSearchDocument(tool, namespace)` 逐行：`parts = [name, name.replaceAll("_"," "), description]` → schema 文本 → `if (namespace) parts.push(namespace.name, namespace.description ?? "", namespace.instructions ?? "")`。三类文本都进文档，`?? ""` 是为了吃掉 optional 字段。
- 仓库钉的 devDependency `@earendil-works/pi-coding-agent@0.84.2` 里**没有** `ToolNamespace`（grep 只有 `timings.d.ts` 的同名无关形参），因此不能在 `search.ts` 里 `import type { ToolNamespace }`。

结论：`search.ts` 本地声明结构等价的 `ToolNamespace`，形状逐字段对齐 1.0.4。不写 `namespace?: string | ToolNamespace` 这种无证据兼容（1.0.4 无 string 形态）。

## 跨函数接口：两个最小候选

|                                  | A. 在 `searchFields(tool)` 里直接 push | B. 新增 `namespaceText(namespace): string[]`                   |
| -------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| 代码量                           | +3 行（含 `if`）                       | +6 行：新函数 + 调用点                                         |
| 索引文本的单一事实源             | 保持 `searchFields` 一处列全           | 被拆到两处，改索引范围要开两个函数                             |
| 调用者数                         | 1                                      | 1（只有 `searchFields` 调）                                    |
| 与既有 `appendSchemaText` 的关系 | 并列的一行 push                        | 形似，但 schema 那个是递归遍历才需要独立函数；namespace 无递归 |
| 测试可见差异                     | 无                                     | 无                                                             |

选 A。判据是 Laziness Protocol 的「one-caller wrapper 折叠」+ Minimize Reader Load：`searchFields` 的职责就是「列出被索引的文本字段」，namespace 是第 4 类字段而不是一个机制。B 的独立函数在无递归、单调用者、无独立测试价值时只增加跳转层。pi 上游用的是 `parts.push(...)` 同构写法，A 与上游一致。

拒绝的第三案：把 `searchFields` 重构成 pi 那样的 `searchText(tool): string` —— 会顺手改掉 `indexTool`/BM25 输入路径，违反「BM25 不变」和最小 diff。

## Todolist

1. 写 `test/namespace-search.test.ts`（namespace-only 查询），跑出 red 并留输出
2. `search.ts` 最小实现，跑出 green
3. 回归：pi-tool-search 全量测试 + typecheck + prettier + eslint
4. README 更新完整 v3 契约 + select 用法 + namespace 索引范围
5. 记录 Deviations，产出报告

## 实现决策

**data shape**：`ToolMetadata` 是索引里的唯一 document 形状，namespace 作为它的第 4 类字段加入，与 pi `ToolInfo.namespace` 同构（`ToolMetadata` 本就是 `ToolInfo` 的投影）。不给 namespace 建独立索引、不改 `indexTool`/BM25 输入路径。非法状态由类型挡：`name: string` 必填，`description`/`instructions` optional → `?? ""` 吃 undefined，与上游逐字一致。

**索引范围**（`searchFields`，一行 `if`）：namespace name、namespace description、namespace instructions。不索引 `name.replaceAll("_", " ")` 那种派生形式（上游 namespace 也没做），因为 tokenizer 本来就按非字母数字切分，多推一次只会虚增 term 频率。

**red/green 斜线**（最终测试文件，同一文件前后各跑一次）：

- red（实现移除）：6 fail / 2 pass。失败的正是「仅 namespace 命中」的 3 个 + 端到端 1 个 + 排序 2 个；两 pass 是缺席断言（今天也确实无命中），符合预期。
- green（实现恢复）：8 pass / 0 fail。包内全量 59 pass / 0 fail，`tsc --build` 无输出（clean）。

**端到端证明**：`search.ts` 加字段这件事有种不成立的失败模式——namespace 没真的从 `pi.getAllTools()` 流到索引，那样单测会绿而真实功能是死的。所以补了一个走 `createToolSearchExtension` 的集成测试：configuration 把 `query_database` 标为 deferred，它的 name/description 都不含查询词，只有 namespace description 是证据，断言 content 逐字 `Loaded tools: query_database.` 且 active 集合变成 `[tool_search, query_database]`。这条同时证明「不改 extension.ts 也够用」。

**测试形状**：全部断言字面量名字（`toEqual(["query_database"])`、content 逐字），不用 `toBeDefined`/`toHaveLength` 这类弱形；缺席断言与存在断言同文件互为背景。

**README**：v2 契约整体换 v3（status 三值、input 判别联合、counts/activation 语义），加 `### Load exact tools by name`（`select:` 语法与全有或全无规则）与 `### Result text` 结果文案表；`ToolSearchScope` 加 namespace，并声明 `ToolNamespace` 对齐 pi 1.0.4、`getAllTools()` 已自带所以无需额外接线。

## 评审反馈（主线程只读复核 + 独立复核）采纳

主线程指出我的 README 与测试有过度承诺，逐条对代码复核后**全部成立**，已改：

1. **BM25 无字段权重**。`searchFields` 只往同一个 token 流里塞字段，score 无字段乘子；等 tf 等长的两篇文档得分相同，排序退到 `localeCompare` 的名字序。所以「自身 description 一定压过 namespace」是假保证 → README 删掉该句，改成「namespace 文本无独立权重，与 name/description 竞争同一套 tf 与长度归一化」。两个排序测试的**标题是错的**（把长度归一化的结果归因到字段优先级），改为陈述真实机制：「名字被索引两次（raw + 下划线换空格）所以压过 namespace-only」「等 tf 下较短的 description 命中压过较长的 namespace-only 命中」。断言不变，只改标题与 README 的因果说法——断言本身此前已实测通过，不是猜的。
2. `counts.registered` 是**scope 内**工具数（`allTools.length`，`allTools = scope.tools()`），不是「every registered tool」→ 已改。
3. `select:` 的 unknown 还包含「已注册但在 scope 外」（`unknown = requested.filter(n => !allToolNames.has(n) || !deferredNames.has(n))`，`allToolNames` 取自 scope）→ README 补上「outside the assigned scope」这一支。
4. `result.ts` 里 select 三个数组是 `readonly string[]`，我的 snippet 写成 `string[]` → 已对齐。
5. `invalid_select` 不只「nothing loadable」：valid+unknown 混合也 invalid（`selectStatus` 先看 `unknown.length > 0`）→ 文案改为「names anything it cannot load, which includes a mix of loadable and unloadable names, or names nothing at all」。
6. `rankedMatches` 在 select 路径只有**实际激活的**名字（`matches: added.map(...)`），不是 requested/executed 全集 → 已改。

未采纳：无。主线程要求「不加新的 ranking weight」——同意，也确实没加；namespace 只是多 3 条文本进同一索引。

## Deviations

- **本地声明 `ToolNamespace` 而非 import**：被钉的 devDependency 是 0.84.2，其 `dist/core/extensions/types.d.ts` 里没有 `ToolNamespace`（只有 `timings.d.ts` 的同名无关形参），而改 `package.json`/devDeps 在本次交付边界之外且被明令禁止。选择「按 pi 1.0.4 逐字段对齐地本地声明」而不是「无证据地兼容 string」，也不加 `namespace?: string | ToolNamespace`。代价：上游将来若改 `ToolNamespace` 形状，这里不会编译报错；缓解是升级 pin 时用 `import type { ToolNamespace } from "@earendil-works/pi-coding-agent"` 替换本地声明（形状已逐字段对齐，替换应为无痛）。
- **docstring 从 4 行压到 1 行**：主线程按 no-comments 指出我首版的 `ToolNamespace` 注释重复了 shape 又过长。改为只留唯一 why 一句（本地声明因 0.84.2 缺该类型）。
- **red 复测时污染了并发观测**：为在「最终测试文件」上重取 red，我临时删掉了 `search.ts` 里那段 push 再恢复。期间主线程跑 `bun run test`，看到 6 fail 误判为回归。已立即恢复并复测 green；教训是主线程可能在任意时刻抽样，源码切换窗口应缩到最小或用 fixture 副本（主线程也给了这条指引）。
- **README 没动包身份**：README 首行与 install 命令仍是上游 `@luan.sh/pi-tool-search`，与 fork 的 `@toRolex/pi-tool-search` 不一致。这不在「v3 契约 + select 用法」范围内，且属于对外身份声明，未擅自改，留作后续任务。

## 未做/边界

不改 `extension.ts`、`definition.ts`、`test/tool-search.test.ts`、`package.json`/lock/devDeps、`~/.pi/agent`；不扩 exposure 支持；不做任何版本控制写操作（无 commit/push/PR）。全仓校验里 `packages/pi-xsettings` 的 `proper-lockfile` TS7016 是已知基线问题，按指令未修；仓库根的 `test/runtime-probes/` 证据目录是另一并发任务的产物，不属于本次范围。
