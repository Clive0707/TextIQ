"""Evaluation on the held-out test split (and optional stratified k-fold CV)."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support


def evaluate(y_true, y_pred, labels: list[str]) -> dict:
    p_macro, r_macro, f_macro, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, average="macro", zero_division=0)
    p_w, r_w, f_w, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, average="weighted", zero_division=0)
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=labels, average=None, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision_macro": float(p_macro),
        "recall_macro": float(r_macro),
        "f1_macro": float(f_macro),
        "precision_weighted": float(p_w),
        "recall_weighted": float(r_w),
        "f1_weighted": float(f_w),
        "per_class": [
            {"label": lbl, "precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
            for i, lbl in enumerate(labels)
        ],
        "confusion_matrix": {"labels": list(labels), "matrix": cm.astype(int).tolist()},
    }


def distribution_stats(counts: list[int]) -> dict | None:
    """Shannon entropy of the class distribution and max/min imbalance ratio."""
    arr = np.asarray([c for c in counts if c > 0], dtype=float)
    if arr.size < 2:
        return None
    p = arr / arr.sum()
    return {
        "entropy_bits": float(-(p * np.log2(p)).sum()),
        "max_entropy_bits": float(np.log2(arr.size)),
        "imbalance_ratio": float(arr.max() / arr.min()),
    }
