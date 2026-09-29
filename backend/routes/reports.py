"""PDF evaluation reports."""
import re

from flask import Blueprint, Response, request

import db
from services import repository as repo
from services.report import build_pdf
from utils.responses import ApiError

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


def _pdf(content: bytes, filename: str) -> Response:
    disposition = "inline" if request.args.get("inline") == "1" else "attachment"  # inline = open in the browser's PDF viewer
    return Response(content, mimetype="application/pdf", headers={"Content-Disposition": f'{disposition}; filename="{filename}"'})


def _dataset(dataset_id: int) -> dict | None:
    row = db.query_one("SELECT * FROM datasets WHERE id=?", (dataset_id,))
    return repo.dataset_to_dict(row) if row else None


@bp.get("/evaluation.pdf")
def evaluation():
    """The four models in use (default), or one run with ?model_id=."""
    raw = request.args.get("model_id", "")
    if raw:
        if not raw.isdigit():
            raise ApiError("model_id must be a number.", code="invalid_field")
        run = repo.get_experiment(int(raw))
        if run["status"] != "completed" or not run["metrics"]:
            raise ApiError("This run has no evaluation results yet.", code="model_not_ready", status=409)
        runs = [run]
    else:
        deployed = repo.deployed_ids()
        runs = [r for r in repo.list_experiments() if r["id"] in deployed and r["metrics"]]
        if not runs:
            raise ApiError("There are no evaluated models to report yet. Train a model first.", code="no_results", status=409)
        order = {t: i for i, t in enumerate(["linear_svm", "rbf_svm", "mnb", "logreg"])}
        runs.sort(key=lambda r: order.get(r["model_type"], 9))
    stamp = runs[0]["completed_at"][:10] if runs[0]["completed_at"] else "report"
    name = f"textiq-evaluation-{stamp}.pdf" if len(runs) > 1 else f"textiq-run-{runs[0]['id']}-{re.sub(r'[^a-z0-9]+', '-', runs[0]['model_type'])}.pdf"
    return _pdf(build_pdf(runs, _dataset(runs[0]["dataset_id"])), name)
