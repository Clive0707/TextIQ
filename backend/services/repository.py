"""Row → API dict conversion and common queries."""
from __future__ import annotations

import db
from classification.features import FeatureConfig
from classification.registry import MODELS
from utils.responses import not_found

# ---- settings -----------------------------------------------------------------------

DEFAULT_SETTINGS = {"active_model_id": None, "similar_documents_k": 3, "store_history": True, "deployed": None}


def get_settings() -> dict:
    values = dict(DEFAULT_SETTINGS)
    for row in db.query("SELECT key, value_json FROM settings"):
        if row["key"] in values:
            values[row["key"]] = db.loads(row["value_json"])
    return values


def set_setting(key: str, value) -> None:
    db.execute("INSERT INTO settings(key, value_json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json", (key, db.dumps(value)))


def active_model_id() -> int | None:
    return get_settings()["active_model_id"]


# ---- the four usable models ("deployed" runs) ------------------------------------------
#
# TextIQ exposes exactly one usable run per model type — four in total. Every other run is
# kept as experiment history but cannot be used for classification until it is deployed.


def deployed_map() -> dict[str, int]:
    """model_type -> run id of the deployed run (only types that have one)."""
    raw = get_settings()["deployed"] or {}
    return {t: int(i) for t, i in raw.items() if t in MODELS and i is not None}


def deployed_ids() -> set[int]:
    return set(deployed_map().values())


def deploy(run_id: int, model_type: str) -> None:
    """Make `run_id` the usable run for its model type; it inherits 'active' if it replaces the active run."""
    slots = deployed_map()
    previous = slots.get(model_type)
    slots[model_type] = run_id
    set_setting("deployed", slots)
    active = active_model_id()
    if active is None or active == previous:
        set_setting("active_model_id", run_id)


def undeploy(run_id: int) -> None:
    """Remove a run from its slot, refilling the slot with the newest completed run of that type."""
    slots = deployed_map()
    for t, i in list(slots.items()):
        if i == run_id:
            row = db.query_one("SELECT id FROM experiments WHERE model_type=? AND status='completed' AND id<>? ORDER BY completed_at DESC, id DESC LIMIT 1", (t, run_id))
            if row:
                slots[t] = row["id"]
            else:
                del slots[t]
    set_setting("deployed", slots)
    if active_model_id() not in slots.values():
        set_setting("active_model_id", next(iter(slots.values()), None))


def ensure_deployed() -> None:
    """One-time initialisation for databases created before model slots existed."""
    if get_settings()["deployed"] is not None:
        return
    slots: dict[str, int] = {}
    active = active_model_id()
    anchor = db.query_one("SELECT dataset_id FROM experiments WHERE id=?", (active,)) if active else None
    rows = db.query("SELECT id, model_type, dataset_id, metrics_json FROM experiments WHERE status='completed' AND artifact_name IS NOT NULL")
    best: dict[str, tuple] = {}
    for r in rows:
        if r["model_type"] not in MODELS or (anchor and r["dataset_id"] != anchor["dataset_id"]):
            continue
        m = db.loads(r["metrics_json"], {})
        cv = (m.get("tuning") or {}).get("best_cv_score") or m.get("cv_f1_macro_mean") or -1.0
        key = (r["id"] == active, cv, r["id"])  # the active run keeps its slot; otherwise best CV, then newest
        if r["model_type"] not in best or key > best[r["model_type"]]:
            best[r["model_type"]] = key
    slots = {t: k[2] for t, k in best.items()}
    set_setting("deployed", slots)
    if active not in slots.values():
        set_setting("active_model_id", next(iter(slots.values()), None))


# ---- datasets -----------------------------------------------------------------------


def dataset_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "source": row["source"],
        "filename": row["filename"],
        "n_rows": row["n_rows"],
        "columns": db.loads(row["columns_json"], []),
        "text_column": row["text_column"],
        "label_column": row["label_column"],
        "n_classes": row["n_classes"],
        "class_distribution": db.loads(row["class_distribution_json"]),
        "status": row["status"],
        "validation": db.loads(row["validation_json"]),
        "description": row["description"],
        "quality": db.loads(row["quality_json"]) if "quality_json" in row.keys() else None,
        "created_at": row["created_at"],
    }


def get_dataset_row(dataset_id: int):
    row = db.query_one("SELECT * FROM datasets WHERE id=?", (dataset_id,))
    if row is None:
        raise not_found("Dataset")
    return row


def list_datasets() -> list[dict]:
    return [dataset_to_dict(r) for r in db.query("SELECT * FROM datasets ORDER BY created_at DESC, id DESC")]


# ---- experiments / models -------------------------------------------------------------

EXPERIMENT_SQL = "SELECT e.*, d.name AS dataset_name FROM experiments e LEFT JOIN datasets d ON d.id = e.dataset_id"


def experiment_to_dict(row, active_id: int | None = None, deployed: set[int] | None = None) -> dict:
    feature = db.loads(row["feature_json"], {})
    spec = MODELS.get(row["model_type"])
    try:
        feature_label = FeatureConfig.from_dict(feature).label
    except ValueError:
        feature_label = feature.get("kind", "?")
    return {
        "id": row["id"],
        "name": row["name"],
        "dataset_id": row["dataset_id"],
        "dataset_name": row["dataset_name"] or "(deleted dataset)",
        "model_type": row["model_type"],
        "model_name": spec.name if spec else row["model_type"],
        "feature": feature,
        "feature_label": feature_label,
        "preprocessing": db.loads(row["preprocessing_json"], {}),
        "hyperparameters": db.loads(row["hyperparameters_json"], {}),
        "test_size": row["test_size"],
        "cv_folds": row["cv_folds"],
        "random_state": row["random_state"],
        "max_train_samples": row["max_train_samples"],
        "tune": bool(row["tune"]) if "tune" in row.keys() else False,
        "train_balance": row["train_balance"] if "train_balance" in row.keys() else "none",
        "status": row["status"],
        "stage": row["stage"],
        "progress": row["progress"],
        "error": row["error"],
        "metrics": db.loads(row["metrics_json"]),
        "labels": db.loads(row["labels_json"]),
        "has_artifact": bool(row["artifact_name"]),
        "is_active": active_id is not None and row["id"] == active_id,
        "is_deployed": row["id"] in (deployed if deployed is not None else deployed_ids()),
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


def list_experiments(where: str = "", params: tuple = ()) -> list[dict]:
    active = active_model_id()
    deployed = deployed_ids()
    rows = db.query(f"{EXPERIMENT_SQL} {where} ORDER BY e.created_at DESC, e.id DESC", params)
    return [experiment_to_dict(r, active, deployed) for r in rows]


def get_experiment_row(exp_id: int):
    row = db.query_one(f"{EXPERIMENT_SQL} WHERE e.id=?", (exp_id,))
    if row is None:
        raise not_found("Model run")
    return row


def get_experiment(exp_id: int) -> dict:
    return experiment_to_dict(get_experiment_row(exp_id), active_model_id())


def update_experiment(exp_id: int, **fields) -> None:
    cols = ", ".join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE experiments SET {cols} WHERE id=?", (*fields.values(), exp_id))


# ---- classifications ------------------------------------------------------------------


def classification_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "excerpt": row["excerpt"],
        "predicted_label": row["predicted_label"],
        "confidence": row["confidence"],
        "model_id": row["model_id"],
        "model_name": row["model_name"],
        "created_at": row["created_at"],
    }
