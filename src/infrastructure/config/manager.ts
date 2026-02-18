import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError } from "../../shared/errors.js";
import { type Config, ConfigSchema } from "./schema.js";

const APP_DIR_NAME = ".agentic-oshikatsu";
const CONFIG_FILE_NAME = "config.json";
const DB_FILE_NAME = "oshikatsu.db";

export function getAppDir(): string {
	const home = process.env.HOME;
	if (!home) {
		throw new ConfigError("HOME 環境変数が設定されていません");
	}
	return join(home, APP_DIR_NAME);
}

export function getConfigPath(): string {
	return join(getAppDir(), CONFIG_FILE_NAME);
}

export function getDbPath(): string {
	return join(getAppDir(), DB_FILE_NAME);
}

export function isInitialized(): boolean {
	return existsSync(getConfigPath());
}

/** 設定ディレクトリを作成（0700） */
export function ensureAppDir(): void {
	const appDir = getAppDir();
	if (!existsSync(appDir)) {
		mkdirSync(appDir, { recursive: true, mode: 0o700 });
	}
}

/** パーミッション検証（0600 であること） */
function validateFilePermissions(filePath: string): void {
	if (!existsSync(filePath)) return;

	const stat = statSync(filePath);
	const mode = stat.mode & 0o777;
	if (mode !== 0o600) {
		throw new ConfigError(
			`${filePath} のパーミッションが安全ではありません (${mode.toString(8)})。0600 に設定してください。`,
		);
	}
}

/** config.json を書き込み（0600） */
export function writeConfig(config: Config): void {
	const configPath = getConfigPath();
	ensureAppDir();

	const content = JSON.stringify(config, null, "\t");
	writeFileSync(configPath, content, { mode: 0o600 });
}

/** config.json を読み込み + バリデーション */
export function readConfig(): Config {
	const configPath = getConfigPath();

	if (!existsSync(configPath)) {
		throw new ConfigError("設定ファイルが見つかりません。`oshi init` を実行してください。");
	}

	validateFilePermissions(configPath);

	const raw = readFileSync(configPath, "utf-8");
	const parsed = JSON.parse(raw);
	const result = ConfigSchema.safeParse(parsed);

	if (!result.success) {
		const summary = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
		throw new ConfigError(`設定ファイルが不正です: ${summary}`);
	}

	return result.data;
}

/** オブジェクトの深いマージ */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
	const output = { ...target };
	for (const key in source) {
		const sourceVal = source[key];
		const targetVal = output[key];
		if (
			sourceVal &&
			typeof sourceVal === "object" &&
			!Array.isArray(sourceVal) &&
			targetVal &&
			typeof targetVal === "object" &&
			!Array.isArray(targetVal)
		) {
			output[key] = deepMerge(
				targetVal as Record<string, unknown>,
				sourceVal as Record<string, unknown>,
			) as T[Extract<keyof T, string>];
		} else {
			output[key] = sourceVal as T[Extract<keyof T, string>];
		}
	}
	return output;
}

/** config.json を部分更新（深いマージ） */
export function updateConfig(partial: Partial<Config>): Config {
	const current = readConfig();
	const merged = deepMerge(current, partial);
	const validated = ConfigSchema.parse(merged);
	writeConfig(validated);
	return validated;
}

/** 外部 API の設定を削除 */
export function removeExternalApi(api: "youtube" | "x"): void {
	const config = readConfig();
	const { [api]: _, ...restApis } = config.externalApis;
	const updated = { ...config, externalApis: restApis };
	const validated = ConfigSchema.parse(updated);
	writeConfig(validated);
}
