import { DEFAULT_CONFIG } from "../../../infrastructure/config/defaults.js";
import {
	ensureAppDir,
	getConfigPath,
	getDbPath,
	isInitialized,
	writeConfig,
} from "../../../infrastructure/config/manager.js";
import { runMigrate } from "../../../infrastructure/db/run-migrate.js";

/** 初期化が必要かどうか判定 */
export function needsInit(): boolean {
	return !isInitialized();
}

/** ディレクトリ・DB・config を自動作成 */
export function runInit(): { configPath: string; dbPath: string } {
	ensureAppDir();

	const dbPath = getDbPath();
	runMigrate(dbPath);

	writeConfig(DEFAULT_CONFIG);

	return { configPath: getConfigPath(), dbPath };
}
