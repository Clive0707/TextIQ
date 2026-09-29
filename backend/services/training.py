"""
Background training. Runs are queued and executed one at a time in a separate worker
*process*: scikit-learn fitting holds Python's GIL for long stretches, so a worker thread
would make the API unresponsive during long runs (e.g. an RBF SVM). One worker keeps the
CPU from being oversubscribed. The worker writes progress and results to SQLite itself.
"""
from __future__ import annotations

import json
import logging
import multiprocessing
import threading
import time
import uuid
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool

import joblib
from sklearn.base import clone
import numpy as np
import pandas as pd
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

import db
from classification.features import FeatureConfig, build_vectorizer, vocab_size
from classification.model import TrainedModel
from classification.registry import get_spec
from config import DATASETS_DIR, EXPERIMENTS_DIR, MODELS_DIR
from datasets.loader import training_frame
from evaluation.metrics import evaluate
from preprocessing.text import PreprocessConfig, TextPreprocessor
from services import repository as repo
from similarity.index import SimilarityIndex, snippet

log = logging.getLogger("textiq.training")

HELDOUT_SAMPLES = 300
TUNE_FOLDS = 3
# Kernel SVM grid search is quadratic in documents; tune it on a stratified subset of the training split.
RBF_TUNE_MAX_DOCS = 6000

_executor: ProcessPoolExecutor | None = None
_executor_lock = threading.Lock()


class TrainingFailed(Exception):
    pass


def _pool() -> ProcessPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ProcessPoolExecutor(max_workers=1, mp_context=multiprocessing.get_context("spawn"))
        return _executor


def _on_done(exp_id: int):
    def callback(fut: Future) -> None:
        global _executor
        exc = fut.exception()
        if exc is None:
            return
        # run() records its own failures; this only fires if the worker process itself died.
        log.error("Training worker failed for run %s: %r", exp_id, exc)
        repo.update_experiment(exp_id, status="failed", stage=None, error="The training process stopped unexpectedly (possibly out of memory). Try fewer features or fewer training documents.", completed_at=db.utcnow())
        if isinstance(exc, BrokenProcessPool):
            with _executor_lock:
                _executor = None

    return callback


def enqueue(exp_id: int) -> None:
    _pool().submit(run, exp_id).add_done_callback(_on_done(exp_id))


def _oversample(texts: list[str], labels: list[str], seed: int) -> tuple[list[str], list[str]]:
    """Random oversampling of smaller classes — applied to the TRAINING split only."""
    df = pd.DataFrame({"t": texts, "y": labels})
    target = df["y"].value_counts().max()
    rng = np.random.RandomState(seed)
    parts = [g if len(g) == target else g.sample(target, replace=True, random_state=rng) for _, g in df.groupby("y")]
    out = pd.concat(parts).sample(frac=1.0, random_state=rng)
    return out["t"].tolist(), out["y"].tolist()


def _split_counts(y_train, y_test) -> dict:
    tr, te = pd.Series(y_train).value_counts(), pd.Series(y_test).value_counts()
    return {str(k): {"train": int(tr.get(k, 0)), "test": int(te.get(k, 0))} for k in sorted(set(tr.index) | set(te.index))}


def _tune(spec, feature_cfg, hyper: dict, X_train: list[str], y_train: list[str], seed: int) -> tuple[dict, dict]:
    """
    Small grid search with stratified k-fold CV on the training split only. The vectorizer
    sits inside the pipeline, so it is refitted on each fold's training part (no leakage
    from the validation fold). The test split is never touched here.
    """
    X, y = X_train, y_train
    if spec.type == "rbf_svm" and len(X) > RBF_TUNE_MAX_DOCS:
        X, _, y, _ = train_test_split(X, y, train_size=RBF_TUNE_MAX_DOCS, stratify=y, random_state=seed)
    to_param = lambda k, v: "scale" if (k == "gamma" and not v) else v
    grid = {f"classifier__{k}": [to_param(k, v) for v in vals] for k, vals in spec.grid.items()}
    base = Pipeline([("features", build_vectorizer(feature_cfg)), ("classifier", spec.base(hyper, seed))])
    search = GridSearchCV(base, grid, scoring="f1_macro", cv=StratifiedKFold(TUNE_FOLDS, shuffle=True, random_state=seed), n_jobs=1, refit=False)
    search.fit(X, y)
    from_param = lambda k, v: 0.0 if (k == "gamma" and v == "scale") else v
    best = {k.split("__", 1)[1]: from_param(k.split("__", 1)[1], v) for k, v in search.best_params_.items()}
    results = [
        {"params": {k.split("__", 1)[1]: from_param(k.split("__", 1)[1], v) for k, v in p.items()}, "mean": float(m), "std": float(s)}
        for p, m, s in zip(search.cv_results_["params"], search.cv_results_["mean_test_score"], search.cv_results_["std_test_score"])
    ]
    info = {"scoring": "f1_macro", "folds": TUNE_FOLDS, "n_docs": len(X), "best_params": best, "best_cv_score": float(search.best_score_), "results": results}
    return {**hyper, **best}, info


def _stage(exp_id: int, stage: str, progress: float) -> None:
    repo.update_experiment(exp_id, status="running", stage=stage, progress=round(progress, 3))


def run(exp_id: int) -> None:
    row = repo.get_experiment_row(exp_id)
    try:
        _run(exp_id, row)
    except TrainingFailed as e:
        repo.update_experiment(exp_id, status="failed", stage=None, error=str(e), completed_at=db.utcnow())
    except MemoryError:
        repo.update_experiment(exp_id, status="failed", stage=None, error="Ran out of memory. Reduce max features or cap the training documents.", completed_at=db.utcnow())
    except Exception:
        log.exception("Training run %s failed", exp_id)
        repo.update_experiment(exp_id, status="failed", stage=None, error="Training failed because of an internal error. Check the server log for details.", completed_at=db.utcnow())


def _run(exp_id: int, row) -> None:
    spec = get_spec(row["model_type"])
    feature_cfg = FeatureConfig.from_dict(db.loads(row["feature_json"]))
    prep_cfg = PreprocessConfig.from_dict(db.loads(row["preprocessing_json"]))
    hyper = db.loads(row["hyperparameters_json"], {})
    seed = int(row["random_state"])

    _stage(exp_id, "Loading dataset", 0.03)
    ds = db.query_one("SELECT * FROM datasets WHERE id=?", (row["dataset_id"],))
    if ds is None:
        raise TrainingFailed("The dataset for this run no longer exists.")
    if ds["status"] != "ready":
        raise TrainingFailed("The dataset is not ready for training. Fix the validation errors on the Dataset page.")
    frame, data_info = training_frame(DATASETS_DIR / ds["stored_name"], ds["text_column"], ds["label_column"])
    if frame["label"].nunique() < 2:
        raise TrainingFailed("At least two classes with two or more examples each are required.")

    texts, labels = frame["text"].tolist(), frame["label"].tolist()
    try:
        X_train_raw, X_test_raw, y_train, y_test = train_test_split(texts, labels, test_size=row["test_size"], stratify=labels, random_state=seed)
    except ValueError as e:
        raise TrainingFailed(f"Could not create a stratified train/test split: {e}")

    cap = row["max_train_samples"]
    if cap and cap < len(X_train_raw):
        try:
            X_train_raw, _, y_train, _ = train_test_split(X_train_raw, y_train, train_size=cap, stratify=y_train, random_state=seed)
        except ValueError as e:
            raise TrainingFailed(f"Could not subsample the training split to {cap} documents: {e}")


    _stage(exp_id, "Preprocessing text", 0.12)
    preprocessor = TextPreprocessor(prep_cfg)
    X_train = preprocessor.transform(X_train_raw)
    X_test = preprocessor.transform(X_test_raw)

    tuning = None
    if row["tune"] and spec.grid:
        _stage(exp_id, f"Tuning hyperparameters ({TUNE_FOLDS}-fold CV on training data)", 0.18)
        hyper, tuning = _tune(spec, feature_cfg, hyper, X_train, y_train, seed)
        repo.update_experiment(exp_id, hyperparameters_json=db.dumps(hyper))

    pipeline = Pipeline([("features", build_vectorizer(feature_cfg)), ("classifier", spec.build(hyper, seed))])

    cv_mean = cv_std = None
    folds = int(row["cv_folds"])
    if folds >= 2:
        _stage(exp_id, f"Cross-validating ({folds} folds)", 0.2)
        skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=seed)
        try:
            scores = cross_val_score(clone(pipeline), X_train, y_train, cv=skf, scoring="f1_macro", n_jobs=1)
        except ValueError as e:
            raise TrainingFailed(f"Cross-validation failed: {e}")
        cv_mean, cv_std = float(scores.mean()), float(scores.std())

    _stage(exp_id, "Fitting vectorizer and classifier", 0.45)
    t0 = time.perf_counter()
    # Balancing (if requested) happens only now, after tuning/CV, so duplicated training
    # documents can never fall into different CV folds or into the test split.
    X_fit, y_fit = (X_train, y_train) if row["train_balance"] != "oversample" else _oversample(X_train, y_train, seed)
    try:
        pipeline.fit(X_fit, y_fit)
    except ValueError as e:
        raise TrainingFailed(f"The model could not be fitted with this configuration: {e}")
    train_seconds = time.perf_counter() - t0

    _stage(exp_id, "Evaluating on held-out test split", 0.8)
    t1 = time.perf_counter()
    y_pred = pipeline.predict(X_test)
    eval_seconds = time.perf_counter() - t1
    vectorizer = pipeline.named_steps["features"]
    estimator = pipeline.named_steps["classifier"]
    class_labels = [str(c) for c in estimator.classes_]
    metrics = evaluate(y_test, y_pred, class_labels)
    metrics.update(
        {
            "cv_folds": folds if folds >= 2 else 0,
            "cv_f1_macro_mean": cv_mean,
            "cv_f1_macro_std": cv_std,
            "n_train": len(X_train),
            "n_test": len(X_test),
            "n_features": vocab_size(vectorizer),
            "train_seconds": round(train_seconds, 3),
            "eval_seconds": round(eval_seconds, 3),
            "excluded_classes": data_info["excluded_classes"],
            "n_source_rows": data_info["n_source_rows"],
            "n_duplicates_removed": data_info["n_duplicates_removed"],
            "n_conflicting_removed": data_info["n_conflicting_removed"],
            "n_train_fit": len(X_fit),
            "split_counts": _split_counts(y_train, y_test),
            "tuning": tuning,
        }
    )

    _stage(exp_id, "Saving model and similarity index", 0.9)
    artifact = f"run{exp_id}-{uuid.uuid4().hex[:8]}"
    model = TrainedModel(
        spec.type,
        preprocessor,
        vectorizer,
        estimator,
        feature_cfg.label,
        {
            "experiment_id": exp_id,
            "dataset_id": row["dataset_id"],
            "feature": feature_cfg.to_dict(),
            "preprocessing": prep_cfg.to_dict(),
            "hyperparameters": hyper,
            "trained_at": db.utcnow(),
        },
    )
    model.save(MODELS_DIR / f"{artifact}.joblib")
    index = SimilarityIndex(vectorizer.transform(X_train), [snippet(t) for t in X_train_raw], list(y_train))
    joblib.dump(index, MODELS_DIR / f"{artifact}.index.joblib", compress=3)
    # Held-out documents the model never saw, used by "Load sample" on Classify Text.
    pairs = list(zip(X_test_raw, y_test))
    readable = [(t, lbl) for t, lbl in pairs if 150 <= len(t) <= 3000]  # prefer paragraph-length documents
    if len(readable) < 20:
        readable = [(t, lbl) for t, lbl in pairs if len(t) <= 3000]
    heldout = [{"text": t, "label": lbl} for t, lbl in readable[:HELDOUT_SAMPLES]]
    (MODELS_DIR / f"{artifact}.heldout.json").write_text(json.dumps(heldout), encoding="utf-8")

    completed = db.utcnow()
    repo.update_experiment(
        exp_id,
        status="completed",
        stage=None,
        progress=1.0,
        error=None,
        metrics_json=db.dumps(metrics),
        labels_json=db.dumps(class_labels),
        artifact_name=artifact,
        completed_at=completed,
    )
    report = {**repo.get_experiment(exp_id), "metrics": metrics}
    (EXPERIMENTS_DIR / f"run-{exp_id}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    # The first completed run of a model type fills that type's slot among the four usable models.
    if spec.type not in repo.deployed_map():
        repo.deploy(exp_id, spec.type)
