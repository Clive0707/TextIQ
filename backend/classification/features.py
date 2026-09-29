"""Feature extraction: Bag-of-Words (CountVectorizer), TF-IDF (TfidfVectorizer) and word + character TF-IDF."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.pipeline import FeatureUnion

FEATURE_KINDS = ("tfidf", "bow", "char", "combo")

# 'combo' = word TF-IDF (configurable n-grams) + character TF-IDF over word boundaries.
COMBO_CHAR_RANGE = (2, 5)
COMBO_CHAR_MAX_FEATURES = 200_000

# Text reaching the vectorizer is already tokenised by TextPreprocessor and joined
# with single spaces, so words are simply the non-space runs.
PRETOKENISED = r"(?u)\S+"


@dataclass(frozen=True)
class FeatureConfig:
    kind: str = "tfidf"
    ngram_min: int = 1
    ngram_max: int = 2
    max_features: int | None = 20000
    sublinear_tf: bool = True
    min_df: int = 2

    @classmethod
    def from_dict(cls, data: dict | None) -> "FeatureConfig":
        data = data or {}
        kind = data.get("kind", "tfidf")
        if kind not in FEATURE_KINDS:
            raise ValueError("Feature representation must be 'tfidf', 'bow', 'char' or 'combo'.")

        def as_int(key, default):
            v = data.get(key, default)
            if v is None:
                return None
            if isinstance(v, bool) or not isinstance(v, (int, float)) or int(v) != v:
                raise ValueError(f"'{key}' must be a whole number.")
            return int(v)

        default_range = (3, 5) if kind == "char" else (1, 2)
        lo = as_int("ngram_min", default_range[0])
        hi = as_int("ngram_max", default_range[1])
        bounds = (2, 6) if kind == "char" else (1, 3)
        if lo is None or hi is None or not (bounds[0] <= lo <= hi <= bounds[1]):
            unit = "Character" if kind == "char" else "Word"
            raise ValueError(f"{unit} n-gram range must satisfy {bounds[0]} ≤ min ≤ max ≤ {bounds[1]}.")
        max_features = as_int("max_features", 20000)
        if max_features is not None and not (100 <= max_features <= 500_000):
            raise ValueError("Max features must be between 100 and 500,000 (or empty for no limit).")
        min_df = as_int("min_df", 2)
        if min_df is None or not (1 <= min_df <= 50):
            raise ValueError("Minimum document frequency must be between 1 and 50.")
        sublinear = data.get("sublinear_tf", True)
        if not isinstance(sublinear, bool):
            raise ValueError("'sublinear_tf' must be true or false.")
        if kind == "bow":
            sublinear = False  # only meaningful for TF-IDF weighting
        return cls(kind, lo, hi, max_features, sublinear, min_df)

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def label(self) -> str:
        rng = f"{self.ngram_min}-gram" if self.ngram_min == self.ngram_max else f"{self.ngram_min},{self.ngram_max}-gram"
        if self.kind == "char":
            return f"Char n-grams ({self.ngram_min}–{self.ngram_max})"
        if self.kind == "bow":
            return f"Bag of Words ({rng})"
        if self.kind == "combo":
            return f"TF-IDF words ({rng}) + characters ({COMBO_CHAR_RANGE[0]}–{COMBO_CHAR_RANGE[1]})"
        return f"TF-IDF ({rng}{', sublinear' if self.sublinear_tf else ''})"


def build_vectorizer(cfg: FeatureConfig):
    common = dict(ngram_range=(cfg.ngram_min, cfg.ngram_max), max_features=cfg.max_features, min_df=cfg.min_df, lowercase=False, dtype=np.float64)
    if cfg.kind == "bow":
        return CountVectorizer(token_pattern=PRETOKENISED, **common)
    if cfg.kind == "char":
        return TfidfVectorizer(analyzer="char_wb", sublinear_tf=cfg.sublinear_tf, **common)
    if cfg.kind == "combo":
        chars = TfidfVectorizer(analyzer="char_wb", ngram_range=COMBO_CHAR_RANGE, sublinear_tf=cfg.sublinear_tf, min_df=2, max_features=COMBO_CHAR_MAX_FEATURES, lowercase=False, dtype=np.float64)
        return FeatureUnion([("words", TfidfVectorizer(token_pattern=PRETOKENISED, sublinear_tf=cfg.sublinear_tf, **common)), ("chars", chars)])
    return TfidfVectorizer(token_pattern=PRETOKENISED, sublinear_tf=cfg.sublinear_tf, **common)


def vocab_size(vectorizer) -> int:
    return int(len(vectorizer.get_feature_names_out()))


def word_vocabulary(vectorizer) -> dict | None:
    """Word vocabulary (for 'n of m tokens known'); None for pure character features."""
    if isinstance(vectorizer, FeatureUnion):
        return dict(vectorizer.transformer_list)["words"].vocabulary_
    if getattr(vectorizer, "analyzer", "word") != "word":
        return None
    return vectorizer.vocabulary_


def display_names(vectorizer) -> np.ndarray:
    """Feature names for display; character n-grams of the combined representation are shown as ‹…›."""
    names = vectorizer.get_feature_names_out()
    if not isinstance(vectorizer, FeatureUnion):
        return names
    return np.array([n[len("words__"):] if n.startswith("words__") else f"‹{n[len('chars__'):]}›" for n in names], dtype=object)
