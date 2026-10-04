# T2 收尾记录

## 契约与修复方向

- 接续已有 `pvstmlms` change，不重建任务历史；迁移在扩展读取初始化快照前执行。
- 新文件存在性不能用内容是否为空判断；空文件也是用户的权威配置。
- 迁移只写 `tools.deferred`，不能把 appearance、behavior 或 `pi.defaultTools` 带入新文件。
- 已有新文件时也清理旧 `[tools]`，保持唯一来源；仅在新文件落盘成功或原已存在后清理。
- 失败须保留可恢复状态，并用明确错误指出重试动作。

## 依赖与版本控制

- 先执行根目录 `bun install`，与 T1 的根 devDependencies 保持一致。
- `node_modules/` 的 ignore 不会屏蔽历史已跟踪的 typebox 文件；安装后这些文件确实产生快照差异。最终恢复这部分到 integration 父级，避免把依赖快照污染混入迁移 feat。
- 工作目录实际是 jj workspace，共享主仓库 colocated repo；身份基准从主仓库 Git 配置读取，与 jj 作者一致。

## 实现与验证

- 旧 xsettings 的未加引号 dotted key 实际解析成嵌套对象；同时兼容带引号的 literal key，避免仅测试错误 fixture 导致真实升级丢名单。
- 清理使用 TOML parse/delete/stringify，不用按行正则；可处理 quoted header、多行值与 tools 子表。保留其他段的配置值，格式与注释可能重写。
- 默认写入在同目录 staging，写完 fsync 后用无覆盖 link 发布新配置；旧文件清理用 rename 原子替换。避免磁盘写失败留下部分新文件而使下次重试错误删旧名单。
- 注入迁移读写 seam 做确定性失败测试；测试全部临时目录，25 项按集合核对，扩展实际 deferral 按已注册交集验证。
- 独立完整 `bun test --only-failures`：tool-search 45 pass / 0 fail（111 expects，1 文件）；xsettings 110 pass / 0 fail（389 expects，13 文件）。恢复历史依赖快照后测试仍全绿。

## Deviations

- 实现代理 Grok 余额不足，替换成诊断/修复角色模型；不改变契约。
