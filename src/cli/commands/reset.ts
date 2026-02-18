import { existsSync, rmSync } from "node:fs";
import * as p from "@clack/prompts";
import { getAppDir, isInitialized } from "../../infrastructure/config/manager.js";
import { closeDb } from "../../infrastructure/db/connection.js";
import { t } from "../../shared/i18n/i18n.js";

export async function execute(_args: string[]): Promise<void> {
	p.intro(t("reset.title"));

	const appDir = getAppDir();

	if (!isInitialized() && !existsSync(appDir)) {
		p.log.info(t("reset.notInitialized"));
		p.outro("");
		return;
	}

	p.log.warn(t("reset.warning", { path: appDir }));
	p.log.warn(t("reset.warningDetail"));

	const confirm = await p.confirm({
		message: t("reset.confirm"),
		initialValue: false,
	});

	if (p.isCancel(confirm) || !confirm) {
		p.outro(t("common.cancel"));
		return;
	}

	// 二重確認
	const doubleConfirm = await p.text({
		message: t("reset.doubleConfirm"),
		validate: (value) => {
			if (value?.trim() !== "reset") return t("reset.doubleConfirmError");
		},
	});

	if (p.isCancel(doubleConfirm)) {
		p.outro(t("common.cancel"));
		return;
	}

	// DB 接続を閉じてから削除
	closeDb();
	rmSync(appDir, { recursive: true, force: true });

	p.log.success(t("reset.complete", { path: appDir }));
	p.outro(t("reset.reinit"));
}
