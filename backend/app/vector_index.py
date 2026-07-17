"""起動時に全ベクトルをメモリにロードするインデックス（ALGORITHM.md 6.2節）。

リクエストごとのDB問い合わせを避け、フラットな行列＋インデックス配列として保持する。
ベクトル演算をBLASの行列積1回にまとめるため、辞書構造ではなくnumpy配列を使う。
"""
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from .embeddings import MODEL_VERSION, deserialize_vector
from .models import OnsenEmbedding, Tag, TagEmbedding


@dataclass
class VectorIndex:
    tag_ids: list[int]          # 各行が対応する tags.id
    tag_id_strs: list[str]      # 各行が対応する tags.tag_id（文字列キー）
    tag_labels: dict[str, str]  # tag_id文字列 -> label（デバッグ表示用）
    tag_matrix: np.ndarray       # (N_normal_tags, dim) 正規化済み。type='normal'のみ
    chunk_onsen_ids: np.ndarray  # (N_chunks,) int64 — 各行が属する温泉ID
    chunk_matrix: np.ndarray     # (N_chunks, dim) 正規化済み


def build_vector_index(db: Session, model_version: str = MODEL_VERSION) -> VectorIndex:
    """FastAPIのlifespanで起動時に1回構築し、app.stateに保持する。"""

    # コアキーワードのタグ変換対象は通常タグ（type='normal'）のみ。
    # 特殊チップ（予算等）は値を伴うため、キーワード一致では扱わない。
    tag_rows = (
        db.query(TagEmbedding, Tag)
        .join(Tag, Tag.id == TagEmbedding.tag_id)
        .filter(TagEmbedding.model_version == model_version, Tag.tag_type == "normal")
        .all()
    )
    tag_ids = [tag.id for _, tag in tag_rows]
    tag_id_strs = [tag.tag_id for _, tag in tag_rows]
    tag_labels = {tag.tag_id: tag.label for _, tag in tag_rows}
    tag_matrix = (
        np.stack([deserialize_vector(te.vector, te.dim) for te, _ in tag_rows])
        if tag_rows
        else np.zeros((0, 0), dtype="<f4")
    )

    chunk_rows = (
        db.query(OnsenEmbedding)
        .filter(OnsenEmbedding.model_version == model_version)
        .all()
    )
    chunk_onsen_ids = np.array([c.onsen_id for c in chunk_rows], dtype=np.int64)
    chunk_matrix = (
        np.stack([deserialize_vector(c.vector, c.dim) for c in chunk_rows])
        if chunk_rows
        else np.zeros((0, 0), dtype="<f4")
    )

    return VectorIndex(
        tag_ids=tag_ids,
        tag_id_strs=tag_id_strs,
        tag_labels=tag_labels,
        tag_matrix=tag_matrix,
        chunk_onsen_ids=chunk_onsen_ids,
        chunk_matrix=chunk_matrix,
    )
