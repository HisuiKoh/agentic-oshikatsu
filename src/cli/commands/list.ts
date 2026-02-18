import * as p from "@clack/prompts";
import { OshiRepository } from "../../core/oshi/repository.js";
import { CATEGORY_LABELS, type OshiCategory } from "../../core/oshi/types.js";
import { getDbPath, isInitialized } from "../../infrastructure/config/manager.js";
import { getDb } from "../../infrastructure/db/connection.js";
import { getLocale, t } from "../../shared/i18n/i18n.js";

export async function execute(_args: string[]): Promise<void> {
	p.intro(t("list.title"));

	if (!isInitialized()) {
		p.log.error(t("common.notInitialized"));
		return;
	}

	const db = getDb(getDbPath());
	const repo = new OshiRepository(db);
	const allOshis = repo.findAll();

	if (allOshis.length === 0) {
		p.log.info(t("list.empty"));
		p.outro("");
		return;
	}

	const locale = getLocale() === "en" ? "en-US" : "ja-JP";

	for (const oshi of allOshis) {
		const categoryLabel = CATEGORY_LABELS[oshi.category as OshiCategory] ?? oshi.category;
		const attrs = repo.getAttributes(oshi.id);

		const lines = [
			`${t("list.name")}: ${oshi.name}`,
			`${t("list.category")}: ${categoryLabel}`,
			oshi.description ? `${t("list.description")}: ${oshi.description}` : "",
			`${t("list.registeredAt")}: ${new Date(oshi.registeredAt).toLocaleDateString(locale)}`,
			attrs.length > 0
				? `${t("list.attributes")}: ${attrs.map((a) => `${a.key}=${a.value}`).join(", ")}`
				: "",
		]
			.filter(Boolean)
			.join("\n");

		p.note(lines, oshi.name);
	}

	p.outro(t("list.count", { count: String(allOshis.length) }));
}
