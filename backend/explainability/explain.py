"""
Per-document feature contributions, only where they are mathematically meaningful.

* Linear models (LinearSVC, LogisticRegression): the class score is Σ x_i·w_ci + b_c,
  so x_i·w_ci is exactly feature i's additive contribution to class c's score.
* Naive Bayes: the joint log-likelihood is Σ x_i·log θ_ci + log prior_c. We report
  x_i·(log θ_ci − mean_k log θ_ki), i.e. how much the term favours class c relative to
  the average class — the part that actually changes the argmax.
* RBF SVM: no per-feature weights exist, so no explanation is produced.
"""
from __future__ import annotations

import numpy as np
from scipy import sparse


def class_weight_matrix(estimator, explanation: str, n_classes: int) -> np.ndarray | None:
    """Returns an (n_classes, n_features) matrix W such that contribution = x * W[c]."""
    if explanation == "coefficients":
        if hasattr(estimator, "calibrated_classifiers_"):
            coefs = [cc.estimator.coef_ for cc in estimator.calibrated_classifiers_]
            coef = np.mean(coefs, axis=0)
        else:
            coef = estimator.coef_
        coef = np.asarray(coef, dtype=np.float64)
        if coef.shape[0] == 1 and n_classes == 2:
            # Binary linear models store one weight vector for the positive class.
            coef = np.vstack([-coef[0], coef[0]])
        return coef
    if explanation == "naive_bayes":
        if hasattr(estimator, "calibrated_classifiers_"):
            flp = np.mean([cc.estimator.feature_log_prob_ for cc in estimator.calibrated_classifiers_], axis=0)
        else:
            flp = estimator.feature_log_prob_
        flp = np.asarray(flp, dtype=np.float64)
        return flp - flp.mean(axis=0, keepdims=True)
    return None


def explain_row(x_row: sparse.csr_matrix, weights: np.ndarray, target: int, feature_names: np.ndarray, top_k: int = 8) -> dict:
    """Top supporting and opposing features present in this document for class `target`."""
    row = x_row.tocsr()
    idx = row.indices
    if idx.size == 0:
        return {"supporting": [], "opposing": []}
    values = row.data
    w = weights[target, idx]
    contrib = values * w
    order = np.argsort(contrib)

    def pack(positions):
        return [
            {
                "feature": str(feature_names[idx[p]]),
                "value": round(float(values[p]), 6),
                "weight": round(float(w[p]), 6),
                "contribution": round(float(contrib[p]), 6),
            }
            for p in positions
        ]

    pos = [p for p in order[::-1] if contrib[p] > 0][:top_k]
    neg = [p for p in order if contrib[p] < 0][:top_k]
    return {"supporting": pack(pos), "opposing": pack(neg)}
