"""検索ロジック本体（SEARCH_DESIGN.md 7章 / ALGORITHM.md 7章）。

ハイブリッド検索：タグ層＝ハードフィルタ、本文層＝並び替え主軸、
スコア層（秘湯度）＝タイブレークおよび本文クエリ不在時の並び替え主軸。
"""
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from .embeddings import Embedder, max_chunk_similarity
from .models import Onsen, OnsenAccess, OnsenTag
from .vector_index import VectorIndex

# コアキーワード→タグ変換の判定閾値。
#
# 当初はZスコア方式（タグ自動付与の閾値キャリブレーションと同じ発想）を試したが、
# 実測した結果、真陽性（例:「静か」「山奥」）と偽陽性（例:「パスタ」「宇宙船」）の
# Zスコア分布が広く重なり、判別に使えないことが分かった（真陽性 z=1.89〜4.68、
# 偽陽性 z=1.73〜3.32）。
#
# 一方、1位タグとの「絶対類似度」は両者がほぼ分離することが実測で確認できた。
#
# タグ自動付与（onsen本文 vs タグ説明文）で絶対閾値が機能しなかったのは、
# 温泉ごとに比較対象の本文チャンクが変わり類似度の基準がシフトするためだった。
# 一方この処理（キーワード vs タグ説明文）は、比較対象のタグ集合が常に固定
# （全89タグ）なので、絶対閾値がそのまま使える。要再キャリブレーション
# （タグや温泉件数が大きく変わったとき）。
#
# モデル変更履歴:
#   cl-nagoya/ruri-v3-70m 時点の実測: 真陽性 sim=0.809〜0.918、偽陽性 sim=0.748〜0.829
#     （重複はごくわずか）。この小型モデルは類似度が0.84〜0.86の極めて狭い帯域に
#     圧縮される異方性が強く、キーワードがタグ名そのものでも無関係な別タグに僅差で
#     負けることがあった（例:「にごり湯」→「炭酸水素塩泉」に誤変換、0.8526 vs 0.8464）。
#     このクラスの誤変換は classify_keywords() 内のラベル完全一致ショートカットで対処。
#   cl-nagoya/ruri-v3-310m に変更後の実測: 真陽性 sim=0.856〜0.904、偽陽性 sim=0.762〜0.793。
#     真偽の分離幅が広がり（旧: 隙間ほぼ無し → 新: 約0.06の明確な隙間）、
#     完全一致でないキーワード（例:「濁り湯」→nigoriyu 0.8956、2位との差+0.022）でも
#     正しいタグが上位に来やすくなった。閾値0.82は据え置きで問題なし。
CORE_KEYWORD_TAG_SIM_THRESHOLD = 0.82


def hiyu_do(onsen: Onsen) -> int:
    """秘湯度：3スコアの単純合算（合成式は未確定、暫定でSEARCH_DESIGN.md 7.5準拠の加算）。"""
    return onsen.quietness_score + onsen.solitude_score + onsen.accessibility_score


def split_name_keywords(keywords: list[str], all_names: list[str]) -> tuple[list[str], list[str]]:
    """コアキーワード分割後、一番最初に行う施設名の部分一致チェック。

    いずれかの施設名に部分一致するキーワードは「施設名キーワード」として切り出す。
    切り出したキーワードは後続のタグ変換・本文類似度に回さない（例:「知床」が
    car_requiredタグに誤変換されて肝心の知床の宿が除外される、という取りこぼしを防ぐ）。
    戻り値: (施設名キーワード, それ以外のキーワード)
    """
    name_kws, rest = [], []
    for kw in keywords:
        if kw and any(kw in name for name in all_names):
            name_kws.append(kw)
        else:
            rest.append(kw)
    return name_kws, rest


def match_facility_names(name_keywords: list[str], candidates: list[Onsen]) -> set[int]:
    """施設名キーワードに部分一致する候補のIDを返す（並び替えのブースト用）。

    ハードフィルタではないため、一致しない施設を候補から除外することはない。
    """
    matched_ids: set[int] = set()
    for onsen in candidates:
        if any(kw in onsen.name for kw in name_keywords):
            matched_ids.add(onsen.id)
    return matched_ids


@dataclass
class MatchedTag:
    keyword: str      # 変換元のキーワード
    tag_id: str       # 変換先タグのtag_id
    label: str        # 変換先タグの表示ラベル
    similarity: float # 判定時の絶対類似度（デバッグ用）


def classify_keywords(
    keywords: list[str], index: VectorIndex, embedder: Embedder
) -> tuple[list[MatchedTag], list[str]]:
    """コアキーワードの2段階処理（SEARCH_DESIGN.md 3.4節）。

    各キーワードについて、まずタグのlabelと完全一致するかを確認する（下記参照）。
    一致しなければ既存タグの説明文とベクトル類似度を計算し、1位タグとの絶対類似度が
    閾値以上ならそのタグに変換（タグ層に合流）。そうでなければ、本文類似度用のクエリとして保持する。

    完全一致ショートカット: 導入時（ruri-v3-70m使用時）は類似度が0.84〜0.86の
    極めて狭い帯域に圧縮される異方性が強く、キーワードがタグ名そのものであっても
    無関係な別タグにわずかな差で負けることがあった（例:「にごり湯」→「炭酸水素塩泉」に誤変換、
    実測 0.8526 vs 0.8464）。モデルをruri-v3-310mに変更後はこの種の誤変換は起きにくくなったが、
    完全一致であれば曖昧マッチの結果によらず確実に正しいタグへ変換できるほうが望ましいため、
    ショートカットは維持する。キーワードがタグlabelと完全一致する場合は、この曖昧マッチを
    バイパスして直接そのタグに変換する。それ以外のキーワードの挙動は変えない。
    """
    matched: list[MatchedTag] = []
    body_queries: list[str] = []

    if len(index.tag_matrix) == 0:
        return matched, keywords

    label_to_tag_id = {label: tag_id for tag_id, label in index.tag_labels.items()}

    for kw in keywords:
        exact_tag_id = label_to_tag_id.get(kw)
        if exact_tag_id is not None:
            matched.append(MatchedTag(keyword=kw, tag_id=exact_tag_id, label=kw, similarity=1.0))
            continue

        qv = embedder.embed_query(kw)
        sims = index.tag_matrix @ qv
        best_idx = int(np.argmax(sims))
        best_sim = float(sims[best_idx])

        if best_sim >= CORE_KEYWORD_TAG_SIM_THRESHOLD:
            tag_id = index.tag_id_strs[best_idx]
            matched.append(MatchedTag(keyword=kw, tag_id=tag_id, label=index.tag_labels[tag_id], similarity=best_sim))
        else:
            body_queries.append(kw)

    return matched, body_queries


def hard_filter(
    db: Session,
    required_tag_ids: set[str],
    prefecture: Optional[str],
    area: Optional[str],
    budget_max: Optional[int],
    trip_type: Optional[str] = None,
    ic_minutes_max: Optional[int] = None,
    station_walk_minutes_max: Optional[int] = None,
) -> list[Onsen]:
    """タグ・地域・予算・日帰り/宿泊・アクセス時間によるハードフィルタ（SEARCH_DESIGN.md 7.2節 Step3-4）。"""
    q = db.query(Onsen).options(
        joinedload(Onsen.onsen_tags).joinedload(OnsenTag.tag)
    )
    if prefecture:
        q = q.filter(Onsen.prefecture == prefecture)
    if area:
        q = q.filter(Onsen.area == area)
    if trip_type == "day_trip":
        q = q.filter(Onsen.day_trip_available.is_(True))
    elif trip_type == "stay":
        q = q.filter(Onsen.accommodation_available.is_(True))

    if budget_max is not None:
        # 予算は旅行タイプに対応する料金で判定する：日帰り→入浴料(admission_fee_min)、
        # 宿泊→1人あたり宿泊料(lodging_fee_min)。料金不明(NULL)は予算内と見なさず除外する。
        # trip_type未指定時は、どちらかの料金が予算内なら通す。
        if trip_type == "day_trip":
            q = q.filter(Onsen.admission_fee_min.isnot(None), Onsen.admission_fee_min <= budget_max)
        elif trip_type == "stay":
            q = q.filter(Onsen.lodging_fee_min.isnot(None), Onsen.lodging_fee_min <= budget_max)
        else:
            q = q.filter(or_(
                and_(Onsen.admission_fee_min.isnot(None), Onsen.admission_fee_min <= budget_max),
                and_(Onsen.lodging_fee_min.isnot(None), Onsen.lodging_fee_min <= budget_max),
            ))

    if ic_minutes_max is not None or station_walk_minutes_max is not None:
        # 「最寄ICから○分以内」「最寄駅から徒歩○分以内」の特殊チップ。値が未取得(NULL)の施設は
        # 条件を満たすか判定できないため除外する（budget_maxと同じ方針）。
        q = q.join(OnsenAccess, OnsenAccess.onsen_id == Onsen.id, isouter=True)
        if ic_minutes_max is not None:
            q = q.filter(
                OnsenAccess.nearest_ic_minutes.isnot(None),
                OnsenAccess.nearest_ic_minutes <= ic_minutes_max,
            )
        if station_walk_minutes_max is not None:
            q = q.filter(
                OnsenAccess.nearest_station_walk_minutes.isnot(None),
                OnsenAccess.nearest_station_walk_minutes <= station_walk_minutes_max,
            )

    candidates = q.all()

    if not required_tag_ids:
        return candidates

    result = []
    for onsen in candidates:
        approved = {
            ot.tag.tag_id for ot in onsen.onsen_tags if ot.status == "approved"
        }
        if required_tag_ids.issubset(approved):
            result.append(onsen)
    return result


def rank_and_select(
    candidates: list[Onsen],
    body_queries: list[str],
    index: VectorIndex,
    embedder: Embedder,
    name_matched_ids: set[int] = frozenset(),
    top_n: Optional[int] = None,
) -> list[Onsen]:
    """本文類似度（あれば）または秘湯度で並べ、上位N件を返す（SEARCH_DESIGN.md 7.2節 Step5）。

    施設名の部分一致（name_matched_ids）は最優先のブーストとして先頭に立てる。
    フィルタではないため、一致しない施設も引き続き候補に残ったまま順位だけが下がる。
    top_n=None（既定）の場合は絞り込まず、候補全件を並び替えて返す。
    """
    def name_boost(onsen: Onsen) -> int:
        return 1 if onsen.id in name_matched_ids else 0

    if not body_queries:
        ranked = sorted(candidates, key=lambda o: (name_boost(o), hiyu_do(o)), reverse=True)
        return ranked if top_n is None else ranked[:top_n]

    query_vectors = [embedder.embed_query(q) for q in body_queries]

    def similarity_score(onsen: Onsen) -> float:
        mask = index.chunk_onsen_ids == onsen.id
        chunk_matrix = index.chunk_matrix[mask]
        if len(chunk_matrix) == 0:
            return -1.0
        sims = [max_chunk_similarity(qv, chunk_matrix) for qv in query_vectors]
        return sum(sims) / len(sims)

    ranked = sorted(
        candidates,
        key=lambda o: (name_boost(o), similarity_score(o), hiyu_do(o)),
        reverse=True,
    )
    return ranked if top_n is None else ranked[:top_n]


@dataclass
class SearchResult:
    onsens: list[Onsen]
    matched_tags: list[MatchedTag] = field(default_factory=list)   # コア入力からタグに変換されたもの
    body_queries: list[str] = field(default_factory=list)          # 本文類似度クエリとして扱われたもの
    name_matched_slugs: list[str] = field(default_factory=list)    # 施設名に部分一致した施設（デバッグ用）


def search_onsens(
    db: Session,
    index: VectorIndex,
    embedder: Embedder,
    core: str,
    tag_ids: list[str],
    budget_max: Optional[int] = None,
    prefecture: Optional[str] = None,
    area: Optional[str] = None,
    trip_type: Optional[str] = None,
    ic_minutes_max: Optional[int] = None,
    station_walk_minutes_max: Optional[int] = None,
    top_n: Optional[int] = None,
) -> SearchResult:
    """検索フロー全体（SEARCH_DESIGN.md 7.2節・7.5節の実装）。"""
    keywords = core.split()

    # ステップ0（コア入力分割後、一番最初に行う）：施設名の部分一致チェック。
    # 施設名にヒットしたキーワードは切り出し、後続のタグ変換・本文類似度に回さない
    # （「知床」がcar_requiredタグに誤変換され知床の宿自身が除外される取りこぼしを防ぐ）。
    all_names = [name for (name,) in db.query(Onsen.name).all()]
    name_keywords, rest_keywords = split_name_keywords(keywords, all_names)

    matched_tags, body_queries = classify_keywords(rest_keywords, index, embedder)

    required_tag_ids = {m.tag_id for m in matched_tags} | set(tag_ids)

    candidates = hard_filter(
        db, required_tag_ids, prefecture, area, budget_max, trip_type,
        ic_minutes_max, station_walk_minutes_max,
    )
    name_matched_ids = match_facility_names(name_keywords, candidates)

    onsens = rank_and_select(
        candidates, body_queries, index, embedder,
        name_matched_ids=name_matched_ids, top_n=top_n,
    )

    return SearchResult(
        onsens=onsens,
        matched_tags=matched_tags,
        body_queries=body_queries,
        name_matched_slugs=[o.slug for o in candidates if o.id in name_matched_ids],
    )
