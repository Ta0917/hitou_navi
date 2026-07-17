# Handoff

Use this as the first message/context for the next Claude Code or Codex session.

## Current Summary

秘湯ナビ（hitou_navi）プロジェクト。バックエンド（DB・埋め込み検索・タグ承認フロー）は
実装・検証済み。フロントエンドは検索ロジック確認用の使い捨てページ（`/admin/search-test`等）
のみで、本番のトップページ（`frontend/src/pages/TopPage.tsx`）への検索UI統合はまだ手つかず。
次にこのプロジェクトを触るのはCodexの想定（Claude Code側の作業はここで一旦終了）。

**このセッションで`CLAUDE.md`/`AGENTS.md`にセッション運用プロトコルを追加した**（D-008）。
両ファイルの冒頭を必ず確認すること。要旨：セッション開始時に`agent-sync`4ファイルを自動で読む、
ユーザーの明示指示時も読み直す、セッション内10応答ごとに`git status`/`git diff`と`agent-sync`を
突き合わせて食い違いがあれば書き込む。ただし利用量・残り時間を検知するAPIは無いため、これは
LLMの指示追従に依存する仕組みであり、ハード強制（hooks等）ではないことをユーザーに伝達済み。

---

## Codexが次回作業を始めるときの入口

### 1. 最初に読むべきファイル（この順で）

0. `AGENTS.md`（プロジェクトルート、冒頭の「セッション運用プロトコル」節）— これがCodexにとっての
   セッション開始手順そのもの。読んだら、そこに書かれた手順（agent-sync 4ファイルを読む等）を実行する。
1. `agent-sync/SESSION_STATE.md` — 現在の状態ダッシュボード
2. `agent-sync/DECISIONS.md` — D-000〜D-008（特にD-005「TOP3 vs 全件」とD-007「AGENTS.md運用」・
   D-008「セッション運用プロトコル」は要確認）
3. `agent-sync/WORKLOG.md` — 直近の実装ログ
4. 本ファイルの続き（この下）
5. `AGENTS.md`（プロジェクトルート）— Codex向け技術メモ。内容は`CLAUDE.md`と同一のはず（D-007でA案採用、二重管理する運用）。乖離していたら`git log`で新しい方を確認し、古い方に反映すること
6. Obsidian参照ドキュメント：
   `C:\Users\wakta\OneDrive\ドキュメント\Obsidiandirectory\Obsidian_directory\情報科学総合演習A\SEARCH_DESIGN.md`（検索UI・チップ設計の思想）
   同フォルダの`UI_DESIGN.md`（詳細ページ構成）

### 2. 次に触るべき実装箇所

**最優先タスク**：`frontend/src/pages/TopPage.tsx`に検索UIを実装し、`POST /search`（`backend/app/main.py`）
に接続する。

現状の`TopPage.tsx`は以下まで実装済み（コードを直接参照すること）：
- ヒーロー背景・ヘッダー・縦書きコピー：完成
- 日帰り/宿泊トグル：`tripType` state（`'dayTrip' | 'stay' | null'`）で管理、UIは完成しているが
  **まだ`/search`のリクエストボディ（`trip_type: 'day_trip' | 'stay'`）に変換して渡していない**
  （文字列の型が微妙に違う点に注意：フロントは`dayTrip`/`stay`、APIは`day_trip`/`stay`）
- コア入力欄：`core` state で管理済み、`maxLength={26}`
- 「探すボタン」：`onClick={() => {/* 検索実行処理 */}}` が**空実装**。ここに`/search`呼び出しを書く
- 「PC用オーバーレイ3種」「選択済みチップ表示エリア」：空のdivのみ、中身は未実装
- 追加チップ（`active` state, `addNormal`/`removeNormal`関数）は用意されているが、UIとしては
  まだ何も描画していない

参考実装として`frontend/src/pages/SearchTestPage.tsx`に、`/api/search`への axios.post呼び出し方・
レスポンス型（`SearchResponse` = `{results, matched_tags, body_queries, name_matched_slugs}`）の
実例がある。本番実装はこれをそのままコピーせず、`SEARCH_DESIGN.md`のチップUI思想
（コア由来タグは表示しない、選択済みチップのみ表示、等）に沿って作り直すこと。

### 3. TopPage統合で注意すべき既存実装

- **`/search`はTOP3ではなく全件返す**（D-005）。本番トップページで本当に全件出すのか、
  TOP3表示に戻すのか未決定。`TopPage.tsx`はSEARCH_DESIGN.md準拠でTOP3想定のUIになっている
  可能性が高いので、ここで矛盾が出たら`DECISIONS.md`に追記して判断すること。
- **コアキーワードの2段階処理はバックエンドで完結**：フロントは`core`（生の文字列）と
  `tag_ids`（チップで選んだタグのtag_id配列）を送るだけでよい。タグ変換・本文振り分けは
  `search_onsens()`が担当するので、フロント側でキーワード解析ロジックを再実装しないこと。
- **施設名一致はブースト方式**（D-004）。フィルタとして除外はしないので、UIで「0件」表示に
  なるのはタグ/地域/予算/trip_typeのハードフィルタが原因であって、施設名の綴りミスが原因では
  ない、という前提で挙動を説明できるようにしておく。
- **`trip_type`の値の対応**：フロント`tripType`が`'dayTrip'`のとき→API`trip_type: 'day_trip'`、
  `'stay'`のとき→`'stay'`、`null`のとき→送らない（`undefined`/`null`）。命名の揺れに注意。
- **予算・滞在チップ**はSEARCH_DESIGN.mdの設計上「特殊チップ」（値を伴う）だが、現行の
  `tags`テーブルの`tag_type='interactive'`（`budget`, `stay_type`）は**キーワード変換の対象外**
  （`vector_index.py`で`type='normal'`のみインデックス化）。予算チップの値は`budget_max`として
  `SearchRequest`に直接渡す（タグとしては渡さない）。

### 4. 実行すべき確認コマンド

作業開始時：
```powershell
cd "C:\Users\wakta\OneDrive\ドキュメント\projects\hitou_navi"
git status
git log --oneline -10
docker compose ps
```

バックエンドが落ちていたら：
```powershell
docker compose up -d db
# db healthy になるまで待つ
docker compose up -d backend
docker compose logs backend --tail 20   # "Application startup complete" を確認
```

`/search`が生きているか確認：
```powershell
curl -s -X POST http://localhost:8000/search -H "Content-Type: application/json" -d "{\"core\": \"静か\"}"
```

コード変更後（`backend/app/`配下やDBスキーマを変えた場合）：
```powershell
docker compose build backend
docker compose down                        # -v は付けない（hf_cacheボリュームを保持）
docker volume rm hitou_navi_mysql_data      # DBだけリセット
docker compose up -d db
docker compose up -d backend
docker compose exec backend python seed.py
docker compose restart backend             # VectorIndexを新データで再構築
```

フロント：
```powershell
cd frontend
npm run dev   # http://localhost:5173
```

### 5. 未確認・未決定事項

- `/search`を本番でもTOP3ではなく全件返すか（D-005参照、要判断）
- 秘湯度の合成式（現状3スコア単純加算の暫定実装）
- 追加チップが0件ヒット時のフォールバック戦略
- 本文類似度と秘湯度の重み配分・タイブレーク詳細
- 施設名一致を強フィルタにするかの判断（現状ブースト方式で保留）
- `AGENTS.md`/`CLAUDE.md`の二重管理が今後も実際に守られるか（D-007、運用ルールのみ決定、
  仕組み化はしていない）
- セッション運用プロトコル（D-008：開始時自動読込・10応答ごとのチェック）が実際に機能するか
  未検証。
- **D-009でhooksによる機械的強制を実装済み**（`SessionStart`でagent-sync 4ファイルを
  強制注入、`SessionEnd`でgit差分をWORKLOG.mdに機械的に追記）。ただしhooks経由での
  実際の発火は未検証（スクリプト単体の直接実行では正常動作を確認済み）。次回セッション開始時に
  agent-syncの内容が自動でコンテキストに現れるか確認すること。Codex側にはhooks相当の機能が
  無いため、この強制はClaude Code側のみに効く。

---

## Completed（このセッションまで）

- DBスキーマ11テーブル（`onsen_tags.status`承認フロー、`tag_embeddings`/`onsen_embeddings`）
- `backend/seed.py`：100施設のシードデータ（9エリア網羅、施設名ユニーク化、6テーマの本文、
  価格0〜30000円、日帰り/宿泊バラエティ）
- `backend/app/search.py`：施設名一致→タグ変換/本文振り分け→ハードフィルタ→並び替えの
  検索ロジック本体。閾値・除外バグ修正済み
- `backend/app/vector_index.py` / `embeddings.py`：起動時メモリ常駐のベクトル検索基盤
- `POST /search`エンドポイント（`main.py`）：デバッグ情報（`matched_tags`/`body_queries`/
  `name_matched_slugs`）付きで全件返却＋フロントで8件ページネーション
- フロント確認用：`/admin/search-test`（pw 9767）、`/admin/search-test/:slug`
- `agent-sync`キット導入・プロジェクト固有化（D-000〜D-007）

## Known Risks

- Codexとの並行編集がある場合、同じファイル（特に`backend/app/search.py`や`seed.py`）を
  互いに知らずに変更している可能性がある。作業前に必ず`git status`で確認すること。
- `CORE_KEYWORD_TAG_SIM_THRESHOLD = 0.82`は現行100件データでの実測値。データを大きく
  追加・変更した場合は再キャリブレーションが必要（`DECISIONS.md` D-003参照）。
- `AGENTS.md`は`CLAUDE.md`とA案（両方維持）で運用することが決定済み（D-007）。現時点では
  自己参照3箇所以外は同一内容。今後どちらかだけを更新して同期を忘れるリスクがあるため、
  更新時は必ず両方を編集すること。
