"""埋め込みモデル・チャンク分割・ベクトルシリアライズ
"""
import hashlib
import re

import numpy as np
from sentence_transformers import SentenceTransformer

MODEL_VERSION = "cl-nagoya/ruri-v3-310m"

_QUERY_PREFIX = "検索クエリ: "
_DOCUMENT_PREFIX = "検索文書: "

CHUNK_SOFT_LIMIT = 400   # 段落マージの上限（これを超えないようにまとめる）
CHUNK_HARD_LIMIT = 500   # これを超えたら句点で強制分割


class Embedder:
    """Ruri v3 の非対称接頭辞規則をここに吸収する。DBには接頭辞なしの原文のみ保存する。"""

    def __init__(self, model_version: str = MODEL_VERSION):
        self.model_version = model_version
        self._model = SentenceTransformer(model_version)

    def embed_query(self, text: str) -> np.ndarray:
        return self._encode(_QUERY_PREFIX + text)

    def embed_document(self, text: str) -> np.ndarray:
        return self._encode(_DOCUMENT_PREFIX + text)

    def _encode(self, text: str) -> np.ndarray:
        vec = self._model.encode(text, normalize_embeddings=True)
        return np.asarray(vec, dtype="<f4")


def serialize_vector(vec: np.ndarray) -> bytes:
    return vec.astype("<f4").tobytes()


def deserialize_vector(blob: bytes, dim: int) -> np.ndarray:
    vec = np.frombuffer(blob, dtype="<f4")
    assert len(vec) == dim, f"ベクトル次元数の不一致: expected {dim}, got {len(vec)}"
    return vec


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def max_chunk_similarity(query_vector: np.ndarray, chunk_matrix: np.ndarray) -> float:
    """正規化済みベクトル前提。内積 = コサイン類似度。"""
    return float((chunk_matrix @ query_vector).max())


def split_into_chunks(markdown_text: str) -> list[str]:
    """ALGORITHM.md 3.1節のルールに従い、本文をチャンクに分割する。

    1. 見出し（##）でセクションに分割
    2. セクション内を空行（段落）でさらに分割
    3. 隣接する段落を400字上限で貪欲マージ
    4. マージ後も500字を超える段落は「。」で分割
    各チャンクの先頭にはそのセクションの見出しを付与する(3.2節)。
    """
    sections = _split_by_heading(markdown_text)

    chunks: list[str] = []
    for heading, body in sections:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
        merged = _greedy_merge(paragraphs, CHUNK_SOFT_LIMIT)
        for m in merged:
            for piece in _split_if_too_long(m, CHUNK_HARD_LIMIT):
                chunks.append(f"{heading}\n{piece}" if heading else piece)
    return chunks


def _split_by_heading(text: str) -> list[tuple[str, str]]:
    """"## 見出し" で分割する。先頭に見出しがない本文は heading="" として扱う。"""
    parts = re.split(r"^##\s*(.+)$", text.strip(), flags=re.MULTILINE)
    # re.split with a capturing group returns: [pre, heading1, body1, heading2, body2, ...]
    sections: list[tuple[str, str]] = []
    pre = parts[0].strip()
    if pre:
        sections.append(("", pre))
    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        body = parts[i + 1] if i + 1 < len(parts) else ""
        if body.strip():
            sections.append((heading, body.strip()))
    return sections


def _greedy_merge(paragraphs: list[str], limit: int) -> list[str]:
    merged: list[str] = []
    buf = ""
    for p in paragraphs:
        candidate = f"{buf}\n{p}" if buf else p
        if len(candidate) <= limit or not buf:
            buf = candidate
        else:
            merged.append(buf)
            buf = p
    if buf:
        merged.append(buf)
    return merged


def _split_if_too_long(text: str, limit: int) -> list[str]:
    if len(text) <= limit:
        return [text]
    sentences = [s for s in re.split(r"(?<=。)", text) if s]
    pieces: list[str] = []
    buf = ""
    for s in sentences:
        if len(buf) + len(s) <= limit or not buf:
            buf += s
        else:
            pieces.append(buf)
            buf = s
    if buf:
        pieces.append(buf)
    return pieces
