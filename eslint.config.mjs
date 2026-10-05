// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: ["**/node_modules/**", "package-lock.json"],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ["packages/pi-*/src/**/*.ts", "packages/pi-*/test/**/*.ts"],
	})),
	{
		files: ["packages/pi-*/src/**/*.ts", "packages/pi-*/test/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// 渐进采用（2026-10-05）：首轮接入先关闭以下规则，清理存量后逐批收紧。
			// no-unsafe-*（134 处存量）：动态配置/设置存储里大量合法 any，待引入边界类型后开启。
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			// require-await（7 处）：pi 工具接口强制 async 签名，await 与否不由实现决定。
			"@typescript-eslint/require-await": "off",
			// unbound-method（15 处）：测试里按引用传 mock 方法是惯用法。
			"@typescript-eslint/unbound-method": "off",
			// no-base-to-string（5 处）：设置 UI 有意对未知值做字符串化，需逐处确认后开启。
			"@typescript-eslint/no-base-to-string": "off",
			// no-redundant-type-constituents（2 处）：vendored typebox 的 Static<T> 解析为 error type 的伪影。
			"@typescript-eslint/no-redundant-type-constituents": "off",
		},
	},
	eslintConfigPrettier,
);
