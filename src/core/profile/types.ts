/** パーソナリティ設定の選択肢 */
export type Formality = "casual" | "neutral" | "formal";
export type FeedbackStyle = "gentle" | "balanced" | "strict";
export type DetailLevel = "brief" | "normal" | "detailed";
export type Decoration = "minimal" | "moderate" | "rich";
export type OshiIntensity = "casual" | "moderate" | "intense";

/** ユーザープロファイル */
export interface UserProfile {
	id: string;
	formality: Formality;
	feedbackStyle: FeedbackStyle;
	detailLevel: DetailLevel;
	decoration: Decoration;
	oshiIntensity: OshiIntensity;
	locale: string;
	updatedAt: string;
}
