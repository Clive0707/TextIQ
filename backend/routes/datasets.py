import logging

from flask import Blueprint, request

import db
from config import DATASETS_DIR
from datasets import news, textiq
from datasets.loader import DatasetError, analyze, fetch_20newsgroups_frame, guess_columns, read_csv
from services import repository as repo
from utils.files import require_csv, save_upload
from utils.responses import ApiError, ok
from utils.validation import get_int, get_str, json_body

bp = Blueprint("datasets", __name__, url_prefix="/api/datasets")
log = logging.getLogger("textiq.datasets")


def _load_20newsgroups():
    df = fetch_20newsgroups_frame()
    return df, "text", "label", None


def _load_textiq():
    df, quality = textiq.load_frame()
    return df, "text", "category", quality


def _load_news8():
    df, quality = news.load_frame()
    return df, "text", "category", quality


# Built-in datasets: key → (display name, stored file, source label, description, loader)
BUILTINS = {
    "textiq120k": (textiq.NAME, "textiq_120k.csv", "TextIQ_120K_Balanced_News_Dataset.csv", textiq.DESCRIPTION, _load_textiq),
    "news8": (news.NAME, "news_categories_8.csv", "News Category Dataset v3 (CC BY 4.0)", news.DESCRIPTION, _load_news8),
    "20newsgroups": (
        "20 Newsgroups",
        "20newsgroups.csv",
        "fetch_20newsgroups",
        "Usenet posts across 20 topics (scikit-learn fetch_20newsgroups, subset='all', headers/footers/quotes removed).",
        _load_20newsgroups,
    ),
}


def _insert(name, source, filename, stored_name, df, text_col, label_col, description=None, quality=None) -> dict:
    report = analyze(df, text_col, label_col)
    ds_id = db.execute(
        """INSERT INTO datasets(name, source, filename, stored_name, n_rows, columns_json, text_column, label_column,
           n_classes, class_distribution_json, status, validation_json, description, quality_json, created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            name,
            source,
            filename,
            stored_name,
            len(df),
            db.dumps(list(df.columns)),
            text_col,
            label_col,
            report["n_classes"],
            db.dumps(report["class_distribution"]) if report["class_distribution"] is not None else None,
            report["status"],
            db.dumps(report["validation"]) if report["validation"] else None,
            description,
            db.dumps(quality) if quality else None,
            db.utcnow(),
        ),
    )
    return repo.dataset_to_dict(repo.get_dataset_row(ds_id))


@bp.get("")
def list_datasets():
    return ok(repo.list_datasets())


@bp.get("/<int:dataset_id>")
def get_dataset(dataset_id: int):
    return ok(repo.dataset_to_dict(repo.get_dataset_row(dataset_id)))


@bp.post("/upload")
def upload():
    file = request.files.get("file")
    filename = require_csv(file)
    name = (request.form.get("name") or "").strip()[:120] or filename.rsplit(".", 1)[0]
    token, path = save_upload(file, DATASETS_DIR)
    try:
        df = read_csv(path)
    except DatasetError as e:
        path.unlink(missing_ok=True)
        raise ApiError(str(e), code="invalid_dataset", status=422, details=e.details)
    text_col, label_col = guess_columns(df)
    return ok(_insert(name, "upload", filename, path.name, df, text_col, label_col), 201)


@bp.get("/builtin")
def list_builtin():
    loaded = {r["name"]: r["id"] for r in db.query("SELECT id, name FROM datasets WHERE source='builtin'")}
    return ok([{"key": k, "name": v[0], "description": v[3], "dataset_id": loaded.get(v[0])} for k, v in BUILTINS.items()])


@bp.post("/builtin/<key>")
def load_builtin(key: str):
    if key not in BUILTINS:
        raise ApiError("Unknown built-in dataset.", code="not_found", status=404)
    name, stored, filename, description, loader = BUILTINS[key]
    existing = db.query_one("SELECT id FROM datasets WHERE source='builtin' AND name=?", (name,))
    if existing:
        return ok(repo.dataset_to_dict(repo.get_dataset_row(existing["id"])))
    try:
        df, text_col, label_col, quality = loader()
    except Exception:
        log.exception("Failed to load built-in dataset %s", key)
        raise ApiError(f"Could not download {name}. Check the internet connection and try again.", code="download_failed", status=502)
    df.to_csv(DATASETS_DIR / stored, index=False)
    return ok(_insert(name, "builtin", filename, stored, df, text_col, label_col, description, quality), 201)


@bp.patch("/<int:dataset_id>")
def set_columns(dataset_id: int):
    row = repo.get_dataset_row(dataset_id)
    body = json_body()
    text_col = get_str(body, "text_column")
    label_col = get_str(body, "label_column")
    try:
        df = read_csv(DATASETS_DIR / row["stored_name"])
    except DatasetError as e:
        raise ApiError(str(e), code="invalid_dataset", status=422, details=e.details)
    report = analyze(df, text_col, label_col)
    db.execute(
        "UPDATE datasets SET text_column=?, label_column=?, n_classes=?, class_distribution_json=?, status=?, validation_json=? WHERE id=?",
        (
            text_col,
            label_col,
            report["n_classes"],
            db.dumps(report["class_distribution"]) if report["class_distribution"] is not None else None,
            report["status"],
            db.dumps(report["validation"]) if report["validation"] else None,
            dataset_id,
        ),
    )
    return ok(repo.dataset_to_dict(repo.get_dataset_row(dataset_id)))


@bp.get("/<int:dataset_id>/preview")
def preview(dataset_id: int):
    row = repo.get_dataset_row(dataset_id)
    q = {k: int(v) for k, v in request.args.items() if k in ("offset", "limit") and v.isdigit()}
    offset = get_int(q, "offset", required=False, default=0, lo=0, hi=10_000_000)
    limit = get_int(q, "limit", required=False, default=25, lo=1, hi=200)
    try:
        df = read_csv(DATASETS_DIR / row["stored_name"])
    except DatasetError as e:
        raise ApiError(str(e), code="invalid_dataset", status=422, details=e.details)
    page = df.iloc[offset : offset + limit]
    rows = [{c: (v if len(v) <= 600 else v[:600] + "…") for c, v in r.items()} for r in page.to_dict(orient="records")]
    return ok({"columns": list(df.columns), "rows": rows, "total": len(df), "offset": offset})


@bp.delete("/<int:dataset_id>")
def delete(dataset_id: int):
    row = repo.get_dataset_row(dataset_id)
    in_use = db.query_one("SELECT COUNT(*) AS n FROM experiments WHERE dataset_id=? AND status IN ('queued','running')", (dataset_id,))
    if in_use["n"]:
        raise ApiError("A model is currently training on this dataset. Wait for it to finish.", code="dataset_in_use", status=409)
    db.execute("DELETE FROM datasets WHERE id=?", (dataset_id,))
    (DATASETS_DIR / row["stored_name"]).unlink(missing_ok=True)
    return ok({"deleted": dataset_id})
