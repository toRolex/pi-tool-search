import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Static, TSchema } from "typebox";
import type { SettingValue } from "../protocol/settings.ts";

interface TypeboxSchemaModule {
	Check(schema: TSchema, value: SettingValue): boolean;
}

// type-boundary: createRequire returns an untyped CommonJS namespace; isTypeboxSchemaModule validates its one used export.
function isTypeboxSchemaModule(value: unknown): value is TypeboxSchemaModule {
	return typeof value === "object" && value !== null && "Check" in value && typeof value.Check === "function";
}

function loadSchemaModule(): TypeboxSchemaModule {
	const localRequire = createRequire(realpathSync(fileURLToPath(import.meta.url)));
	// typebox/value, not typebox/schema: Pi's extension module map covers only
	// the root, /compile, and /value specifiers, so a git install (where no
	// vendored hoisted copy exists) cannot resolve typebox/schema.
	const loaded: unknown = localRequire("typebox/value");
	if (!isTypeboxSchemaModule(loaded)) throw new Error("typebox/value does not export Check().");
	return loaded;
}

const schemaModule = loadSchemaModule();

export function checkSchema<const Schema extends TSchema>(
	schema: Schema,
	value: SettingValue,
): value is SettingValue & Static<Schema> {
	return schemaModule.Check(schema, value);
}
