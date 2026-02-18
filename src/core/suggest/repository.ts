import { desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import { suggestions } from "../../infrastructure/db/schema.js";
import { generateId } from "../../shared/id.js";
import type { GeneratedSuggestion, SuggestContext } from "./generator.js";

/** DB に保存された提案 */
export interface SavedSuggestion {
	id: string;
	oshiId: string;
	category: string | null;
	content: string;
	context: SuggestContext | null;
	createdAt: string;
}

export class SuggestionRepository {
	constructor(private db: AppDatabase) {}

	/** 提案を保存 */
	save(oshiId: string, suggestion: GeneratedSuggestion, context: SuggestContext): string {
		const id = generateId();
		const now = new Date().toISOString();

		this.db
			.insert(suggestions)
			.values({
				id,
				oshiId,
				category: suggestion.category,
				content: suggestion.content,
				context: context as unknown as Record<string, unknown>,
				createdAt: now,
			})
			.run();

		return id;
	}

	/** 推しの提案履歴を取得 */
	findByOshiId(oshiId: string, options?: { limit?: number }): SavedSuggestion[] {
		let query = this.db
			.select()
			.from(suggestions)
			.where(eq(suggestions.oshiId, oshiId))
			.orderBy(desc(suggestions.createdAt))
			.$dynamic();

		if (options?.limit) {
			query = query.limit(options.limit);
		}

		return query.all() as SavedSuggestion[];
	}

	/** ID で提案を取得 */
	findById(id: string): SavedSuggestion | undefined {
		return this.db.select().from(suggestions).where(eq(suggestions.id, id)).get() as
			| SavedSuggestion
			| undefined;
	}
}
