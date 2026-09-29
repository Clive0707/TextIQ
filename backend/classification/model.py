"""
TrainedModel: the persisted unit of prediction. It bundles the preprocessing
configuration, the fitted vectorizer, the fitted estimator, the label mapping and
metadata, so predictions never retrain and always match training-time settings.
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from classification.features import display_names, word_vocabulary
from classification.registry import get_spec
from explainability.explain import class_weight_matrix, explain_row
from preprocessing.text import TextPreprocessor

ARTIFACT_VERSION = 1


class TrainedModel:
    def __init__(self, model_type: str, preprocessor: TextPreprocessor, vectorizer, estimator, feature_label: str, metadata: dict):
        self.version = ARTIFACT_VERSION
        self.model_type = model_type
        self.preprocessor = preprocessor
        self.vectorizer = vectorizer
        self.estimator = estimator
        self.labels: list[str] = [str(c) for c in estimator.classes_]
        self.feature_label = feature_label
        self.metadata = metadata
        self._weights = None
        self._feature_names = None

    # ---- persistence -------------------------------------------------------------
    def save(self, path: Path) -> None:
        self._weights = None
        self._feature_names = None
        joblib.dump(self, path, compress=3)

    @staticmethod
    def load(path: Path) -> "TrainedModel":
        model = joblib.load(path)
        if not isinstance(model, TrainedModel) or getattr(model, "version", None) != ARTIFACT_VERSION:
            raise ValueError("Incompatible model artifact.")
        return model

    # ---- inference ---------------------------------------------------------------
    @property
    def spec(self):
        return get_spec(self.model_type)

    def vectorize(self, texts: list[str]):
        return self.vectorizer.transform(self.preprocessor.transform(texts))

    def predict_proba(self, X) -> np.ndarray:
        return self.estimator.predict_proba(X)

    def decision_scores(self, X) -> np.ndarray | None:
        """Raw SVM margins (not probabilities). Averaged over calibration folds."""
        if not self.spec.has_margin:
            return None
        scores = np.mean([cc.estimator.decision_function(X) for cc in self.estimator.calibrated_classifiers_], axis=0)
        if scores.ndim == 1:  # binary: margin for classes_[1]
            scores = np.column_stack([-scores, scores])
        return scores

    def _names(self):
        if self._feature_names is None:
            self._feature_names = display_names(self.vectorizer)
        return self._feature_names

    def _explainer(self):
        if self._weights is None and self.spec.explanation != "none":
            self._weights = class_weight_matrix(self.estimator, self.spec.explanation, len(self.labels))
        return self._weights, self._names()

    def _top_terms(self, X, k: int = 8) -> list[dict]:
        """Highest-weighted non-zero entries of the document vector, for display."""
        row = X.tocsr()
        if row.nnz == 0:
            return []
        order = np.argsort(-row.data)[:k]
        names = self._names()
        return [{"term": str(names[row.indices[i]]), "weight": round(float(row.data[i]), 4)} for i in order]

    def classify(self, text: str, top_k: int = 8) -> dict:
        trace = self.preprocessor.trace(text)
        X = self.vectorizer.transform([trace["final"]])
        proba = self.predict_proba(X)[0]
        order = np.argsort(-proba)
        best = int(order[0])

        scores = self.decision_scores(X)
        decision = None
        if scores is not None:
            decision = [{"label": self.labels[i], "score": round(float(scores[0, i]), 4)} for i in order]

        spec = self.spec
        if spec.explanation == "none":
            explanation = {"available": False, "method": None, "note": spec.explanation_note, "target_label": self.labels[best], "supporting": [], "opposing": []}
        else:
            weights, names = self._explainer()
            parts = explain_row(X, weights, best, names, top_k)
            explanation = {"available": True, "method": spec.explanation, "note": spec.explanation_note, "target_label": self.labels[best], **parts}

        vocab_tokens = trace["final"].split()
        vocab = word_vocabulary(self.vectorizer)
        in_vocab = sum(1 for t in vocab_tokens if t in vocab) if vocab is not None else None
        return {
            "predicted_label": self.labels[best],
            "confidence": float(proba[best]),
            "probability_method": spec.probability_method,
            "probabilities": [{"label": self.labels[i], "probability": round(float(proba[i]), 6)} for i in order],
            "decision_scores": decision,
            "preprocessing": trace,
            "vector": {
                "n_nonzero": int(X.nnz),
                "n_features": int(X.shape[1]),
                "n_tokens": len(vocab_tokens),
                "n_in_vocabulary": in_vocab if in_vocab is not None else int(X.nnz),
                "kind": self.metadata.get("feature", {}).get("kind", "tfidf"),
                "top_terms": self._top_terms(X),
            },
            "explanation": explanation,
        }

    def classify_many(self, texts: list[str]) -> tuple[list[str], list[float]]:
        X = self.vectorize(texts)
        proba = self.predict_proba(X)
        idx = proba.argmax(axis=1)
        return [self.labels[i] for i in idx], [float(proba[r, i]) for r, i in enumerate(idx)]
