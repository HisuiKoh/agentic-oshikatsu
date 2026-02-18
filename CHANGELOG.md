# Changelog

## [0.1.0] - 2025-02-19

初回リリース。

### 追加

#### 推し管理
- `oshi add` — AI 対話形式での推し登録（あらゆる対象に対応: 人物、キャラ、建築物、鉱物、学問、概念...）
- `oshi list` — 登録済みの推しを一覧表示
- AI による推し候補の自動特定（Web 検索 + AI 推測）
- 手動登録モード（AI 未設定時のフォールバック）

#### 情報収集
- `oshi collect [name]` — 複数情報源からの並列収集
- `oshi info [name]` — 収集済み情報の表示
- `oshi review [name]` — 収集情報の承認/却下
- 情報源プラグイン: Google News, YouTube, Wikipedia, X (旧 Twitter)
- AI による関連度スコアリング・自動承認判定
- 重複検出・スキップ

#### 行動提案
- `oshi suggest [name]` — AI による推し活行動提案の生成
- 提案の自動 Linter 検証
- 提案履歴の保存・表示（`--history`）

#### 推し活 Linter
- `oshi lint [action]` — 行動のリスク評価（PASS / WARN / BLOCK）
- Layer 1: ルールベース検証（予算超過、深夜購入、危険キーワード）
- Layer 2: AI 定性評価（炎上リスク、法的リスク、推しへの悪影響、ファン間軋轢）
- ルールセットのカスタマイズ対応

#### 予算管理
- `oshi budget set` — 予算上限設定（月次/年次、推し活/AI/外部API の 3 タイプ）
- `oshi budget add` — 支出記録
- `oshi budget status` — 予算状況の可視化（プログレスバー、使用率、残額）
- AI 使用コストの自動トラッキング

#### ダッシュボード
- `oshi dashboard` — TUI インタラクティブダッシュボード
- `oshi dashboard --static` — 静的表示モード
- TUI 内スラッシュコマンド対応（`/add`, `/collect`, `/suggest`, `/lint` 等）

#### 認証
- `oshi auth` — AI プロバイダー認証セットアップ
- Claude（CLI プロキシ / API Key / 環境変数）
- Codex（CLI 検出・検証）
- 外部 API（YouTube / X）

#### ユーザープロファイル
- `oshi profile` — パーソナリティ設定（口調、フィードバックスタイル、詳細度、装飾、推し活温度）
- AI 応答のパーソナライズ

#### バックアップ・リストア
- `oshi backup` — DB バックアップ作成（5 世代管理）
- `oshi backup restore` — リストア
- `oshi backup export` / `oshi backup import` — JSON エクスポート・インポート

#### AI コスト管理
- `oshi cost` — プロバイダー別のトークン数・リクエスト数・コスト表示

#### その他
- `oshi init` — 初期セットアップ
- `oshi reset` — 全データリセット（二重確認付き）
- 日本語 / 英語 対応（i18n）
- Discord Webhook 通知（Linter 警告、新規情報取得）
- 引数なし `oshi` で TUI ダッシュボード起動
