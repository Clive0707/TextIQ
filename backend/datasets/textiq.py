"""
TextIQ 120K News Dataset — the project's primary dataset (provided as
TextIQ_120K_Balanced_News_Dataset.csv and stored under data/source/).

Columns: id, text, category (+ metadata: source_topic, domain, published_date, link,
oversampled). Only `text` (feature) and `category` (label) are used for modelling.

Known properties, all re-measured by build_report() rather than assumed:
  * the source topic NATION is presented as the category Politics;
  * the file was balanced to 15,000 rows per category by repeating records, so many rows
    are exact copies. Training removes duplicates before the train/test split
    (datasets/loader.py: training_frame) so copies cannot leak into the test set.
"""
from __future__ import annotations

import pandas as pd

from config import DATA_DIR

SOURCE_FILE = DATA_DIR / "source" / "TextIQ_120K_Balanced_News_Dataset.csv"
NAME = "TextIQ 120K News Dataset"
DESCRIPTION = "News headlines (2012–2020) in 8 categories, 15,000 rows each. Source topic NATION is shown as Politics."
REQUIRED = ("id", "text", "category")


def build_report(df: pd.DataFrame) -> dict:
    """Quality report for the provided file. Every number is computed from `df`."""
    text = df["text"].str.strip()
    key = text.str.lower().str.replace(r"\s+", " ", regex=True)
    cat = df["category"].str.strip()
    counts = cat.value_counts()
    conflicting = key.map(cat.groupby(key).nunique()) > 1
    uniq = pd.DataFrame({"k": key, "c": cat})[~conflicting].drop_duplicates("k")
    uniq_counts = uniq["c"].value_counts()
    exact_cols = [c for c in ("text", "link", "published_date") if c in df.columns]
    words = text.str.split().str.len()

    mapping = []
    if "source_topic" in df.columns:
        pairs = df.groupby([df["source_topic"].str.strip(), cat]).size()
        for (src, dst), n in pairs.items():
            mapping.append({"source": src, "category": dst, "rows": int(n)})
        mapping.sort(key=lambda m: m["category"])

    oversampled = None
    if "oversampled" in df.columns:
        oversampled = int((df["oversampled"].str.strip().str.lower() == "true").sum())

    return {
        "kind": "textiq",
        "rows": len(df),
        "categories": [{"label": str(k), "rows": int(v), "unique": int(uniq_counts.get(k, 0))} for k, v in counts.items()],
        "missing_text": int((text == "").sum()),
        "missing_category": int((cat == "").sum()),
        "duplicate_ids": int(df["id"].duplicated().sum()),
        "duplicate_texts": int(key.duplicated().sum()),
        "exact_copies": int(df.duplicated(subset=exact_cols).sum()),
        "exact_copy_columns": exact_cols,
        "conflicting_rows": int(conflicting.sum()),
        "unique_documents": int(len(uniq)),
        "short_texts": int((words < 3).sum()),
        "words": {"min": int(words.min()), "median": float(words.median()), "mean": round(float(words.mean()), 1), "max": int(words.max())},
        "source_mapping": mapping,
        "oversampled_flag_rows": oversampled,
        "date_range": [str(df["published_date"].min())[:10], str(df["published_date"].max())[:10]] if "published_date" in df.columns else None,
        "metadata_columns": [c for c in df.columns if c not in ("text", "category")],
    }


def load_frame() -> tuple[pd.DataFrame, dict]:
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Place TextIQ_120K_Balanced_News_Dataset.csv in {SOURCE_FILE.parent}")
    df = pd.read_csv(SOURCE_FILE, dtype=str, keep_default_na=False)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"The TextIQ dataset is missing required columns: {', '.join(missing)}")
    return df, build_report(df)
