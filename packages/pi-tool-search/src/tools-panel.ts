import { getSelectListTheme, getSettingsListTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, SettingsList, type SettingItem } from "@earendil-works/pi-tui";

const DIRECT = "[x] direct";
const DEFERRED = "[ ] deferred";

export interface ToolsPanelPolicy {
	tools(): readonly { name: string; readOnlyReason?: string; observedState?: string }[];
	refresh(): readonly string[];
	setDeferred(name: string, deferred: boolean): readonly string[];
}

export function registerToolsPanel(pi: ExtensionAPI, policy: ToolsPanelPolicy): void {
	pi.registerCommand("tools", {
		description: "Persist direct/deferred tool policy (not disable)",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/tools requires TUI mode", "error");
				return;
			}
			let deferred: Set<string>;
			try {
				deferred = new Set(policy.refresh());
			} catch (error) {
				ctx.ui.notify(`Cannot open /tools: ${String(error)}`, "error");
				return;
			}
			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				const items: SettingItem[] = [...policy.tools()]
					.sort((a, b) => a.name.localeCompare(b.name))
					.map(({ name, readOnlyReason, observedState }): SettingItem => {
						if (readOnlyReason) {
							return {
								id: name,
								label: name,
								currentValue: `${observedState} (readonly)`,
								description: readOnlyReason,
							};
						}
						return {
							id: name,
							label: name,
							currentValue: deferred.has(name) ? DEFERRED : DIRECT,
							description: "Persist policy immediately. Choosing deferred again unloads a search-loaded tool.",
							submenu: (current, select) => {
								const choices = new SelectList(
									[
										{ value: DIRECT, label: DIRECT },
										{ value: DEFERRED, label: DEFERRED },
									],
									2,
									getSelectListTheme(),
								);
								choices.setSelectedIndex(current === DEFERRED ? 1 : 0);
								choices.onSelect = (item) => select(item.value);
								choices.onCancel = () => select();
								return choices;
							},
						};
					});
				const list = new SettingsList(
					items,
					Math.min(items.length + 2, 15),
					getSettingsListTheme(),
					(id, value) => {
						const previous = deferred.has(id) ? DEFERRED : DIRECT;
						try {
							deferred = new Set(policy.setDeferred(id, value === DEFERRED));
							for (const item of items) {
								if (item.submenu) list.updateValue(item.id, deferred.has(item.id) ? DEFERRED : DIRECT);
							}
						} catch (error) {
							// SettingsList mutates its value before onChange, so throwing alone cannot roll back UI.
							list.updateValue(id, previous);
							ctx.ui.notify(`Cannot save /tools: ${String(error)}`, "error");
						}
					},
					() => done(),
				);
				const container = new Container();
				container.addChild({
					render: () => [theme.fg("accent", theme.bold("Tool policy — persistent direct / deferred")), ""],
					invalidate() {},
				});
				container.addChild(list);
				return {
					render: (width: number) => container.render(width),
					invalidate: () => container.invalidate(),
					handleInput(data: string) {
						list.handleInput(data);
						tui.requestRender();
					},
				};
			});
		},
	});
}
