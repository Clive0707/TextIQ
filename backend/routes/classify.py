"""Single-text classification, similarity search and classification history."""
from flask import Blueprint, request

import db
from config import MAX_TEXT_CHARS
from services import predictor
from services import repository as repo
from similarity.index import snippet
from utils.responses import ApiError, not_found, ok
from utils.validation import get_int, json_body


bp = Blueprint("classify", __name__, url_prefix="/api")


def _text(body: dict) -> str:
    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ApiError("Enter some text to classify.", code="empty_text", status=422)
    if len(text) > MAX_TEXT_CHARS:
        raise ApiError(f"The text is too long ({len(text):,} characters). The limit is {MAX_TEXT_CHARS:,}.", code="text_too_long", status=422)
    return text


@bp.post("/classify")
def classify():
    body = json_body()
    text = _text(body)
    model_id = predictor.resolve_model_id(get_int(body, "model_id", required=False))
    predictor.require_deployed(model_id)
    model, meta = predictor.load_model(model_id)
    result = model.classify(text)
    if result["vector"]["n_nonzero"] == 0:
        raise ApiError(
            "Unable to classify the text.",
            code="no_known_features",
            status=422,
            details=["After preprocessing, none of its terms appear in the model's vocabulary, so a prediction would only reflect class frequencies."],
        )
    classification_id = None
    if repo.get_settings()["store_history"]:
        classification_id = db.execute(
            "INSERT INTO classifications(text, excerpt, predicted_label, confidence, model_id, model_name, created_at) VALUES(?,?,?,?,?,?,?)",
            (text[:20000], snippet(text, 200), result["predicted_label"], result["confidence"], model_id, meta["name"], db.utcnow()),
        )
    result["classification_id"] = classification_id
    result["model"] = {"id": model_id, "name": meta["name"], "model_type": meta["model_type"], "model_name": meta["model_name"], "feature_label": meta["feature_label"]}
    return ok(result)


@bp.post("/similarity")
def similarity():
    body = json_body()
    text = _text(body)
    model_id = predictor.resolve_model_id(get_int(body, "model_id", required=False))
    k = get_int(body, "k", required=False, default=repo.get_settings()["similar_documents_k"], lo=1, hi=25)
    predictor.require_deployed(model_id)
    model, meta = predictor.load_model(model_id)
    index = predictor.load_index(model_id)
    vector = model.vectorize([text])
    return ok(
        {
            "method": "cosine",
            "space": meta["feature_label"],
            "model_id": model_id,
            "corpus_size": index.size,
            "results": index.query(vector, k),
        }
    )


@bp.get("/classifications")
def history():
    args = {"limit": int(request.args["limit"])} if request.args.get("limit", "").isdigit() else {}
    limit = get_int(args, "limit", required=False, default=50, lo=1, hi=500)
    rows = db.query("SELECT * FROM classifications ORDER BY id DESC LIMIT ?", (limit,))
    return ok([repo.classification_to_dict(r) for r in rows])


@bp.get("/classifications/<int:cid>")
def history_item(cid: int):
    row = db.query_one("SELECT * FROM classifications WHERE id=?", (cid,))
    if row is None:
        raise not_found("Classification")
    return ok({**repo.classification_to_dict(row), "text": row["text"]})


@bp.delete("/classifications")
def clear_history():
    n = db.execute("DELETE FROM classifications")
    return ok({"deleted": n})
