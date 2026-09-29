"""CSV batch classification with downloadable results."""
import uuid

import pandas as pd
from flask import Blueprint, request, send_file

import db
from config import BATCH_DIR, MAX_BATCH_ROWS, MAX_TEXT_CHARS, UPLOADS_DIR
from datasets.loader import DatasetError, guess_columns, read_csv
from services import predictor
from utils.files import require_csv, resolve_token, save_upload
from utils.responses import ApiError, not_found, ok
from utils.validation import get_int, get_str, json_body

bp = Blueprint("batch", __name__, url_prefix="/api/batch")

CHUNK = 2000
RESULT_COLUMNS = ("predicted_label", "confidence", "status")


def _read(path):
    try:
        return read_csv(path, max_rows=MAX_BATCH_ROWS)
    except DatasetError as e:
        raise ApiError(str(e), code="invalid_csv", status=422, details=e.details)


@bp.post("/upload")
def upload():
    file = request.files.get("file")
    filename = require_csv(file)
    token, path = save_upload(file, UPLOADS_DIR)
    try:
        df = _read(path)
    except ApiError:
        path.unlink(missing_ok=True)
        raise
    (UPLOADS_DIR / f"{token}.name").write_text(filename, encoding="utf-8")
    text_col, _ = guess_columns(df)
    preview = [{c: (v if len(v) <= 300 else v[:300] + "…") for c, v in r.items()} for r in df.head(5).to_dict(orient="records")]
    return ok({"upload_id": token, "filename": filename, "columns": list(df.columns), "n_rows": len(df), "preview": preview, "suggested_text_column": text_col}, 201)


def _job(job_id: str, offset: int = 0, limit: int = 100) -> dict:
    if not isinstance(job_id, str) or len(job_id) != 32 or not all(c in "0123456789abcdef" for c in job_id):
        raise not_found("Batch job")
    row = db.query_one("SELECT * FROM batch_jobs WHERE id=?", (job_id,))
    if row is None:
        raise not_found("Batch job")
    path = BATCH_DIR / row["result_name"]
    if not path.exists():
        raise ApiError("The results file for this batch is missing. Run the batch again.", code="results_missing", status=410)
    df = pd.read_csv(path, dtype=str, keep_default_na=False, skiprows=range(1, offset + 1), nrows=limit)
    rows = []
    for i, r in enumerate(df.to_dict(orient="records")):
        text = r.get(row["text_column"], "")
        rows.append(
            {
                "row": offset + i + 1,
                "text": text if len(text) <= 400 else text[:400] + "…",
                "predicted_label": r["predicted_label"] or None,
                "confidence": float(r["confidence"]) if r["confidence"] else None,
                "status": "ok" if r["status"] == "classified" else "skipped",
                "note": None if r["status"] == "classified" else r["status"],
            }
        )
    return {
        "job_id": row["id"],
        "filename": row["filename"],
        "text_column": row["text_column"],
        "model": {"id": row["model_id"], "name": row["model_name"], "feature_label": row["feature_label"]},
        "n_rows": row["n_rows"],
        "n_classified": row["n_classified"],
        "n_skipped": row["n_skipped"],
        "summary": db.loads(row["summary_json"], []),
        "rows": rows,
        "total_rows": row["n_rows"],
        "offset": offset,
        "created_at": row["created_at"],
    }


@bp.post("/classify")
def classify():
    body = json_body()
    upload_id = get_str(body, "upload_id", max_len=64)
    text_col = get_str(body, "text_column", max_len=300)
    model_id = predictor.resolve_model_id(get_int(body, "model_id", required=False))
    predictor.require_deployed(model_id)
    path = resolve_token(upload_id, UPLOADS_DIR)
    df = _read(path)
    if text_col not in df.columns:
        raise ApiError(f"Column '{text_col}' is not in the uploaded file.", code="missing_column", status=422, details=[f"Available columns: {', '.join(df.columns[:20])}"])
    for col in RESULT_COLUMNS:
        if col in df.columns:
            raise ApiError(f"The file already has a '{col}' column. Rename it and upload again.", code="column_conflict", status=422)

    model, meta = predictor.load_model(model_id)
    texts = df[text_col].str.strip()
    usable = (texts != "") & (texts.str.len() <= MAX_TEXT_CHARS)
    preds = pd.Series("", index=df.index, dtype=object)
    confs = pd.Series("", index=df.index, dtype=object)
    status = pd.Series("skipped: empty text", index=df.index, dtype=object)
    status[texts.str.len() > MAX_TEXT_CHARS] = "skipped: text too long"

    idx = df.index[usable]
    for start in range(0, len(idx), CHUNK):
        chunk = idx[start : start + CHUNK]
        labels, conf = model.classify_many(texts[chunk].tolist())
        preds[chunk] = labels
        confs[chunk] = [f"{c:.6f}" for c in conf]
        status[chunk] = "classified"

    out = df.copy()
    out["predicted_label"], out["confidence"], out["status"] = preds, confs, status
    job_id = uuid.uuid4().hex
    result_name = f"{job_id}.csv"
    out.to_csv(BATCH_DIR / result_name, index=False)

    counts = preds[usable].value_counts()
    summary = [{"label": str(k), "count": int(v)} for k, v in counts.items()]
    name_file = UPLOADS_DIR / f"{upload_id}.name"
    filename = name_file.read_text(encoding="utf-8") if name_file.exists() else "upload.csv"
    db.execute(
        "INSERT INTO batch_jobs(id, filename, text_column, model_id, model_name, feature_label, n_rows, n_classified, n_skipped, summary_json, result_name, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (job_id, filename, text_col, model_id, meta["name"], meta["feature_label"], len(df), int(usable.sum()), int((~usable).sum()), db.dumps(summary), result_name, db.utcnow()),
    )
    return ok(_job(job_id, 0, 50))


@bp.get("/<job_id>")
def get_job(job_id: str):
    args = {k: int(v) for k, v in request.args.items() if k in ("offset", "limit") and v.isdigit()}
    offset = get_int(args, "offset", required=False, default=0, lo=0, hi=MAX_BATCH_ROWS)
    limit = get_int(args, "limit", required=False, default=50, lo=1, hi=500)
    return ok(_job(job_id, offset, limit))


@bp.get("/<job_id>/download")
def download(job_id: str):
    job = _job(job_id, 0, 1)
    row = db.query_one("SELECT result_name FROM batch_jobs WHERE id=?", (job["job_id"],))
    stem = job["filename"].rsplit(".", 1)[0]
    return send_file(BATCH_DIR / row["result_name"], mimetype="text/csv", as_attachment=True, download_name=f"{stem}-classified.csv")
