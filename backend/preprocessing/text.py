"""
Text preprocessing: lowercasing, punctuation removal, tokenisation, stop-word
removal, optional Porter stemming and whitespace normalisation.

The same TextPreprocessor instance is fitted into every trained model artifact, so
prediction always uses exactly the preprocessing the model was trained with.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass
from functools import lru_cache

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

try:  # NLTK is optional; stemming is disabled if it is missing.
    from nltk.stem import PorterStemmer

    _STEMMER = PorterStemmer()
except Exception:  # pragma: no cover
    _STEMMER = None

# Word tokens: letters/digits with an optional apostrophe suffix ("don't", "user's").
WORD_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.UNICODE)
# With punctuation kept, each punctuation mark becomes its own token.
WORD_OR_PUNCT_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?|[^\w\s]", re.UNICODE)
WHITESPACE_RE = re.compile(r"\s+")

STOP_WORDS = frozenset(ENGLISH_STOP_WORDS)


def stemming_available() -> bool:
    return _STEMMER is not None


@lru_cache(maxsize=200_000)
def _stem(token: str) -> str:
    return _STEMMER.stem(token) if _STEMMER else token


@dataclass(frozen=True)
class PreprocessConfig:
    lowercase: bool = True
    remove_punctuation: bool = True
    remove_stopwords: bool = True
    stemming: bool = False

    @classmethod
    def from_dict(cls, data: dict | None) -> "PreprocessConfig":
        data = data or {}
        values = {}
        for key in ("lowercase", "remove_punctuation", "remove_stopwords", "stemming"):
            if key in data:
                if not isinstance(data[key], bool):
                    raise ValueError(f"Preprocessing option '{key}' must be true or false.")
                values[key] = data[key]
        cfg = cls(**values)
        if cfg.stemming and not stemming_available():
            raise ValueError("Stemming requires NLTK, which is not installed on the server.")
        return cfg

    def to_dict(self) -> dict:
        return asdict(self)


class TextPreprocessor:
    def __init__(self, config: PreprocessConfig):
        self.config = config

    def _normalise(self, text: str) -> str:
        text = unicodedata.normalize("NFKC", text or "")
        if self.config.lowercase:
            text = text.lower()
        return text

    def _tokenise(self, text: str) -> list[str]:
        pattern = WORD_RE if self.config.remove_punctuation else WORD_OR_PUNCT_RE
        return pattern.findall(text)

    def tokens(self, text: str) -> list[str]:
        tokens = self._tokenise(self._normalise(text))
        if self.config.remove_stopwords:
            tokens = [t for t in tokens if t.lower() not in STOP_WORDS]
        if self.config.stemming:
            tokens = [_stem(t) for t in tokens]
        return tokens

    def __call__(self, text: str) -> str:
        """Final processed representation fed to the vectorizer (space-joined tokens)."""
        return " ".join(self.tokens(text))

    def transform(self, texts) -> list[str]:
        return [self(t) for t in texts]

    def trace(self, text: str) -> dict:
        """Step-by-step view of what happened to one document, for the UI."""
        normalised = self._normalise(text)
        raw_tokens = self._tokenise(normalised)
        cleaned = WHITESPACE_RE.sub(" ", " ".join(raw_tokens)).strip()
        kept, removed = [], []
        for t in raw_tokens:
            if self.config.remove_stopwords and t.lower() in STOP_WORDS:
                removed.append(t)
            else:
                kept.append(t)
        final_tokens = [_stem(t) for t in kept] if self.config.stemming else kept
        return {
            "original": text,
            "cleaned": cleaned,
            "tokens": raw_tokens,
            "removed_stopwords": removed,
            "filtered_tokens": kept,
            "final": " ".join(final_tokens),
            "config": self.config.to_dict(),
        }
