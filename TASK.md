# タスク: バックエンド（DB層）をテンプレートから実際の実装へ移行

## 背景

`models.py` は温泉ナビ用に定義済み（Onsen, OnsenSpringInfo, OnsenAccommodation, OnsenAccess, OnsenNearbySpot, OnsenPhoto, OnsenBookingLinks, Tag, OnsenTag）。

しかし `schemas.py` / `main.py` / `seed.py` はテンプレートの `Item` モデルのままで、起動時にクラッシュする。

---

## タスク一覧

### 1. `backend/app/schemas.py` を全面書き直す

`models.py` の全テーブルに対応するPydanticスキーマを定義する。

**方針:**
- `models.py` の各クラスを読んで、フィールドを忠実に型変換する
- SQLAlchemy型 → Pydantic型の対応: `String/Text` → `str`, `Integer` → `int`, `Boolean` → `bool`, `Numeric` → `Decimal`, `Date` → `date`, `DateTime` → `datetime`, `Enum` → `Literal[...]`, `JSON` → `dict | list | None`
- 全スキーマに `model_config = {"from_attributes": True}` を付ける
- nullable なカラムは `Optional[...]` にする
- リレーション付きのネストしたレスポンス型を作る（例: `OnsenDetailResponse` は `spring_info`, `accommodation`, `access`, `nearby_spots`, `photos`, `booking_links`, `onsen_tags` を含む）
- 一覧用の軽量型（`OnsenSummaryResponse`）と詳細用の型（`OnsenDetailResponse`）を分ける

**作成するスキーマ一覧:**

```
OnsenSpringInfoResponse
OnsenAccommodationResponse
OnsenAccessResponse
OnsenNearbySpotResponse
OnsenPhotoResponse
OnsenBookingLinksResponse
TagResponse
OnsenTagResponse          # Tag情報をネスト
OnsenSummaryResponse      # 一覧用: id, slug, name, region, prefecture, quietness_score, solitude_score, accessibility_score, hero_image_url, day_trip_available, accommodation_available, admission_fee_min
OnsenDetailResponse       # 詳細用: Onsen全カラム + 上記リレーション全部
```

---

### 2. `backend/app/main.py` を書き直す

**やること:**
- `from .models import Item` を削除（`Item` は存在しない）
- 実際のモデル・スキーマをインポート
- `/items` `/items/{id}` をOnsen用エンドポイントに置き換える

**実装するエンドポイント:**

```python
GET /onsens
  - クエリパラメータ: prefecture (Optional[str]), region (Optional[str])
  - レスポンス: List[OnsenSummaryResponse]
  - DBクエリ: prefecture/region が指定されたときはフィルタ

GET /onsens/{slug}
  - パスパラメータ: slug (str)
  - レスポンス: OnsenDetailResponse
  - DBクエリ: slug で検索、joinedload でリレーションを一括取得
  - 見つからない場合: HTTPException(status_code=404)
```

`joinedload` のインポート: `from sqlalchemy.orm import Session, joinedload`

---

### 3. `backend/seed.py` を書き直す

`from .models import Item` → 実際のモデルに変更し、温泉データのサンプルを1〜2件挿入する。

**構造:**
1. `Onsen` レコードを作成・挿入してフラッシュ（IDを取得するため）
2. `OnsenSpringInfo` を対応する `onsen_id` で挿入
3. `OnsenAccess` を対応する `onsen_id` で挿入
4. `Tag` を数件挿入
5. `OnsenTag` で温泉とタグを紐づけ
6. `db.commit()`

サンプルデータは架空でよい（slug=`"test-onsen-1"`, name=`"テスト温泉"` 等）。

---

### 4. トップページ (`/`) を作成する

**目的:** React / Tailwind / axios / バックエンド / DBの依存関係が最小限で繋がっていることを確認できるシンプルなページ。コンテンツはほぼ不要。

**`frontend/src/pages/TopPage.tsx` を新規作成:**
- ページ表示時に `GET /api/onsens` を呼び、取得件数を画面に表示する（例: "温泉データ: 2件"）
- ローディング中は "読み込み中..." と表示
- エラー時は "接続エラー" と表示
- `/admin` へのリンクを1つ置く（テキストリンクで十分）
- Tailwindでミニマルにスタイリング

**`frontend/src/App.tsx` を更新:**
- `ListPage` / `DetailPage` の既存ルートを削除し、以下に置き換える
  ```tsx
  <Route path="/" element={<TopPage />} />
  <Route path="/admin" element={<AdminPage />} />
  ```

---

### 5. 管理者ページ (`/admin`) を作成する

**目的:** 全テーブルのレコードをGUIで閲覧・追加・削除できる、シンプルなデータ管理ツール。

#### 5-1. バックエンドに汎用CRUDエンドポイントを追加（`main.py`）

テーブル名をパスパラメータで受け取る汎用エンドポイントを追加する。

```python
# 許可するテーブル名とモデルのマッピング辞書を定義
TABLE_MAP = {
    "onsens": Onsen,
    "onsen_spring_info": OnsenSpringInfo,
    "onsen_accommodation": OnsenAccommodation,
    "onsen_access": OnsenAccess,
    "onsen_nearby_spots": OnsenNearbySpot,
    "onsen_photos": OnsenPhoto,
    "onsen_booking_links": OnsenBookingLinks,
    "tags": Tag,
    "onsen_tags": OnsenTag,
}

GET  /admin/tables
  - レスポンス: TABLE_MAP のキー一覧 (List[str])

GET  /admin/tables/{table_name}
  - 指定テーブルの全レコードを返す
  - レスポンス: List[dict]（各レコードを __dict__ から _sa_instance_state を除いて返す）
  - table_name が TABLE_MAP にない場合は 404

POST /admin/tables/{table_name}
  - リクエストボディ: dict（任意のフィールド）
  - 該当モデルのインスタンスを **{body} でアンパックして生成・挿入
  - レスポンス: 挿入後のレコード (dict)
  - バリデーションエラーは 422 として自動返却

DELETE /admin/tables/{table_name}/{record_id}
  - id カラムで該当レコードを検索・削除
  - 見つからない場合は 404
```

#### 5-2. フロントエンド `frontend/src/pages/AdminPage.tsx` を新規作成

**認証:**
- ページ表示時にパスワード入力モーダルを表示
- 入力値が `"9767"` と一致したら管理画面を表示（一致しなければ何度でも再入力）
- パスワードは React state のみで管理（localStorage 不使用）

**管理画面のレイアウト:**
- 左側または上部にテーブル選択タブ or ドロップダウン（`GET /api/admin/tables` で取得）
- 選択中テーブルのレコードを表形式で表示（`GET /api/admin/tables/{table_name}`）
  - カラム名はレコードのキーから自動生成
  - 各行の末尾に「削除」ボタン → `DELETE /api/admin/tables/{table_name}/{id}` → 一覧を再取得
- 一覧の下に「レコード追加」フォーム
  - カラム名をキーとした `<input>` を動的に並べる
  - 「追加」ボタンで `POST /api/admin/tables/{table_name}` → 一覧を再取得
  - `id`, `created_at`, `updated_at` フィールドは入力欄を表示しない（自動生成のため）

---

## 完了確認

以下のコマンドでエラーなく動作すること:

```powershell
# backend/ で実行
$env:DATABASE_URL = "mysql+pymysql://app_user:app_password@localhost:33306/app_db"
$env:CORS_ORIGIN  = "http://localhost:5173"
.venv\Scripts\python.exe -c "from app.main import app; print('OK')"
```

- `http://localhost:8000/docs` で全エンドポイントが表示されること
- `http://localhost:5173/` でトップページが表示され、温泉件数が出ること
- `http://localhost:5173/admin` でパスワード入力後、全テーブルのCRUD操作ができること
