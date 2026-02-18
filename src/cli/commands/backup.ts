import * as p from "@clack/prompts";
import { exportToFile, importFromFile } from "../../core/backup/export.js";
import { createBackup, listBackups, restoreBackup } from "../../core/backup/service.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";
import { t } from "../../shared/i18n/i18n.js";

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function execute(args: string[]): Promise<void> {
	p.intro(t("backup.title"));

	if (!isInitialized()) {
		p.log.error(t("common.notInitialized"));
		return;
	}

	const subcommand = args[0];

	if (!subcommand || subcommand === "create") {
		const result = createBackup();
		p.log.success(t("backup.created", { name: result.name }));
		p.outro("");
		return;
	}

	if (subcommand === "list") {
		const backups = listBackups();
		if (backups.length === 0) {
			p.log.info(t("backup.noBackups"));
		} else {
			for (const backup of backups) {
				const date = backup.createdAt.toISOString().slice(0, 19).replace("T", " ");
				p.log.info(`${backup.name}  ${date}  ${formatSize(backup.size)}`);
			}
		}
		p.outro("");
		return;
	}

	if (subcommand === "restore") {
		const backupPath = args[1];
		if (!backupPath) {
			// バックアップ一覧から選択
			const backups = listBackups();
			if (backups.length === 0) {
				p.log.error(t("backup.noBackups"));
				p.outro("");
				return;
			}

			const selected = await p.select({
				message: t("backup.selectBackup"),
				options: backups.map((b) => ({
					value: b.path,
					label: b.name,
					hint: b.createdAt.toISOString().slice(0, 19).replace("T", " "),
				})),
			});

			if (p.isCancel(selected)) {
				p.outro(t("common.cancel"));
				return;
			}

			const confirm = await p.confirm({
				message: t("backup.restoreConfirm"),
				initialValue: false,
			});

			if (p.isCancel(confirm) || !confirm) {
				p.outro(t("common.cancel"));
				return;
			}

			restoreBackup(selected);
			p.log.success(t("backup.restored"));
		} else {
			restoreBackup(backupPath);
			p.log.success(t("backup.restored"));
		}
		p.outro("");
		return;
	}

	if (subcommand === "export") {
		const filePath = args[1] ?? "oshikatsu-export.json";
		const db = getDb(getDbPath());
		exportToFile(db, filePath);
		p.log.success(t("backup.exported", { path: filePath }));
		p.outro("");
		return;
	}

	if (subcommand === "import") {
		const filePath = args[1];
		if (!filePath) {
			p.log.error(t("backup.importPathRequired"));
			p.log.info(t("backup.importUsage"));
			p.outro("");
			return;
		}

		const confirm = await p.confirm({
			message: t("backup.importConfirm"),
			initialValue: false,
		});

		if (p.isCancel(confirm) || !confirm) {
			p.outro(t("common.cancel"));
			return;
		}

		const db = getDb(getDbPath());
		const result = importFromFile(db, filePath);
		p.log.success(t("backup.imported", { count: String(result.imported) }));
		p.outro("");
		return;
	}

	p.log.error(t("backup.unknownSubcommand", { command: subcommand }));
	p.log.info(t("backup.usage"));
	p.outro("");
}
