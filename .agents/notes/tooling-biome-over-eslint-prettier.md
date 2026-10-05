# Tooling: biome over eslint+prettier

- 2026-10-05：triage 来源不明的工作副本改动时确认，14:32–14:43 窗口内先后出现过两套格式化方案。
- 磁盘遗留 `eslint.config.mjs`（typescript-eslint recommendedTypeChecked + eslint-config-prettier）与 root node_modules 里的 prettier，属于被放弃的 ESLint 尝试。
- 最终选型 biome 2.5.10：`biome.json`（tab/120/linter recommended）+ 根 `package.json` scripts（format/check:format/lint/typecheck/test/check）。
- scripts 与 biome.json 覆盖 `packages/pi-*/{src,test}/**/*.ts`，与 eslint 配置目标重叠，二者取一；保留 biome，删除 eslint.config.mjs（原内容可在 ylkwuspy 的 evolog 历史中找回）。

## 最终裁决（2026-10-05 15:3x，用户拍板，覆盖上文结论）

上文"最终选型 biome"**作废**。14:32–14:43 的"来源不明改动"实为另一个 pi session（w64:p3，retro tab）在执行用户刚拍板的方案 A；本 session（w64:p1J，warning tab）按 handoff 文档 triage 时误判为无主改动并恢复 biome。两个 session 已通过 herdr 点对点协调，本 session 已停止 tooling 改动并退出仓库工作。

**用户决策：formatter = Prettier，lint = ESLint flat + typescript-eslint（type-aware）**，落地状态：

- Prettier 3.9.9（tab/120/双引号/分号，`.prettierrc.json`），lint = eslint 10.12.0 + typescript-eslint 8.71.0（`recommendedTypeChecked` + `projectService`）+ eslint-config-prettier；TS6 兼容性已核实（peer `>=4.8.4 <6.1.0`）。
- 渐进采用首轮关闭（见 `eslint.config.mjs` 内注释，逐批收紧的 TODO）：`no-unsafe-*` ×5（134 处存量 any）、`require-await`（接口强制 async）、`unbound-method`（测试传方法引用）、`no-base-to-string`（5 处需逐处确认）、`no-redundant-type-constituents`（vendored typebox `Static<T>` error-type 伪影）。
- 保留的 type-aware 规则抓到并修复：`no-unnecessary-type-assertion` ×23（`--fix`）；`await-thenable` ×1（`@types/bun` 的 `expect().rejects` 类型伪影，行内禁用注明）。
- 上游对照：luan/agents 用 Biome 2.5.10；用户在知情下选择 Prettier+ESLint（偏好优先）。
- 遗留：`pi-lens` ast-grep 规则 `no-unknown-laundering` 对 `settings.ts:128` 的 `type UntrustedRegistryValue = unknown` 误报——那是带注释的信任边界（Symbol.for 跨 realm 数据先 unknown 再 isRegistry 验证），有意为之。
