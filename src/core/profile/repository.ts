import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../infrastructure/db/schema.js";
import { generateId } from "../../shared/id.js";
import type { UserProfile } from "./types.js";

export class ProfileRepository {
	constructor(private db: BetterSQLite3Database<typeof schema>) {}

	/** プロファイルを取得（存在しなければ undefined） */
	get(): UserProfile | undefined {
		const rows = this.db.select().from(schema.userProfile).limit(1).all();
		if (rows.length === 0) return undefined;
		const row = rows[0];
		return {
			id: row.id,
			formality: row.formality as UserProfile["formality"],
			feedbackStyle: row.feedbackStyle as UserProfile["feedbackStyle"],
			detailLevel: row.detailLevel as UserProfile["detailLevel"],
			decoration: row.decoration as UserProfile["decoration"],
			oshiIntensity: row.oshiIntensity as UserProfile["oshiIntensity"],
			locale: row.locale,
			updatedAt: row.updatedAt,
		};
	}

	/** プロファイルを作成または更新 */
	upsert(profile: Omit<UserProfile, "id" | "updatedAt">): UserProfile {
		const existing = this.get();
		const now = new Date().toISOString();

		if (existing) {
			this.db
				.update(schema.userProfile)
				.set({
					formality: profile.formality,
					feedbackStyle: profile.feedbackStyle,
					detailLevel: profile.detailLevel,
					decoration: profile.decoration,
					oshiIntensity: profile.oshiIntensity,
					locale: profile.locale,
					updatedAt: now,
				})
				.where(eq(schema.userProfile.id, existing.id))
				.run();
			return { ...existing, ...profile, updatedAt: now };
		}

		const id = generateId();
		this.db
			.insert(schema.userProfile)
			.values({
				id,
				formality: profile.formality,
				feedbackStyle: profile.feedbackStyle,
				detailLevel: profile.detailLevel,
				decoration: profile.decoration,
				oshiIntensity: profile.oshiIntensity,
				locale: profile.locale,
				updatedAt: now,
			})
			.run();

		return { id, ...profile, updatedAt: now };
	}
}
