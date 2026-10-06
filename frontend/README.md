# 秘湯ナビ フロントエンド

React 19 / TypeScript / Vite / Tailwind CSSで作った温泉検索UIです。
全体構成・検索方式・制約・AI支援・Docker起動は[ルートREADME](../README.md)を参照してください。

```powershell
npm ci
npm run dev
npm run build
npm run lint
```

開発URLは `http://127.0.0.1:5173`。`/api` は `http://localhost:8000` へプロキシします。
`TopPage.tsx` が検索入力と候補表示、`OnsenDetailTestPage.tsx` が公開詳細ページを担当します。
`/search-test` は開発モード限定の公開検索API確認用画面です。管理画面は提供しません。

全体lintにはTopPageの既存エラーが残っています。ビルド成功とlint成功を区別してください。
人数・宿泊日・比較・お気に入り等にはデモ動作や未実装部分があります。
