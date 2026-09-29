"""Dashboard overview and analytics — every number here is computed from stored data."""
from flask import Blueprint, request

import db
from evaluation.metrics import distribution_stats
from services import repository as repo
from utils.responses import ok

bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


@bp.get("/overview")
def overview():
    settings = repo.get_settings()
    active = None
    if settings["active_model_id"] is not None:
        row = db.query_one(f"{repo.EXPERIMENT_SQL} WHERE e.id=?", (settings["active_model_id"],))
        active = repo.experiment_to_dict(row, settings["active_model_id"]) if row else None

    dataset = None
    if active:
        row = db.query_one("SELECT * FROM datasets WHERE id=?", (active["dataset_id"],))
        dataset = repo.dataset_to_dict(row) if row else None
    if dataset is None:
        row = db.query_one("SELECT * FROM datasets WHERE status='ready' ORDER BY created_at DESC LIMIT 1")
        dataset = repo.dataset_to_dict(row) if row else None

    benchmark = []
    if dataset:
        # The four usable (deployed) models, best macro F1 first.
        deployed = repo.deployed_ids()
        runs = [r for r in repo.list_experiments("WHERE e.dataset_id=?", (dataset["id"],)) if r["id"] in deployed and r["metrics"]]
        benchmark = sorted(runs, key=lambda r: -r["metrics"]["f1_macro"])

    # Recent activity is limited to models trained on the dataset shown, so the dashboard stays coherent.
    scope, scope_params = ("WHERE c.model_id IN (SELECT id FROM experiments WHERE dataset_id=?)", (dataset["id"],)) if dataset else ("", ())
    recent = [repo.classification_to_dict(r) for r in db.query(f"SELECT c.* FROM classifications c {scope} ORDER BY c.id DESC LIMIT 5", scope_params)]
    totals = {
        "classifications": db.query_one(f"SELECT COUNT(*) AS n FROM classifications c {scope}", scope_params)["n"],
        "batch_documents": db.query_one("SELECT COALESCE(SUM(n_classified),0) AS n FROM batch_jobs")["n"],
        "datasets": db.query_one("SELECT COUNT(*) AS n FROM datasets")["n"],
        "trained_models": db.query_one("SELECT COUNT(*) AS n FROM experiments WHERE status='completed'")["n"],
    }
    stats = None
    if dataset and dataset["class_distribution"]:
        stats = distribution_stats([c["count"] for c in dataset["class_distribution"]])
    return ok({"active_model": active, "dataset": dataset, "benchmark": benchmark, "recent": recent, "totals": totals, "distribution_stats": stats})


@bp.get("")
def analytics():
    model_id = request.args.get("model_id", "")
    model_id = int(model_id) if model_id.isdigit() else repo.active_model_id()
    model = None
    if model_id is not None:
        row = db.query_one(f"{repo.EXPERIMENT_SQL} WHERE e.id=?", (model_id,))
        model = repo.experiment_to_dict(row, repo.active_model_id()) if row else None

    comparison = []
    if model:
        comparison = [r for r in repo.list_experiments("WHERE e.dataset_id=? AND e.status='completed'", (model["dataset_id"],))]
        comparison.sort(key=lambda r: -(r["metrics"] or {}).get("f1_macro", 0))

    where, params = ("WHERE model_id=?", (model["id"],)) if model else ("", ())
    dist = db.query(f"SELECT predicted_label AS label, COUNT(*) AS count FROM classifications {where} GROUP BY predicted_label ORDER BY count DESC", params)
    history_count = db.query_one(f"SELECT COUNT(*) AS n FROM classifications {where}", params)["n"]
    return ok(
        {
            "model": model,
            "comparison": comparison,
            "prediction_distribution": [{"label": r["label"], "count": r["count"]} for r in dist],
            "history_count": history_count,
        }
    )
