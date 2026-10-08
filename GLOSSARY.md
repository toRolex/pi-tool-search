# Tool Search

本扩展管理 assigned direct scope 内工具的持久 direct/deferred 策略。持久策略、宿主的工具暴露类型和当前声明状态是不同概念。

## Language

**Assigned direct scope（管理范围）**：
宿主分配给本扩展的 direct 工具范围；只有范围内工具的持久策略可由本扩展调整。

**Tool policy（工具策略）**：
受管工具的持久 direct/deferred 选择，是后续会话的初始策略，不等于当前 active 状态。
_Avoid_: enabled/disabled 开关、session-only 状态

**direct**：
受管工具的持久常驻声明策略，而非宿主 exposure 字段或对任意时刻 active 状态的保证。

**deferred**：
受管工具的持久按需加载策略，默认隐藏声明但保留 `tool_search` 发现与加载能力。搜索加载后可在当前会话保持 active；明确再次选择 deferred 会撤销加载状态，新会话按持久策略重新开始。
_Avoid_: disabled、能力禁用

**Host exposure（宿主暴露类型）**：
宿主为工具定义的暴露类型，与本扩展的持久工具策略不同；本扩展不接管原生 deferred/codemode 等范围外工具。

**active（当前声明状态）**：
工具当前出现在模型 tool declarations 中的状态；deferred 工具被搜索加载后也可以是 active。
_Avoid_: 将 active 等同于持久 direct 策略

**disabled**：
由 Pi 或工具所有者负责的彻底不可用状态，不属于本扩展的策略管理；deferred 保留能力，disabled 移除能力。

**Toggle（策略选择）**：
对受管工具显式选择 direct 或 deferred，选择会持久化到 `tool-search.toml`，没有 session-only 模式。也可再次选择当前策略，例如显式卸载已加载的 deferred 工具。
_Avoid_: 仅在两个值间反转的开关

**Tool panel（工具面板）**：
`/tools` 打开的交互面板，受管项显示持久策略，范围外项显示可观测状态与只读原因。成功选择即持久化并同步当前声明，无需 `/reload`；显示 deferred 不代表工具此刻未加载。
