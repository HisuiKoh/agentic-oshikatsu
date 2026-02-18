# コントリビューションガイド

agentic-oshikatsu へのコントリビューションを歓迎します。

## 開発環境のセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/HisuiKoh/agentic-oshikatsu.git
cd agentic-oshikatsu

# 依存パッケージをインストール
pnpm install

# DB マイグレーション
pnpm db:migrate

# テスト実行
pnpm test

# Lint チェック
pnpm check
```

## 必要環境

- Node.js >= 20.0.0
- pnpm
- Linux / macOS（Windows は WSL2 推奨）

## 開発フロー

1. Issue を確認し、作業するものを選ぶ
2. ブランチを作成: `feat/123-description` or `fix/456-description`
3. 実装 + テスト
4. `pnpm check` と `pnpm test` がパスすることを確認
5. Pull Request を作成

## コミットメッセージ

Conventional Commits 形式を使用してください:

- `feat:` 新機能
- `fix:` バグ修正
- `docs:` ドキュメント
- `refactor:` リファクタリング
- `test:` テスト
- `chore:` その他

## コーディング規約

- TypeScript strict モード
- Biome によるフォーマット・Lint
- Zod によるバリデーション
- `any` 禁止、`as` キャスト原則禁止

## 倫理ガイドライン

コントリビューションの際は [ETHICS.md](./ETHICS.md) を必ずお読みください。
推し活を豊かにし、誰も傷つけないツールであり続けることが最優先です。
