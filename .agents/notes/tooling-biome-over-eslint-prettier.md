# Tooling: biome over eslint+prettier

- 2026-10-05：triage 来源不明的工作副本改动时确认，14:32–14:43 窗口内先后出现过两套格式化方案。
- 磁盘遗留 `eslint.config.mjs`（typescript-eslint recommendedTypeChecked + eslint-config-prettier）与 root node_modules 里的 prettier，属于被放弃的 ESLint 尝试。
- 最终选型 biome 2.5.10：`biome.json`（tab/120/linter recommended）+ 根 `package.json` scripts（format/check:format/lint/typecheck/test/check）。
- scripts 与 biome.json 覆盖 `packages/pi-*/{src,test}/**/*.ts`，与 eslint 配置目标重叠，二者取一；保留 biome，删除 eslint.config.mjs（原内容可在 ylkwuspy 的 evolog 历史中找回）。
