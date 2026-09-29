"""
News Categories (8 topics), built from the News Category Dataset v3 (HuffPost, 2012–2022).

Source:  Rishabh Misra, "News Category Dataset", arXiv:2209.11429 (2022)
         https://www.kaggle.com/datasets/rmisra/news-category-dataset
         mirrored at https://huggingface.co/datasets/heegyu/news-category-dataset
Licence: CC BY 4.0 — attribution required, which is shown with the dataset in the app.

HuffPost's 42 section labels are mapped onto 8 plain topic names; sections that do
not clearly belong to one of these topics are excluded rather than forced in. All
mapped records are kept (no down-sampling), so the class imbalance of the source is
preserved and reported.
"""
from __future__ import annotations

import html
import re
import tempfile
import urllib.request
from pathlib import Path

import pandas as pd

from config import DATA_DIR

SOURCE_URL = "https://huggingface.co/datasets/heegyu/news-category-dataset/resolve/main/data.json"
CACHE_FILE = DATA_DIR / "cache" / "news_category_dataset_v3.json"

NAME = "News Categories (8 topics)"
DESCRIPTION = (
    "HuffPost headlines and short descriptions (2012–2022) mapped to 8 topics. "
    "Source: News Category Dataset v3, R. Misra (2022), CC BY 4.0."
)

# HuffPost section → TextIQ topic
CATEGORY_MAP: dict[str, str] = {
    "TECH": "Technology",
    "BUSINESS": "Business",
    "MONEY": "Business",
    "POLITICS": "Politics",
    "SPORTS": "Sports",
    "WELLNESS": "Health",
    "HEALTHY LIVING": "Health",
    "ENTERTAINMENT": "Entertainment",
    "SCIENCE": "Science",
    "WORLD NEWS": "World",
    "WORLDPOST": "World",
    "THE WORLDPOST": "World",
}
TOPICS = ["Technology", "Business", "Politics", "Sports", "Health", "Entertainment", "Science", "World"]

MIN_WORDS = 5
_WS = re.compile(r"\s+")


def _clean(s: str) -> str:
    return _WS.sub(" ", html.unescape(s or "")).strip()


def _join(headline: str, description: str) -> str:
    if not description:
        return headline
    if not headline:
        return description
    sep = " " if headline[-1] in ".!?:;…" else ". "
    return f"{headline}{sep}{description}"


def download(dest: Path = CACHE_FILE) -> Path:
    """Downloads the source file once (≈87 MB) and caches it under data/cache/."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=dest.parent, delete=False, suffix=".part") as tmp:
        with urllib.request.urlopen(SOURCE_URL, timeout=120) as resp:
            while chunk := resp.read(1 << 20):
                tmp.write(chunk)
    Path(tmp.name).replace(dest)
    return dest


def build(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Maps, cleans and de-duplicates the raw records. Returns the final frame
    (id, text, category, headline, source_category, date) and a quality report whose
    numbers are all measured here.
    """
    total = len(raw)
    raw = raw.copy()
    raw["category"] = raw["category"].astype(str).str.strip().str.upper()
    mapped = raw["category"].map(CATEGORY_MAP)
    excluded = raw.loc[mapped.isna(), "category"].value_counts()
    df = raw.loc[mapped.notna()].copy()
    df["topic"] = mapped[mapped.notna()]
    n_mapped = len(df)

    df["headline_c"] = df["headline"].fillna("").map(_clean)
    df["desc_c"] = df["short_description"].fillna("").map(_clean)
    df["text"] = [_join(h, d) for h, d in zip(df["headline_c"], df["desc_c"])]
    headline_only = int(((df["desc_c"] == "") & (df["headline_c"] != "")).sum())

    empty = df["text"] == ""
    n_empty = int(empty.sum())
    df = df[~empty]

    short = df["text"].str.split().str.len() < MIN_WORDS
    n_short = int(short.sum())
    df = df[~short]

    # Exact duplicate texts: identical text with conflicting topics is dropped entirely;
    # otherwise the first occurrence is kept.
    key = df["text"].str.lower()
    topics_per_text = df.groupby(key)["topic"].nunique()
    conflicting = key.map(topics_per_text) > 1
    n_conflicting = int(conflicting.sum())
    df = df[~conflicting]
    key = df["text"].str.lower()
    dup = key.duplicated(keep="first")
    n_dup = int(dup.sum())
    df = df[~dup]

    # Repeated headlines with different descriptions (e.g. weekly roundups) are kept,
    # because their full texts differ; they are only counted.
    n_dup_headlines = int(df["headline_c"].str.lower().duplicated(keep=False).sum())

    df = df.reset_index(drop=True)
    out = pd.DataFrame(
        {
            "id": range(1, len(df) + 1),
            "text": df["text"],
            "category": df["topic"],
            "headline": df["headline_c"],
            "source_category": df["category"],
            "date": pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d"),
        }
    )

    counts = out["category"].value_counts()
    report = {
        "source": "News Category Dataset v3 (HuffPost), R. Misra 2022 — CC BY 4.0",
        "source_url": "https://www.kaggle.com/datasets/rmisra/news-category-dataset",
        "source_records": total,
        "excluded_other_sections": int(total - n_mapped),
        "excluded_sections": len(excluded),
        "mapped_records": n_mapped,
        "empty_text": n_empty,
        "too_short": n_short,
        "min_words": MIN_WORDS,
        "conflicting_duplicates": n_conflicting,
        "duplicate_texts": n_dup,
        "repeated_headlines_kept": n_dup_headlines,
        "headline_only_records": headline_only,
        "final_records": len(out),
        "categories": [{"label": t, "count": int(counts.get(t, 0))} for t in counts.index],
        "mapping": [
            {"topic": t, "sources": [s for s, v in CATEGORY_MAP.items() if v == t], "count": int(counts.get(t, 0))}
            for t in TOPICS
        ],
        "imbalance_ratio": round(float(counts.max() / counts.min()), 2),
        "date_range": [out["date"].min(), out["date"].max()],
    }
    return out, report


def load_frame() -> tuple[pd.DataFrame, dict]:
    path = download()
    raw = pd.read_json(path, lines=True)
    return build(raw)
