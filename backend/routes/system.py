"""Health, settings and search."""
import platform
from importlib.metadata import PackageNotFoundError, version

from flask import Blueprint, request

import db
from services import repository as repo
from utils.responses import ApiError, ok
from utils.validation import get_bool, get_int, json_body

bp = Blueprint("system", __name__, url_prefix="/api")


def _v(pkg: str) -> str:
    try:
        return version(pkg)
    except PackageNotFoundError:
        return "not installed"


@bp.get("/health")
def health():
    db.query_one("SELECT 1")
    return ok(
        {
            "status": "ok",
            "versions": {"python": platform.python_version(), "scikit-learn": _v("scikit-learn"), "numpy": _v("numpy"), "pandas": _v("pandas"), "flask": _v("flask"), "nltk": _v("nltk")},
        }
    )


@bp.get("/settings")
def get_settings():
    return ok(repo.get_settings())


@bp.put("/settings")
def update_settings():
    body = json_body()
    unknown = set(body) - (set(repo.DEFAULT_SETTINGS) - {"deployed"})
    if unknown:
        raise ApiError(f"Unknown setting(s): {', '.join(sorted(unknown))}.", code="invalid_field")
    if "active_model_id" in body:
        mid = get_int(body, "active_model_id", required=False)
        if mid is not None:
            row = repo.get_experiment_row(mid)
            if row["status"] != "completed":
                raise ApiError("Only completed models can be made active.", code="model_not_ready", status=409)
            if mid not in repo.deployed_ids():
                raise ApiError("Only one of the four models in use can be the default.", code="model_not_deployed", status=409)
        repo.set_setting("active_model_id", mid)
    if "similar_documents_k" in body:
        repo.set_setting("similar_documents_k", get_int(body, "similar_documents_k", lo=1, hi=25))
    if "store_history" in body:
        repo.set_setting("store_history", get_bool(body, "store_history", True))
    return ok(repo.get_settings())


@bp.get("/search")
def search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return ok({"datasets": [], "models": [], "classifications": []})
    like = f"%{q[:100].replace('%', '').replace('_', '')}%"
    datasets = [{"id": r["id"], "name": r["name"], "n_rows": r["n_rows"]} for r in db.query("SELECT id, name, n_rows FROM datasets WHERE name LIKE ? OR filename LIKE ? LIMIT 5", (like, like))]
    runs = repo.list_experiments("WHERE e.name LIKE ? OR e.model_type LIKE ?", (like, like))[:5]
    models = [{"id": r["id"], "name": r["name"], "model_name": r["model_name"], "feature_label": r["feature_label"], "status": r["status"]} for r in runs]
    classifications = [
        {"id": r["id"], "excerpt": r["excerpt"], "predicted_label": r["predicted_label"], "created_at": r["created_at"]}
        for r in db.query("SELECT id, excerpt, predicted_label, created_at FROM classifications WHERE text LIKE ? OR predicted_label LIKE ? ORDER BY id DESC LIMIT 5", (like, like))
    ]
    return ok({"datasets": datasets, "models": models, "classifications": classifications})
