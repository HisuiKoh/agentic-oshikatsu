import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { getAppDir } from "../../infrastructure/config/manager.js";
import { logger } from "../../shared/logger.js";
import { type LintConfig, LintConfigSchema } from "./types.js";

const LINT_CONFIG_FILE = ".oshilintrc.yaml";

/** .oshilintrc.yaml のパスを取得 */
export function getLintConfigPath(): string {
	return join(getAppDir(), LINT_CONFIG_FILE);
}

/** .oshilintrc.yaml を読み込み。ファイルがなければデフォルト設定を返す */
export function loadLintConfig(): LintConfig {
	const configPath = getLintConfigPath();

	if (!existsSync(configPath)) {
		logger.debug(".oshilintrc.yaml が見つかりません。デフォルト設定を使用します");
		return LintConfigSchema.parse({});
	}

	const raw = readFileSync(configPath, "utf-8");
	const parsed = parse(raw);
	const result = LintConfigSchema.safeParse(parsed);

	if (!result.success) {
		const summary = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
		logger.warn(`.oshilintrc.yaml のバリデーションエラー: ${summary}`);
		logger.warn("デフォルト設定にフォールバックします");
		return LintConfigSchema.parse({});
	}

	return result.data;
}
