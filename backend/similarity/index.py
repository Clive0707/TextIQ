"""
Cosine-similarity search over a model's training corpus.

This is deliberately independent of classification: it reuses the model's fitted
vector space (so similarity is measured in the same features), but it never
influences the predicted label. It answers "which known documents look like this
text?", not "what class is this text?".
"""
from __future__ import annotations

import re

import numpy as np
from scipy import sparse
from sklearn.preprocessing import normalize

_WS = re.compile(r"\s+")


def snippet(text: str, limit: int = 280) -> str:
    text = _WS.sub(" ", text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


class SimilarityIndex:
    def __init__(self, matrix: sparse.spmatrix, snippets: list[str], labels: list[str]):
        # Row-normalise once so cosine similarity becomes a sparse dot product.
        self.matrix = normalize(sparse.csr_matrix(matrix, dtype=np.float32), norm="l2", copy=False)
        self.snippets = snippets
        self.labels = labels

    @property
    def size(self) -> int:
        return self.matrix.shape[0]

    def query(self, vector: sparse.spmatrix, k: int = 5) -> list[dict]:
        q = normalize(sparse.csr_matrix(vector, dtype=np.float32), norm="l2")
        if q.nnz == 0:
            return []
        sims = np.asarray((self.matrix @ q.T).todense()).ravel()
        k = min(k, sims.size)
        top = np.argpartition(-sims, k - 1)[:k]
        top = top[np.argsort(-sims[top])]
        return [
            {"index": int(i), "snippet": self.snippets[i], "label": self.labels[i], "similarity": round(float(sims[i]), 4)}
            for i in top
            if sims[i] > 0
        ]
