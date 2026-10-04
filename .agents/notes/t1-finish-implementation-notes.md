# T1 收尾记录

## 保留设计

- 保留 `readDeferredTools` / `parseDeferredTools` 分层与可注入 `configPath` 的 extension 工厂。
- 配置在初始化时读取；`session_start` 只初始化工具作用域，不恢复 xsettings options 重建和订阅。

## 依赖与快照

- 根目录声明测试依赖，Pi 固定 0.84.2：匹配 vendored pi-libtui，不升级到不兼容版本。
- `smol-toml` 是包的直接 runtime dependency；根 devDependency 使当前非 workspace 布局可直接执行测试。
- 忽略 `node_modules/`；只取消跟踪本次新增文件，恢复原有 vendored 文件到父级，避免 bun install 改写既有快照。
- 仓库此前无 lockfile，`bun.lock` 保留本地并忽略，不引入新锁文件策略。
- 新增依赖文件已排除，按任务允许的单 change 路径，将依赖声明、ignore 与 T1 主体一起整理为 feat；父级保留 `spec-1-integration`。

## 验证

- 完整 `bun test --only-failures test`：tool-search 36 pass / 0 fail（78 expects，1 文件）；xsettings 110 pass / 0 fail（389 expects，13 文件）。
- 验证在恢复 vendored deps 后运行；所有 node_modules 与 integration 父级无差异，bun.lock 未入库。
- 旧 options 断言替换为零 xsettings 注册/订阅；新增初始化配置快照、缺失文件/键、非数组与非 ENOENT 错误测试。

## Deviations

- 无 T1 行为设计偏离；测试更新为新外部契约，而非恢复旧 registry 链。
- 完整 xsettings 回归暴露既有兼容问题：Pi 0.84.2 的 `pi.on` 无 unsubscribe 返回值，但 actions cleanup 无条件调用。授权最小兼容修复与回归测试，避免靠测试掩盖实际异常。
- actions 测试硬编码 package-local Pi loader 路径，在根 devDependencies 布局下无法解析；改为从实际解析的 Pi entry 定位相邻 loader。
