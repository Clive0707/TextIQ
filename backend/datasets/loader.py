"""Reading, validating and profiling CSV datasets."""
from __future__ import annotations

import csv
from pathlib import Path

import pandas as pd

from config import MAX_DATASET_ROWS, SKLEARN_CACHE_DIR

MIN_USABLE_ROWS = 20
MIN_PER_CLASS = 2
MAX_CLASSES = 500


class DatasetError(ValueError):
    def __init__(self, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.details = details or []


def read_csv(path: Path, max_rows: int = MAX_DATASET_ROWS) -> pd.DataFrame:
    """Reads a CSV as strings. Raises DatasetError with a readable reason on failure."""
    last_error = None
    csv.field_size_limit(10_000_000)
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding=encoding, nrows=max_rows + 1, on_bad_lines="error")
            break
        except UnicodeDecodeError as e:
            last_error = e
            continue
        except pd.errors.EmptyDataError:
            raise DatasetError("The file has no rows or columns.")
        except pd.errors.ParserError as e:
            msg = str(e).split("\n")[0]
            raise DatasetError("The file is not valid CSV.", [msg[:200]])
    else:
        raise DatasetError("The file encoding could not be read. Save it as UTF-8 CSV.", [str(last_error)[:200]])

    if df.shape[1] == 0:
        raise DatasetError("The file has no columns.")
    if len(df) == 0:
        raise DatasetError("The file has a header row but no data rows.")
    if len(df) > max_rows:
        raise DatasetError(f"The file has more than {max_rows:,} rows, which is above the supported limit.")
    df.columns = [str(c).strip() or f"column_{i + 1}" for i, c in enumerate(df.columns)]
    if len(set(df.columns)) != len(df.columns):
        raise DatasetError("Column names must be unique.")
    return df


def guess_columns(df: pd.DataFrame) -> tuple[str | None, str | None]:
    """Heuristic defaults: longest free-text column for text, a low-cardinality column for labels."""
    sample = df.head(2000)
    text_col, best_len = None, 0.0
    for col in sample.columns:
        mean_len = sample[col].str.len().mean()
        if mean_len > best_len:
            text_col, best_len = col, mean_len
    label_col, best_score = None, None
    n = len(sample)
    for col in sample.columns:
        if col == text_col:
            continue
        uniq = sample[col][sample[col].str.strip() != ""].nunique()
        if 2 <= uniq <= min(MAX_CLASSES, max(2, n // 2)):
            score = sample[col].str.len().mean()
            if best_score is None or score < best_score:
                label_col, best_score = col, score
    return text_col, label_col


def dedupe_key(text: pd.Series) -> pd.Series:
    """Normalised text used to detect duplicates (case- and whitespace-insensitive)."""
    return text.str.lower().str.replace(r"\s+", " ", regex=True).str.strip()


def analyze(df: pd.DataFrame, text_col: str | None, label_col: str | None) -> dict:
    """Validation report + class distribution for the chosen columns."""
    errors: list[str] = []
    warnings: list[str] = []
    result = {"status": "needs_columns", "validation": None, "class_distribution": None, "n_classes": None}
    if not text_col or not label_col:
        return result
    if text_col not in df.columns:
        errors.append(f"Text column '{text_col}' does not exist.")
    if label_col not in df.columns:
        errors.append(f"Label column '{label_col}' does not exist.")
    if text_col == label_col:
        errors.append("Text and label columns must be different.")
    if errors:
        result["status"] = "invalid"
        result["validation"] = {"errors": errors, "warnings": [], "empty_text_rows": 0, "missing_label_rows": 0, "duplicate_rows": 0, "usable_rows": 0}
        return result

    text = df[text_col].str.strip()
    label = df[label_col].str.strip()
    empty_text = text == ""
    missing_label = label == ""
    usable = ~(empty_text | missing_label)
    key = dedupe_key(df.loc[usable, text_col])
    lab = label[usable]
    dup = int(key.duplicated().sum())
    topics_per_text = lab.groupby(key).nunique()
    conflicting_mask = key.map(topics_per_text) > 1
    conflicting_rows = int(conflicting_mask.sum())
    unique = pd.DataFrame({"k": key, "y": lab})[~conflicting_mask].drop_duplicates("k")
    unique_counts = unique["y"].value_counts()
    counts = label[usable].value_counts()
    words = text[usable].str.split().str.len()
    dup_ids = int(df["id"].duplicated().sum()) if "id" in df.columns else None

    if int(empty_text.sum()):
        warnings.append(f"{int(empty_text.sum()):,} rows have empty text and will be skipped.")
    if int(missing_label.sum()):
        warnings.append(f"{int(missing_label.sum()):,} rows have no label and will be skipped.")
    if dup:
        warnings.append(
            f"{dup:,} rows repeat the text of another row. Duplicates are removed before the train/test split, "
            f"so the same text can never appear in both — {len(unique):,} unique documents are used for training and testing."
        )
    if conflicting_rows:
        warnings.append(f"{conflicting_rows:,} rows share their text with a row of a different category; these ambiguous texts are excluded from training and testing.")
    if dup_ids:
        warnings.append(f"{dup_ids:,} rows repeat another row's id.")
    if len(counts) < 2:
        errors.append("The label column must contain at least 2 different classes.")
    if len(counts) > MAX_CLASSES:
        errors.append(f"The label column has {len(counts):,} distinct values; at most {MAX_CLASSES} classes are supported. Is it really a label column?")
    if int(usable.sum()) < MIN_USABLE_ROWS:
        errors.append(f"At least {MIN_USABLE_ROWS} rows with both text and a label are required.")
    rare = counts[counts < MIN_PER_CLASS]
    if len(rare):
        warnings.append(f"{len(rare)} class(es) have fewer than {MIN_PER_CLASS} examples and will be excluded from training.")
    if len(counts) >= 2 and counts.min() >= MIN_PER_CLASS and counts.max() / counts.min() > 10:
        warnings.append(f"Classes are strongly imbalanced (largest/smallest = {counts.max() / counts.min():.1f}×). Consider macro-F1 over accuracy.")

    result["validation"] = {
        "errors": errors,
        "warnings": warnings,
        "empty_text_rows": int(empty_text.sum()),
        "missing_label_rows": int(missing_label.sum()),
        "duplicate_rows": dup,
        "conflicting_rows": conflicting_rows,
        "duplicate_ids": dup_ids,
        "usable_rows": int(usable.sum()),
        "unique_rows": int(len(unique)),
        "short_rows": int((words < 3).sum()),
        "words": {"min": int(words.min()), "median": float(words.median()), "mean": round(float(words.mean()), 1), "max": int(words.max())} if len(words) else None,
    }
    result["class_distribution"] = [{"label": str(k), "count": int(v), "unique": int(unique_counts.get(k, 0))} for k, v in counts.items()]
    result["n_classes"] = int(len(counts))
    result["status"] = "invalid" if errors else "ready"
    return result


def training_frame(path: Path, text_col: str, label_col: str) -> tuple[pd.DataFrame, dict]:
    """
    Unique, unambiguous documents for training and evaluation. Only the text and label
    columns are read — metadata columns (ids, URLs, dates, sources) are never features.

    Duplicates are removed *before* any train/test split so that copies of one text can
    never sit on both sides of the split (a common source of inflated test scores).
    Texts that occur with more than one label are dropped as ambiguous.
    """
    df = read_csv(path)
    out = pd.DataFrame({"text": df[text_col].str.strip(), "label": df[label_col].str.strip()})
    n_source = len(out)
    out = out[(out["text"] != "") & (out["label"] != "")]
    key = dedupe_key(out["text"])
    conflicting = key.map(out["label"].groupby(key).nunique()) > 1
    n_conflicting = int(conflicting.sum())
    out, key = out[~conflicting], key[~conflicting]
    dup = key.duplicated(keep="first")
    n_duplicates = int(dup.sum())
    out = out[~dup]
    counts = out["label"].value_counts()
    dropped = sorted(counts[counts < MIN_PER_CLASS].index.tolist())
    if dropped:
        out = out[~out["label"].isin(dropped)]
    info = {"n_source_rows": n_source, "n_duplicates_removed": n_duplicates, "n_conflicting_removed": n_conflicting, "excluded_classes": dropped}
    return out.reset_index(drop=True), info


def fetch_20newsgroups_frame() -> pd.DataFrame:
    """
    The canonical 20 Newsgroups corpus via scikit-learn. Headers, signatures and
    quoted replies are removed (sklearn's recommended setting) so models learn from
    message content rather than metadata.
    """
    from sklearn.datasets import fetch_20newsgroups

    bunch = fetch_20newsgroups(subset="all", remove=("headers", "footers", "quotes"), data_home=str(SKLEARN_CACHE_DIR), download_if_missing=True)
    names = bunch.target_names
    df = pd.DataFrame({"text": [t.strip() for t in bunch.data], "label": [names[i] for i in bunch.target]})
    return df
