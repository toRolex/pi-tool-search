# T3 收尾：单 extension + Code Mode / preview 回归测试

## 契约与决策

- 核对 GitHub #2 / #1 与背景笔记 03/04/06。沿用现有 `pnrrlmxq` test change，不修改 presentation / Code Mode 实现。
- 根 manifest 精确单路径断言已完成。扩展测试统一临时 TOML 配置，不再借旧 registry 喂 deferred 名单。
- 扩展 mock 不加载 xsettings / libtui extension host；preview 仍调用既有 libtui 库渲染链。
- Code Mode nested scope 回归按现有实现锁定：作用域内激活不经 directScope.setActive，不进入 activatedBySearch；若后续外层重新激活同名 deferred 工具，before_agent_start 会剪掉。与 direct 搜索激活保留行为区分，避免测试凭空承诺跨 scope 同步。
- 保留同一逻辑 change；最终确认 `spec-1-integration` tip 后建立 `spec-1-t3`，不 push。

## 执行记录

- 首轮测试代理 grok-4.7 因额度耗尽启动失败；临时改用 gpt-6-luna，不更改全局模型配置。
- 子代理清理 registry 喂名单并增强 sibling scope 隔离；父侧补齐五个生命周期用例：TOML + direct select 多轮保留、nested select 隔离/多轮实际边界、reload 释放重建、quit 释放重建、call/result preview。
- SDK dispose 保留空 registry 对象，因此断言 ADAPTERS_KEY 下 adapters.size=0 与 list()=[]，而非要求 Symbol 属性本身消失；未修改 SDK。
- call preview 仅在 executionStarted=false 时显示，测试使用 queued 阶段；结果使用 executionStarted=true。避免把正常的执行阶段空 call shell 当回归。

## 验证

- `bun test packages/pi-tool-search/test`：51 pass / 0 fail。
- `bun test packages/pi-xsettings/test`：110 pass / 0 fail。
- 根 `bun test`：161 pass / 0 fail，14 files，549 assertions。
- 差异仅根 manifest、扩展测试、当前笔记；无 node_modules 或源码改动。
- 父级 `spec-1-integration` 仍为 938aafc8，无需 rebase。

## Deviations

无实现偏离。已知 nested scope 边界按用户要求记录真实行为，不修复或扩大本票范围。
