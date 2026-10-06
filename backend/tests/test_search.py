import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np

with patch.dict(os.environ, DATABASE_URL="sqlite:///:memory:"):
    from app.search import classify_keywords, rank_and_select, split_name_keywords
    from app.vector_index import VectorIndex


def index():
    return VectorIndex(
        tag_ids=[1], tag_id_strs=["nigoriyu"], tag_labels={"nigoriyu": "にごり湯"},
        tag_matrix=np.array([[1.0, 0.0]]), chunk_onsen_ids=np.array([1, 2]),
        chunk_matrix=np.array([[1.0, 0.0], [0.0, 1.0]]),
    )


def onsen(id, score):
    return SimpleNamespace(id=id, quietness_score=score, solitude_score=score, accessibility_score=score)


class SearchTests(unittest.TestCase):
    def test_name_is_separated_before_semantic_classification(self):
        self.assertEqual(split_name_keywords(["知床", "静か"], ["知床の宿"]), (["知床"], ["静か"]))

    def test_exact_label_bypasses_embedding(self):
        def fail(_):
            raise AssertionError("exact label should not use embedding")
        tags, queries = classify_keywords(["にごり湯"], index(), SimpleNamespace(embed_query=fail))
        self.assertEqual([t.tag_id for t in tags], ["nigoriyu"])
        self.assertEqual(queries, [])

    def test_threshold_splits_tag_and_body_queries(self):
        vectors = {"濁り湯": np.array([0.9, 0.43589]), "宇宙船": np.array([0.7, 0.71414])}
        tags, queries = classify_keywords(list(vectors), index(), SimpleNamespace(embed_query=vectors.__getitem__))
        self.assertEqual([t.keyword for t in tags], ["濁り湯"])
        self.assertEqual(queries, ["宇宙船"])

    def test_name_boost_keeps_other_candidates(self):
        ranked = rank_and_select([onsen(1, 1), onsen(2, 5)], [], index(), None, name_matched_ids={1})
        self.assertEqual([o.id for o in ranked], [1, 2])

    def test_body_similarity_has_priority_over_score(self):
        embedder = SimpleNamespace(embed_query=lambda _: np.array([1.0, 0.0]))
        ranked = rank_and_select([onsen(2, 5), onsen(1, 1)], ["渓谷"], index(), embedder)
        self.assertEqual([o.id for o in ranked], [1, 2])


if __name__ == "__main__":
    unittest.main()
