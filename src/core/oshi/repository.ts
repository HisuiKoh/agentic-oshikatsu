import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "../../infrastructure/db/connection.js";
import { oshiAttributes, oshis } from "../../infrastructure/db/schema.js";
import { DatabaseError, ValidationError } from "../../shared/errors.js";
import { generateId } from "../../shared/id.js";
import type { Oshi, OshiAttribute, OshiCategory } from "./types.js";

export interface CreateOshiInput {
	name: string;
	category: OshiCategory;
	subcategory?: string;
	description?: string;
	attributes?: Array<{ key: string; value: string }>;
}

/** LIKE ワイルドカード文字をエスケープ */
function escapeLikePattern(value: string): string {
	return value.replace(/[%_\\]/g, "\\$&");
}

export class OshiRepository {
	constructor(private db: AppDatabase) {}

	/** 推しを作成（属性も同時に保存、トランザクション） */
	create(input: CreateOshiInput): Oshi {
		if (input.attributes) {
			const keys = input.attributes.map((a) => a.key);
			if (keys.length !== new Set(keys).size) {
				throw new ValidationError("属性キーが重複しています");
			}
		}

		const id = generateId();
		const now = new Date().toISOString();

		const oshi: Oshi = {
			id,
			name: input.name,
			category: input.category,
			subcategory: input.subcategory ?? null,
			description: input.description ?? null,
			registeredAt: now,
		};

		try {
			this.db.transaction((tx) => {
				tx.insert(oshis).values(oshi).run();

				if (input.attributes?.length) {
					const attrs = input.attributes.map((attr) => ({
						id: generateId(),
						oshiId: id,
						key: attr.key,
						value: attr.value,
					}));
					tx.insert(oshiAttributes).values(attrs).run();
				}
			});
		} catch (error) {
			if (error instanceof ValidationError) throw error;
			throw new DatabaseError("推しの登録に失敗しました", error);
		}

		return oshi;
	}

	/** 全推しを取得 */
	findAll(): Oshi[] {
		return this.db.select().from(oshis).all() as Oshi[];
	}

	/** ID で推しを取得 */
	findById(id: string): Oshi | undefined {
		return this.db.select().from(oshis).where(eq(oshis.id, id)).get() as Oshi | undefined;
	}

	/** 名前で推しを検索（前方一致） */
	findByName(name: string): Oshi[] {
		const escaped = escapeLikePattern(name);
		return this.db
			.select()
			.from(oshis)
			.where(sql`${oshis.name} LIKE ${`${escaped}%`} ESCAPE '\\'`)
			.all() as Oshi[];
	}

	/** 推しの属性を取得 */
	getAttributes(oshiId: string): OshiAttribute[] {
		return this.db.select().from(oshiAttributes).where(eq(oshiAttributes.oshiId, oshiId)).all();
	}

	/** 推しの情報を更新 */
	update(
		id: string,
		data: Partial<Pick<Oshi, "description" | "category" | "subcategory">>,
	): boolean {
		const result = this.db.update(oshis).set(data).where(eq(oshis.id, id)).run();
		return result.changes > 0;
	}

	/** 推しを削除（CASCADE で属性も削除） */
	delete(id: string): boolean {
		const result = this.db.delete(oshis).where(eq(oshis.id, id)).run();
		return result.changes > 0;
	}
}
