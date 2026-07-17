# FastAPI + React + MySQL テンプレート

FastAPI（Python）バックエンド、React（TypeScript）フロントエンド、MySQL を使った汎用Webアプリテンプレート。

## セッション運用プロトコル（agent-sync同期）※最優先で従うこと

このプロジェクトはCodexとClaude Codeが同じコードベースを別セッションで触る。
`agent-sync/`フォルダ（SESSION_STATE.md / DECISIONS.md / WORKLOG.md / HANDOFF.md / CHECKLIST.md / PROMPTS.md）
を共有状態として使う。以下を必ず守ること。

### セッション開始時（自動・毎回）

作業内容に関わらず、セッションの最初に以下を読む：
1. `agent-sync/SESSION_STATE.md`
2. `agent-sync/DECISIONS.md`
3. `agent-sync/WORKLOG.md`（最新エントリ）
4. `agent-sync/HANDOFF.md`
5. 可能なら `git status` / `git log --oneline -10` で実際の差分も確認する

### ユーザーから明示的に指示されたとき

「agent-syncを読んで」「同期して」等の指示があった場合も、上記と同じ手順を実行する
（セッション開始時に読んでいても、指示があれば再度読み直す）。

### セッション内・10応答ごとの自己チェック（フォールバック方式）

利用量・残り時間を検知するAPIは無いため、**代わりに応答回数を数える**：
このセッション内で自分（アシスタント）が10回応答するごとに、以下を行う。

1. `git status` / `git diff`で直近の変更を確認する
2. 直近の実装・意思決定が `agent-sync/WORKLOG.md` や `DECISIONS.md` の内容と食い違っていないか確認する
3. 食い違いや未記録の進捗があれば、`WORKLOG.md`（進捗・変更ファイル・実行コマンド・検証結果）・
   `SESSION_STATE.md`（現状・owner・次アクション）・`DECISIONS.md`（新しい決定があれば）を更新する
4. 特に問題がなければ、無理に書き込まなくてよい（空の更新は避ける）

### セッション終了時・作業の区切り時

`agent-sync/CHECKLIST.md`の「End Of Session」に従い、`WORKLOG.md`・`SESSION_STATE.md`・
`DECISIONS.md`（変更があれば）・`HANDOFF.md`を更新する。

### CLAUDE.mdとの関係

`CLAUDE.md`はClaude Code用の同一内容のミラーとして両方維持する（agent-sync/DECISIONS.md D-007）。
このセクションを含め、`AGENTS.md`を更新したら`CLAUDE.md`にも同じ内容を反映すること（逆も同様）。

## スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 19, TypeScript, Vite, Tailwind CSS, axios, React Router |
| バックエンド | Python 3.12, FastAPI, SQLAlchemy, PyMySQL, uvicorn |
| DB | MySQL 8.0 |
| インフラ | Docker Compose, nginx (本番フロントエンド) |

## ファイルマップ

```
backend/app/
  main.py       APIエンドポイント定義（追加・変更の主要ファイル）
  models.py     SQLAlchemyモデル（DBテーブル定義）
  schemas.py    Pydanticスキーマ（APIレスポンス型）
  database.py   DB接続設定（DATABASE_URL環境変数を使用）

frontend/src/
  App.tsx       React Routerのルーティング定義
  pages/        各ページコンポーネント
    ListPage.tsx     / （アイテム一覧）
    DetailPage.tsx   /items/:id （詳細）

frontend/
  vite.config.ts  開発時プロキシ: /api → http://localhost:8000
  nginx.conf      本番プロキシ: /api/ → http://backend:8000

docker-compose.yml  db / backend / backend depends_on db (condition: service_healthy)
.env               DATABASE_URL, CORS_ORIGIN
```

## 起動

### Docker（全サービス）

```powershell
docker compose up --build
# frontend: http://localhost:80
# backend:  http://localhost:8000
# mysql:    localhost:33306
```

### ローカル開発（ファイル変更即反映）

```powershell
# MySQLのみDocker
docker compose up -d db

# バックエンド（backend/で実行、.venvが必要）
$env:DATABASE_URL = "mysql+pymysql://app_user:app_password@localhost:33306/app_db"
$env:CORS_ORIGIN  = "http://localhost:5173"
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# フロントエンド（frontend/で実行）
npm run dev
# frontend: http://localhost:5173
```

ローカルは `--reload` と Vite HMR で保存時に自動反映される。再起動不要。

## 変更パターン

### APIエンドポイント追加

`backend/app/main.py` に追記する。`db: Session = Depends(get_db)` はDB使用時の必須引数。

```python
@app.get("/新パス", response_model=スキーマ)
def 関数名(db: Session = Depends(get_db)):
    ...
```

### DBカラム追加

1. `backend/app/models.py` に `Column(...)` を追加
2. `backend/app/schemas.py` の該当スキーマにフィールドを追加
3. 既存テーブルへの反映は自動で行われないため、`docker compose down -v && docker compose up --build` でボリュームごと再作成するか、MySQLに直接 `ALTER TABLE` を実行する

### 新規ページ追加

1. `frontend/src/pages/NewPage.tsx` を作成
2. `frontend/src/App.tsx` に `<Route path="/new" element={<NewPage />} />` を追加

### フロントエンドからのAPI呼び出し

必ず `/api/...` プレフィックスで呼ぶ（プロキシが自動除去する）。

```tsx
axios.get('/api/items')                          // 一覧
axios.get(`/api/items/${id}`)                    // 詳細
axios.get('/api/items', { params: { name } })    // クエリパラメータ
```

## 重要な制約・注意点

- `.env` の `DATABASE_URL` は `db:3306`（Dockerネットワーク内ホスト名）。ローカル起動時は環境変数を `localhost:33306` に上書きすること。
- `CORS_ORIGIN` はフロントエンドのオリジンと一致させること（Docker: `http://localhost`、ローカル: `http://localhost:5173`）。
- `models.py` の `String` 型カラムには長さを必ず指定すること（MySQL要件）。例: `Column(String(255))`。
- `Base.metadata.create_all()` は新規テーブルのみ作成し、既存テーブルのカラム変更は行わない。
- 新しいPythonパッケージを追加したら `requirements.txt` に追記し、`docker compose up --build` でイメージを再ビルドする。

## 初期データ

`backend/seed.py` に5件のサンプルデータがある。Docker環境では自動実行されないため、必要なら手動で実行する：

```powershell
# Dockerコンテナ内で実行
docker compose exec backend python seed.py
```

## APIドキュメント

バックエンド起動中に `http://localhost:8000/docs` で全エンドポイントを確認・テスト実行できる（FastAPI自動生成）。

---

## 秘湯ナビ 実装メモ（2026-06-11）

### プロジェクトの実体パス

```
C:\Users\wakta\OneDrive\ドキュメント\projects\hitou_navi
```

Codex のワーキングディレクトリとは別。ファイル操作はすべて絶対パス指定で行う。

### モデル一覧（`backend/app/models.py`）

| Pythonクラス | テーブル名 | Onsenとのリレーション |
|---|---|---|
| `Onsen` | `onsens` | 親（中心テーブル） |
| `OnsenSpringInfo` | `onsen_spring_info` | 1:1、`uselist=False` |
| `OnsenAccommodation` | `onsen_accommodation` | 1:0..1、`uselist=False` |
| `OnsenAccess` | `onsen_access` | 1:1、`uselist=False` |
| `OnsenNearbySpot` | `onsen_nearby_spots` | 1:多 |
| `OnsenPhoto` | `onsen_photos` | 1:多 |
| `OnsenBookingLinks` | `onsen_booking_links` | 1:1、`uselist=False` |
| `Tag` | `tags` | OnsenTag 経由で多:多 |
| `OnsenTag` | `onsen_tags` | 多:多の中間テーブル |

### 実装上のポイント・ハマりポイント

- **`Tag.tag_type`**：Pythonの属性名は `tag_type`、DBカラム名は `type`（`Column("type", Enum(...))`）。SQLAlchemyのpolymorphic discriminator予約語 `type` との衝突を避けるため。スキーマの `TagResponse` でも同様に `tag_type` で参照。
- **スコアカラム**：`quietness/solitude/accessibility_score` は `from sqlalchemy.dialects.mysql import TINYINT` を使用。
- **`onsen_tags.confidence`**：`Numeric(3, 2) NOT NULL`。承認前でも信頼スコアは必須（設計仕様）。
- **`onsen_accommodation`**：`accommodation_available = FALSE` の施設にはレコードが存在しない。DB制約ではなくアプリ側の運用ルール。
- **ENUMカラム**：すべてインライン定義（`Enum("あり", "なし", "不明")`）。名前付きEnum型（`name=`）は使わない。
- **admin エンドポイントの `Decimal` / `datetime` 直列化**：ORM の `__dict__` を返す際に `_to_json_safe()` で `float()` / `.isoformat()` に変換している（FastAPI の `jsonable_encoder` では自動変換されないため）。

### スキーマ（`backend/app/schemas.py`）

- `OnsenSummaryResponse` — 一覧用軽量版（12フィールド）
- `OnsenDetailResponse` — 詳細用（Onsen全フィールド＋全リレーションネスト）
- `TagResponse.tag_type` → モデルの `tag_type` 属性（DBカラム `type`）を `from_attributes=True` で参照

### エンドポイント一覧（`backend/app/main.py`）

```
GET  /onsens                            一覧（prefecture・region クエリパラメータ対応）
GET  /onsens/{slug}                     詳細（joinedloadで全リレーション一括取得）
GET  /admin/tables                      TABLE_MAP のキー一覧
GET  /admin/tables/{name}/columns       model.__table__.columns から id/created_at/updated_at 除いて返す
GET  /admin/tables/{name}               db.query(model).all() → _record_to_dict（型変換込み）
POST /admin/tables/{name}               model(**body) で挿入
DELETE /admin/tables/{name}/{id}        model.id == record_id で検索・削除
```

### フロントエンド（`frontend/src/`）

```
App.tsx           Route: / → TopPage、/admin → AdminPage
pages/
  TopPage.tsx     GET /api/onsens → 件数表示 + /admin リンク
  AdminPage.tsx   パスワード 9767 認証 → テーブル選択 → レコード一覧/追加/削除
                  ※ /columns エンドポイントでテーブルが空でもフォーム表示可能
```

### seed.py（`backend/seed.py`）

以下を挿入する：
- `Onsen` × 2（slug: `noboribetsu-test`、`nyuto-tsurunoyu`）
- `OnsenSpringInfo`、`OnsenAccess` × 各2
- `Tag` × 3（`quiet_priority`、`solo_friendly`、`no_car_ok`）
- `OnsenTag` × 5

DBにデータが入っていない場合は先に seed を実行すること。

```powershell
cd "C:\Users\wakta\OneDrive\ドキュメント\projects\hitou_navi\backend"
$env:DATABASE_URL = "mysql+pymysql://app_user:app_password@localhost:33306/app_db"
.venv\Scripts\python.exe seed.py
```

---

## トップページ フロントエンド実装 指導方針（2026-07-01）

### デザイン見本の位置づけ

`C:\Users\wakta\OneDrive\ドキュメント\projects\ページデザインの洗練について\design_handoff_hisou_search\` に以下の見本ファイルがある：

| ファイル | 役割 |
|---|---|
| `トップページ.dc.html` | オリジナル見本（Design Component 独自ランタイム形式） |
| `トップページ.preview.html` | **閲覧用**。React + Babel Standalone の CDN 構成。ブラウザで直接開ける。 |
| `トップページ.react.tsx` | React + TypeScript + TailwindCSS + vanilla CSS による参考実装コード |
| `トップページ.react.css` | 上記に対応する vanilla CSS（アニメーション・hover 擬似セレクタ） |
| `README.md` | ピクセルパーフェクト仕様書（色・タイポグラフィ・アニメーション値） |

### 指導時のルール

- **ユーザーがトップページのフロントエンドを実装する際は、上記見本を参照しながら実装方法を指導する。**
- 見本ファイルを直接プロジェクトにコピーするのではなく、ユーザー自身が `frontend/src/pages/TopPage.tsx` に実装していく。
- 実装の正典は `README.md`（仕様書）と `トップページ.react.tsx`（参考コード）。
- 本番実装はプロジェクトの既存のやり方に従う：React 関数コンポーネント + useState + vanilla CSS は `frontend/src/index.css` に追記、Tailwind カスタムトークンは `@theme` ブロックで定義済みのものを使う。

### 見本が不要になるタイミング

見本に実装されている要素がすべて `TopPage.tsx` に実装され動作確認できたら、見本は参照しなくてよい。見本の範疇は以下：

- ヒーロー背景（画像 + グラデーションオーバーレイ）
- ヘッダー（ロゴ + ナビリンク hover アニメーション）
- 縦書きヒーローコピー
- 検索バー（キーワード入力 + 選択済みチップ表示 + 探すボタン）
- 特殊チップ：予算（スライダー展開）・滞在（セグメント展開）のアニメーション
- サジェストチップ横スクロール（ドラッグ / 慣性 / 自動フロー / 無限ループ）
- スクロールキュー（左下 SCROLL アニメーション）

---

## TopPage フロントエンド実装メモ（2026-07-02）

### 実装済みパーツ

- 背景画像 + グラデーションオーバーレイ
- ヘッダー：SVGロゴ + ナビリンク（.nav-linkクラス、index.cssでhoverアニメーション定義）
- 縦書きヒーローコピー：「秘湯を」「たずねて」＋サブコピー（Yuji Mai / Shippori Mincho）
- 日帰り/宿泊トグル：`tripType` stateで管理、`accent`変数でアクセントカラーを連動
- 統合チップバー外枠：backdropFilter blur(9px)、border、boxShadow
- キーワード入力欄：`core` stateでvalue管理、transparent背景

### アクセントカラー

```tsx
const ACCENT_OVERNIGHT = '#a8412f'  // 宿泊: 朱
const ACCENT_DAYTRIP   = '#6F7E4F'  // 日帰り: 苔緑
const accent = tripType === 'stay' ? ACCENT_OVERNIGHT : ACCENT_DAYTRIP
```

### 未実装（次に着手）

- 探すボタン（虫眼鏡アイコン）
- 選択済みチップ表示行（`active` state）
- インテント文
- 予算・滞在チップ（Codexが直接実装）
- サジェストチップ横スクロール（Codexが直接実装）
- SCROLLアニメーション（左下）

### 注意点

- `tripType` の型は `'dayTrip' | 'stay' | null`。トグルのmapでは `'daytrip'` の文字列を使っているため `as 'dayTrip' | 'stay'` でキャストしている
- ナビリンクのstyleからcolor・letterSpacing・textShadowを削除済み（CSS側のhoverが効くように）
- チップバーに `as React.CSSProperties` が必要（backdropFilterの型エラー回避）

---

## 検索基盤（埋め込み・タグ承認フロー）実装メモ（2026-07-04）

`ALGORITHM.md`/`SEARCH_DESIGN.md`（Obsidian: `情報科学総合演習A/`）に基づき、DB層と埋め込みパイプラインを実装した。

### 追加・変更したファイル

```
backend/app/embeddings.py   Embedder（Ruri v3接頭辞処理）・チャンク分割・ベクトルシリアライズ
backend/app/constants.py    PREFECTURE_TO_AREA（都道府県→8エリア対応表）
backend/app/models.py       Onsen.area 追加 / OnsenTag: approved_by・approved_at → status enum に変更
                             / TagEmbedding・OnsenEmbedding 新規モデル追加
backend/app/schemas.py      OnsenTagResponse を status 方式に更新、area を Summary/Detail に追加
backend/requirements.txt    sentence-transformers・torch(cpu)・sentencepiece・protobuf 追加
backend/seed.py             10施設分に拡張、埋め込み生成→AI提案→承認フローを実装
```

### モデルは `cl-nagoya/ruri-v3-310m`（sentence-transformers）。準備は不要

初回実行時にHugging Face Hubから自動ダウンロード＆キャッシュされる。APIキー不要、ローカルCPU推論。
ただし `docker-compose.yml` はソースをボリュームマウントしていないため、**backend側のコードを変更したら `docker compose build backend` が必須**（コピーだけなので数十秒で終わる、pip installはキャッシュされる）。

**モデル変更履歴**：導入時は`cl-nagoya/ruri-v3-70m`（軽量・70M）だったが、2026-07-17に`ruri-v3-310m`へ
変更した（誤変換不具合の対策、後述の「予算ハードフィルタ修正・埋め込みモデル変更メモ」参照）。
`Embedder`の`MODEL_VERSION`を変えるだけで良いが、`TagEmbedding`/`OnsenEmbedding`の主キーに
`model_version`が含まれるため、既存Onsen/Tag行との重複を避けるにはDB再シードが必要
（`docker volume rm hitou_navi_mysql_data`からの完全再構築）。

### タグ自動付与の閾値はキャリブレーションで判明した重要な罠

ALGORITHM.md §8 で「閾値は実測してキャリブレーションする」とあったが、実際にやってみると絶対値の閾値（当初案の0.45）は完全に機能しなかった。

- 導入時の`cl-nagoya/ruri-v3-70m`はコサイン類似度が極めて狭い帯域（実測: 温泉本文チャンク vs 89タグで mean~0.85-0.87, std~0.03, 最小値でも0.79）に圧縮されていた。小型モデルによくある異方性の強い埋め込み空間。
- かつこの帯域は温泉ごとに微妙にシフトする（実測: mean 0.853〜0.869）。
- そのため絶対閾値0.45だと89件中87件が「該当」になり、閾値として意味をなさない。

**対策**：温泉ごとの類似度分布の**上位20%（パーセンタイル基準）**を提案候補とする相対閾値方式に変更（`seed.py` の `TAG_SUGGESTION_PERCENTILE = 80`）。ベースラインが温泉ごとに違っても、常に一定割合をrecall重視で拾える。今後タグ数・温泉数が増えたら、この割合も再キャリブレーションが必要。

### 「本文」の代用ソース

DBには温泉ページの長文記事を保持する専用カラムがまだない（`PROJECT_OVERVIEW.md`/`UI_DESIGN.md`にも定義なし）。そのため `seed.py` では `quietness_comment` / `solitude_comment` / `accessibility_comment` / `bathing_review` の4つの構造化コメント欄を `##見出し` 付きで連結したものを、チャンク分割・埋め込みの対象「本文」として代用している（`build_body_markdown()`）。将来的に専用の記事本文カラム／テーブルを追加する場合はここを差し替える。

### タグ承認フローの実装（10施設・89タグ）

1. 全89タグの説明文を埋め込み → `tag_embeddings`
2. 各温泉の本文（代用ソース）をチャンク分割（見出しごとに4チャンク/施設）→ 埋め込み → `onsen_embeddings`
3. 本文チャンクとタグ説明文の類似度で上位20%をAI提案候補とする → `onsen_tags(status='proposed')`
4. 執筆者役（このセッションではCodexが代行）が `GROUND_TRUTH_TAGS`（各温泉について実際に正しいと判断したタグ集合）と照合し、
   - AI提案 かつ 正解 → `approved`
   - AI提案 かつ 不正解 → `rejected`（却下履歴として保持）
   - 正解だがAIが提案しなかった → 手動追加（`confidence=1.00`, 最初から`approved`）

実行結果（2026-07-04時点）：AI提案180件中 承認38・却下142、手動追加34、最終的な承認済みタグ 72件。

### 実行手順（再現用）

```powershell
cd "C:\Users\wakta\OneDrive\ドキュメント\projects\hitou_navi"
docker compose build backend        # requirements.txt / app/ 配下を変更したら必須
docker compose down -v              # スキーマ変更を反映するためボリューム再作成
docker compose up -d db
docker compose up -d backend
docker compose exec backend python seed.py
```

---

## 検索エンドポイント・データ100件化メモ（2026-07-09）

### 追加・変更ファイル

```
backend/app/vector_index.py  起動時メモリ常駐の VectorIndex（ALGORITHM.md §6.2）
backend/app/search.py        検索ロジック本体（施設名一致→タグ変換/本文振り分け→ハードフィルタ→並び替え）
backend/app/main.py          POST /search（lifespanでEmbedder・VectorIndex構築、app.stateに保持）
frontend/src/pages/SearchTestPage.tsx      検索確認用ページ（/admin/search-test、pw 9767）※使い捨て
frontend/src/pages/OnsenDetailTestPage.tsx 詳細表示（UI_DESIGN.md準拠）※使い捨て
docker-compose.yml           backendに hf_cache ボリューム追加（モデル再DL回避）
seed.py                      100施設に拡張（コンパクトRECORDS表＋_expandで展開）
```

### 検索の要点

- **コア→タグ変換の閾値は絶対類似度0.82**（`CORE_KEYWORD_TAG_SIM_THRESHOLD`）。Zスコア方式は真陽性/偽陽性が重なって機能しなかった。キーワード↔タグは比較対象が固定89タグなので絶対閾値が効く（タグ自動付与の相対閾値とは事情が異なる）
- **施設名一致は分割後まず最初**に判定し、ヒットしたキーワードはタグ変換・本文類似度に回さない（`split_name_keywords`）。現状はブースト（除外なし）
- **日帰り/宿泊フィルタ**：`trip_type`(`day_trip`/`stay`)→`hard_filter`で`day_trip_available`/`accommodation_available`を絞る
- データは検索が触る6項目に多様性集中、表示専用はテーマから機械生成。画像は既存30枚を循環参照

### コード変更後の再シード手順（hf_cacheは保持しモデル再DLを避ける）

```powershell
docker compose build backend
docker compose down                                # -v は付けない
docker volume rm hitou_navi_mysql_data             # DBだけリセット（hf_cacheは残す）
docker compose up -d db                            # 起動待ち
docker compose up -d backend                       # 起動待ち
docker compose exec backend python seed.py
docker compose restart backend                     # VectorIndexを新データで再構築
```

---

## 予算ハードフィルタ修正・埋め込みモデル変更メモ（2026-07-17）

### 予算フィルタが日帰り/宿泊料金を区別していなかった不具合

`onsens.admission_fee_min` は1カラムのみで、seedは施設タイプにより意味を変えて格納していた
（day=入浴料 / stay=宿泊料 / both=入浴料のみで宿泊料なし）。`hard_filter`はtrip_typeに関係なく
このカラムで予算判定していたため、宿泊検索で「両対応」施設が安い入浴料で誤って予算内判定されていた。

**対策**：`Onsen.lodging_fee_min`（1人あたり宿泊料）カラムを新設し、`admission_fee_min`は日帰り入浴料に
用途限定。両対応施設の宿泊料は`seed.py`の`gen_lodging_fee(slug, theme)`でテーマ価格帯
（lux22-32k / ret,sce12-18k / sec11-17k / qua10-16k / liv9-14k）から決定論的に自動生成（架空施設のため
ダミー値、実データ投入時は差し替え要）。`search.py`の`hard_filter`は予算判定をtrip_typeで切替
（day_trip→admission_fee_min / stay→lodging_fee_min / 未指定→どちらか予算内でOK）。料金NULLは
予算内と見なさず除外。フロントの結果カード・詳細ページも旅行タイプに応じて表示する料金を切替。

### キーワード→タグ変換の完全一致ショートカット

「にごり湯」と入力すると無関係な「炭酸水素塩泉」に誤変換される不具合を調査した結果、
埋め込みモデル（当時ruri-v3-70m）の異方性の強さが原因と判明（後述のモデル変更履歴参照）。
`classify_keywords()`に、**キーワードがタグのlabelと完全一致する場合は埋め込み類似度をバイパスして
直接そのタグに変換する**ショートカットを追加（`search.py`）。それ以外のキーワードの挙動は変えない。

### 埋め込みモデルを `cl-nagoya/ruri-v3-70m` → `cl-nagoya/ruri-v3-310m` に変更

`embeddings.py`の`MODEL_VERSION`を変更するだけで良い設計（`TagEmbedding`/`OnsenEmbedding`の主キーに
`model_version`を含むため）。ただし実際にはDBスキーマは変わらずとも、既存Onsen/Tag行との重複を避けるため
`docker volume rm hitou_navi_mysql_data`からの完全再シードが必要だった（`seed.py`は空DB前提でTRUNCATE等を
行わないため）。

**モデル変更で確認できた改善**（実測、90タグ中の1位タグとの絶対類似度）：
- 旧モデル(70m)：真陽性/偽陽性が0.84〜0.86の極めて狭い帯域に密集し、「にごり湯」→nigoriyu(0.8464)より
  bicarbonate(0.8526)が僅差で上回る、といった誤りが起きた。
- 新モデル(310m)：真陽性 sim=0.856〜0.904、偽陽性 sim=0.762〜0.793と分離幅が拡大（隙間ほぼ無し→約0.06）。
  完全一致でないキーワード（例:「濁り湯」→nigoriyu 0.8956、2位との差+0.022）でも正しいタグが上位に来やすい。
- `CORE_KEYWORD_TAG_SIM_THRESHOLD = 0.82`は据え置きで機能する（新モデルでも真偽の分離を跨がない）。

**副作用として注意**：モデルの分離精度が上がったことで、以前は本文類似度クエリ（body_queries、ソフトな
並び替え）に回っていたキーワード（例:「静か」）が、閾値0.82を超えてタグ（`quiet_inn`）へハード変換される
ようになった。これ自体は正しい挙動だが、複数タグをANDで要求するハードフィルタの性質上、100件規模の
疎なタグデータでは組み合わせによって0件ヒットが増えやすい（データのスパース性による現象で、コードの
不具合ではない）。

**関連ドキュメントの整合**：`embeddings.py`のMODEL_VERSIONを実際に変更したので、本ファイルおよび
`CLAUDE.md`内の「モデルは `cl-nagoya/ruri-v3-70m`」の記載も本メモの内容に合わせて更新すること
（D-007のミラー方針）。
