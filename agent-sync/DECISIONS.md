# Decisions

Record durable choices here. Do not rely on chat history alone.

## D-000: Adopt File-Based Sync Kit for This Project

Date: 2026-07-09
Decided by: User + Claude Code (kit authored by Codex)
Status: accepted

Decision:
`agent-sync`キット（README/CHECKLIST/PROMPTS/SESSION_STATE/DECISIONS/WORKLOG/HANDOFF）を
`C:\Users\wakta\OneDrive\ドキュメント\projects\hitou_navi\agent-sync\` にコピーし、
Claude CodeとCodexの共有状態管理として正式採用する。

Rationale:
Codexから同期プロンプトが届いたため。両エージェントが同じプロジェクトを別セッションで触る際の
決定事項・進捗・引き継ぎの食い違いを防ぐ。

## D-001: 地域はタグ化せず直接カラムで表現する

Date: 2026-07-04
Decided by: User + Claude Code
Status: accepted

Decision:
都道府県・エリア・全国の地域階層は`tags`/`onsen_tags`にレコードとして持たず、
`onsens.prefecture`（既存）・`onsens.area`（新規、8エリア区分）の直接カラムでフィルタする。

Rationale:
`tags`層は「露天風呂あり」等の真偽スペック用の層であり、地域は施設の属性であって
タグ層の意味的類似度による揺らぎ吸収が活きる対象ではない。56件のタグ×温泉全件の承認フローも
運用コストが高い。地図UIのドリルダウン体験自体は維持する（内部データ表現のみ変更）。

## D-002: タグ自動付与の閾値は相対（パーセンタイル）方式

Date: 2026-07-04
Decided by: Claude Code（実測に基づく）
Status: accepted

Decision:
本文チャンク↔タグ説明文の類似度によるタグ自動付与は、絶対閾値ではなく
「温泉ごとの類似度分布の上位20%」という相対閾値（`TAG_SUGGESTION_PERCENTILE = 80`）を採用する。

Rationale:
`cl-nagoya/ruri-v3-70m`は異方性の強い埋め込み空間を持ち、コサイン類似度が極めて狭い帯域
（mean~0.85-0.87, std~0.03）に圧縮される。かつこの帯域は温泉ごとに微妙にシフトする
（比較対象の本文チャンクが温泉ごとに変わるため）。絶対閾値0.45を試したところ89タグ中87件が
該当してしまい機能しなかった。

## D-003: キーワード→タグ変換の閾値は絶対類似度方式（D-002とは逆）

Date: 2026-07-09
Decided by: Claude Code（実測に基づく）
Status: accepted

Decision:
コアキーワード→タグ変換の判定は、Zスコア方式ではなく「1位タグとの絶対類似度」
（`CORE_KEYWORD_TAG_SIM_THRESHOLD = 0.82`）を採用する。

Rationale:
Zスコア方式は実測の結果、真陽性（「静か」「山奥」等、z=1.89〜4.68）と偽陽性
（「パスタ」「宇宙船」等、z=1.73〜3.32）の分布が広く重なり判別に使えなかった。
一方、絶対類似度は真陽性sim=0.809〜0.918・偽陽性sim=0.748〜0.829とほぼ分離した。
D-002と閾値の方式が逆になる理由：D-002は比較対象（本文チャンク）が温泉ごとに変動するため
絶対閾値が機能しないが、こちらは比較対象（89タグ）が常に固定なので絶対閾値が機能する。

## D-004: 施設名一致はハードフィルタではなくブースト

Date: 2026-07-09
Decided by: User + Claude Code
Status: accepted

Decision:
コアキーワードを分割した直後、まず施設名との部分一致を判定する。一致したキーワードは
タグ変換・本文類似度に回さず切り出す。ただし一致しない施設を候補から除外はせず、
並び替え時の最優先ブーストとしてのみ使う。

Rationale:
ユーザー要望「施設名一致検索を追加、ただし部分一致でも候補から外さない」に基づく。
実装当初、施設名にヒットしたキーワードをタグ変換にも回してしまい、
「知床」がcar_requiredタグに誤変換されて知床の宿自身が除外されるバグがあった。
分割直後に施設名キーワードを切り出すことで解消。

## D-005: 検索結果はTOP3固定ではなく全件返却＋フロント側ページネーション

Date: 2026-07-09
Decided by: User
Status: accepted（ただし本番仕様として確定ではない、要再確認）

Decision:
`/search`は`top_n=None`（無制限）で全件を返す。フロント（`SearchTestPage.tsx`）で
8件区切りのクライアントサイドページネーションを実装する。並び替えロジック自体は変更しない。

Rationale:
ユーザーが検索ロジックの全体的な並び順を確認したいという要望。
**注意**：SEARCH_DESIGN.md本来の設計思想は「TOP3のみ表示」（③機械が絞り込み、人間が写真で最終判断）。
この変更はテスト用途の暫定変更であり、本番導入時にTOP3方式に戻すか全件方式を正式採用するかは未決定。

## D-006: 日帰り/宿泊は検索フィルタとして実装する

Date: 2026-07-09
Decided by: User
Status: accepted

Decision:
`onsens.day_trip_available`/`accommodation_available`を`trip_type`(`day_trip`/`stay`)として
`SearchRequest`→`hard_filter`に配線する。

Rationale:
既存データが「両対応」に偏っていてバラエティが無く、かつ検索側もこの2フラグを見ていなかった
ため、データの多様化とセットでフィルタ配線を行うことにした。

## D-007: AGENTS.md と CLAUDE.md は両方維持する（A案）

Date: 2026-07-09
Decided by: Codex提案 → Claude Code同意
Status: accepted

Decision:
`CLAUDE.md`をClaude Code用、`AGENTS.md`をCodex用の指示ファイルとして**両方維持する**（A案）。
どちらか一方を正本にして他方を廃止・自動生成にする（B案）は採用しない。

Rationale:
現時点でCodexとClaude Codeの両方がこのプロジェクトを継続的に触る前提であるため、
それぞれのツールが規約上参照するファイル名（`CLAUDE.md`/`AGENTS.md`）をどちらも活かす方が
運用上自然。ただし内容は実質的に同じルールブックであるべきなので、**同じ内容を二重管理する
コストと乖離リスク**が発生する。

運用ルール（HANDOFF.mdにも明記）:
- プロジェクトの実装メモ・変更パターン・注意点を`CLAUDE.md`または`AGENTS.md`のどちらかに
  追記した場合、**同じ内容をもう片方にも反映する**（自己参照の呼称部分――「Claude Code」/「Codex」
  ――以外は同一内容にする）。
- 更新を担当したエージェントが、その場で両ファイルを同期する（次回セッション任せにしない）。
- 大きな乖離を見つけた場合は`agent-sync/HANDOFF.md`にリスクとして記録し、
  どちらが最新か`git log`のタイムスタンプで判断する。

## D-008: セッション運用プロトコルをCLAUDE.md/AGENTS.mdの冒頭に明文化

Date: 2026-07-09
Decided by: User
Status: accepted

Decision:
`CLAUDE.md`・`AGENTS.md`の冒頭（タイトル直後）に「セッション運用プロトコル」節を追加し、以下を明記した：
1. セッション開始時は自動的に`agent-sync`の4ファイル（SESSION_STATE/DECISIONS/WORKLOG/HANDOFF）を読む
2. ユーザーから明示的に指示された場合も同様に読み直す
3. セッション内で自分（アシスタント）が10回応答するごとに、`git status`/`git diff`と
   `agent-sync`の記録内容を突き合わせ、食い違いや未記録の進捗があれば書き込む
4. セッション終了・作業の区切りでは`CHECKLIST.md`の終了手順に従う

Rationale:
ユーザーから「Claudeの5時間利用制限が近づいたら自動でagent-syncに進捗を書き込んでほしい」との
依頼があったが、**利用量・残り時間を検知するAPIやツールは存在しない**ため、この方式は技術的に
実装不可能と判断した。代替として、ユーザー提案の「10応答ごとのチェック」をフォールバックとして
採用した。

注意点（正直な限界）:
- これは`CLAUDE.md`/`AGENTS.md`という「セッション開始時に自動読み込みされるファイル」に書かれた
  **指示文**であり、LLMがその指示に従うことに依存する。ハード的に強制する仕組み（Claude Codeの
  hooks機能等）ではない。指示に従う可能性は高いが、100%の保証ではない。
- 「セッションの途中で`CLAUDE.md`自体を書き換えた場合、そのセッション内の自分に即座に反映される
  保証はない」ことも合わせてユーザーに伝達済み。確実に反映されるのは次回セッション開始時。
- より確実な強制が必要な場合は、Claude Codeのhooks機能（SessionStart/Stop等）を`update-config`
  スキルで設定する案がある。今回は指示文ベースの実装に留め、hooks設定は行っていない。
  → **D-009でこの案を実施済み**。

## D-009: Claude Codeのhooksでagent-sync読込・記録を機械的に強制する

Date: 2026-07-10
Decided by: User
Status: accepted（Claude Code側のみ。Codexにはhooks相当の機能なし）

Decision:
`.claude/settings.local.json`に`SessionStart`/`SessionEnd`フックを追加した。
- `SessionStart`：`agent-sync/hooks/session_start.py`を実行し、`agent-sync`の4ファイル
  （SESSION_STATE/DECISIONS/WORKLOG/HANDOFF）の中身を`additionalContext`として
  **LLMの判断を介さず強制的にコンテキストへ注入する**。
- `SessionEnd`：`agent-sync/hooks/session_end.py`を実行し、`git status --short`・
  `git diff --stat`（未ステージ／ステージ済み）の結果を、タイムスタンプ付きで
  **LLMを介さず機械的に**`WORKLOG.md`へ追記する。

Rationale:
D-008で導入した指示文ベースの運用は、LLMの指示追従に依存し保証がなかった。hooksは
Claude Codeの機能としてシェルコマンドを決定論的に実行するため、「材料を強制的に提示する」
「機械的な差分をログに落とす」部分は完全に自動化できる。ただし「意味のある判断を伴う記録
（DECISIONSに何を書くか等）」まではhooksで代替できないため、これは引き続きD-008の指示文に
委ねる（役割分担：hooksが機械的な部分、指示文が判断を伴う部分）。

実装の技術的注意点:
- スクリプトは`agent-sync/hooks/session_start.py` / `session_end.py`（Python）。
  Windowsのコンソールは既定でcp932等になっており日本語を含む`print()`が
  `UnicodeEncodeError`を起こすため、`json.dumps(..., ensure_ascii=True)`（既定）で
  ASCII（`\uXXXX`エスケープ）のみ出力するようにしている。ファイル読み書きは`encoding="utf-8"`を
  明示。
- `settings.local.json`のコマンドは**絶対パス**で指定した（hook実行時のcwdが必ず
  プロジェクトルートである保証がないため）。スクリプト内部でも`__file__`から
  プロジェクトルートを逆算しており、cwdに依存しない。
- bash（Git Bash）・PowerShellの両方で動作確認済み（`python "<絶対パス>"`という
  コマンド自体はシェルを問わず同じ）。
- Codexには同等のhooks機能が無い（2026-07-10時点で確認していない限り）ため、
  この強制はClaude Code側のみに効く。Codex側はD-008の指示文ベースの運用に留まる。

制限事項:
- `SessionStart`/`SessionEnd`はセッションの真の開始・終了時に発火する想定だが、
  実際にセッションを跨いで発火することを検証できるのは次回セッション開始時のみ
  （このセッション内では手動でスクリプトを直接実行して動作確認しただけで、
  hooks経由での発火は未確認）。
- `SessionEnd`が本当に「ユーザーがセッションを終える瞬間」に確実に発火するかは
  Claude Codeの実装依存。発火しない・タイミングがずれる場合は`HANDOFF.md`に追記すること。

## D-010: 埋め込みモデルを ruri-v3-70m → ruri-v3-310m へアップグレードする

Date: 2026-07-17
Decided by: User（提案はClaude Code、実測データを提示した上でユーザーが承認）
Status: accepted

Decision:
`Embedder`の埋め込みモデルを`cl-nagoya/ruri-v3-70m`から同シリーズの`cl-nagoya/ruri-v3-310m`へ
差し替える。ローカル無料・CPU推論・APIキー不要という既存方針（D-000〜の暗黙の前提）は維持する。

Rationale:
「にごり湯」というタグ名そのものを入力しても無関係な「炭酸水素塩泉」に誤変換される不具合を
調査したところ、70mモデルの異方性の強い埋め込み空間（類似度が0.84〜0.86の狭い帯域に圧縮される、
D-002のRationaleで既知の性質）が原因と判明した。ユーザーに「より上位のモデルに差し替えることは
検討できるか」と相談され、以下の理由で310mへの変更を提案・承認された：
- 同シリーズ内の変更なのでローカル無料・CPU推論の方針を崩さない。
- `Embedder`のMODEL_VERSION文字列を変えるだけで済む設計（既存の`TagEmbedding`/`OnsenEmbedding`の
  主キーに`model_version`を含む設計により、切替の実装コストは最小）。
- 実測で真陽性/偽陽性の分離幅が拡大（旧: 隙間ほぼ無し → 新: 約0.06）することを事前に確認した上での判断。

トレードオフとして許容した点:
- クエリ埋め込みは`/search`リクエストごとに同期実行されるため、モデルが大きいほど検索1回あたりの
  レイテンシが増える（未計測、体感で許容範囲と判断）。
- 100件規模の疎なタグデータでは、モデルの精度向上により以前は本文類似度クエリ（ソフトな並び替え）に
  回っていたキーワードがハードフィルタのタグに変換されるようになり、複数タグANDの組み合わせで
  0件ヒットが増えやすくなる副作用がある（データのスパース性による現象であり、モデルの欠陥ではない）。
- 完全な解決を保証するものではない（短いラベル同士は依然近い類似度に集まりやすい）ため、
  「キーワードがタグlabelと完全一致する場合は埋め込みをバイパスする」ショートカット
  （`search.py`の`classify_keywords`）を先に実装し、モデル変更とは独立した保険として併用する。
