"""Model catalogue, training runs (experiments) and the active model."""
import json
import random

from flask import Blueprint

import db
from classification.features import FeatureConfig
from classification.registry import MODELS, get_spec, resolve_hyperparameters
from config import EXPERIMENTS_DIR, MODELS_DIR
from preprocessing.text import PreprocessConfig
from services import predictor
from services import repository as repo
from services import training
from utils.responses import ApiError, ok
from utils.validation import get_bool, get_float, get_int, get_str, json_body

bp = Blueprint("models", __name__, url_prefix="/api")


@bp.get("/models/catalog")
def catalog():
    return ok([spec.public() for spec in MODELS.values()])


@bp.get("/models")
def list_models():
    """Every training run that produced (or is producing) a model."""
    return ok(repo.list_experiments())


@bp.get("/experiments")
def list_experiments():
    return ok(repo.list_experiments())


@bp.get("/models/<int:model_id>")
@bp.get("/experiments/<int:model_id>")
@bp.get("/models/train/<int:model_id>")
def get_model(model_id: int):
    return ok(repo.get_experiment(model_id))


def _create_run(body: dict) -> dict:
    dataset_id = get_int(body, "dataset_id")
    ds = repo.get_dataset_row(dataset_id)
    if ds["status"] != "ready":
        raise ApiError("This dataset is not ready for training. Choose its text and label columns and fix any validation errors first.", code="dataset_not_ready", status=409)
    try:
        spec = get_spec(get_str(body, "model_type", max_len=40))
        feature = FeatureConfig.from_dict(body.get("feature"))
        prep = PreprocessConfig.from_dict(body.get("preprocessing"))
        hyper = resolve_hyperparameters(spec, body.get("hyperparameters"))
    except ValueError as e:
        raise ApiError(str(e), code="invalid_configuration", status=422)

    test_size = get_float(body, "test_size", default=0.2, lo=0.05, hi=0.5)
    cv_folds = get_int(body, "cv_folds", required=False, default=0, lo=0, hi=10)
    if cv_folds == 1:
        raise ApiError("Cross-validation needs at least 2 folds (or 0 to skip it).", code="invalid_field")
    random_state = get_int(body, "random_state", required=False, default=42, lo=0, hi=2**31 - 1)
    cap = get_int(body, "max_train_samples", required=False, default=None, lo=50, hi=10_000_000)
    tune = get_bool(body, "tune", False)
    balance = body.get("train_balance", "none")
    if balance not in ("none", "oversample"):
        raise ApiError("'train_balance' must be 'none' or 'oversample'.", code="invalid_field")
    name = get_str(body, "name", required=False, max_len=120) or f"{spec.short_name} · {feature.label}{' · tuned' if tune else ''}"

    exp_id = db.execute(
        """INSERT INTO experiments(name, dataset_id, model_type, feature_json, preprocessing_json, hyperparameters_json,
           test_size, cv_folds, random_state, max_train_samples, tune, train_balance, status, stage, progress, created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'queued', 'Waiting in queue', 0, ?)""",
        (name, dataset_id, spec.type, db.dumps(feature.to_dict()), db.dumps(prep.to_dict()), db.dumps(hyper), test_size, cv_folds, random_state, cap, int(tune), balance, db.utcnow()),
    )
    training.enqueue(exp_id)
    return repo.get_experiment(exp_id)


@bp.post("/models/train")
@bp.post("/experiments")
def train():
    return ok(_create_run(json_body()), 202)


@bp.patch("/experiments/<int:model_id>")
def rename(model_id: int):
    repo.get_experiment_row(model_id)
    name = get_str(json_body(), "name", max_len=120)
    repo.update_experiment(model_id, name=name)
    return ok(repo.get_experiment(model_id))


@bp.get("/models/<int:model_id>/sample")
def heldout_sample(model_id: int):
    """A random document from this model's held-out test split (never seen in training)."""
    row = repo.get_experiment_row(model_id)
    path = MODELS_DIR / f"{row['artifact_name']}.heldout.json" if row["artifact_name"] else None
    if row["status"] != "completed" or path is None or not path.exists():
        raise ApiError("No held-out samples are stored for this model. Retrain it to enable samples.", code="no_samples", status=404)
    samples = json.loads(path.read_text(encoding="utf-8"))
    if not samples:
        raise ApiError("This model's test split has no documents of a suitable length.", code="no_samples", status=404)
    pick = random.choice(samples)
    return ok({"text": pick["text"], "label": pick["label"], "dataset": row["dataset_name"] or "dataset", "n_samples": len(samples)})


@bp.get("/models/deployed")
def deployed():
    """The four usable model slots, in catalogue order (run is null if that model is not trained yet)."""
    slots = repo.deployed_map()
    out = []
    for spec in MODELS.values():
        run = repo.get_experiment(slots[spec.type]) if spec.type in slots else None
        out.append({"type": spec.type, "name": spec.name, "run": run})
    return ok(out)


def _completed_row(model_id: int):
    row = repo.get_experiment_row(model_id)
    if row["status"] != "completed" or not row["artifact_name"]:
        raise ApiError("Only completed models can be used.", code="model_not_ready", status=409)
    return row


@bp.post("/models/<int:model_id>/deploy")
def deploy(model_id: int):
    """Use this run as its model type's slot among the four usable models."""
    row = _completed_row(model_id)
    repo.deploy(model_id, row["model_type"])
    return ok(repo.get_experiment(model_id))


@bp.post("/models/<int:model_id>/activate")
def activate(model_id: int):
    """Make this run the default model (deploying it into its slot if needed)."""
    row = _completed_row(model_id)
    if model_id not in repo.deployed_ids():
        repo.deploy(model_id, row["model_type"])
    repo.set_setting("active_model_id", model_id)
    return ok(repo.get_experiment(model_id))


@bp.delete("/models/<int:model_id>")
@bp.delete("/experiments/<int:model_id>")
def delete(model_id: int):
    row = repo.get_experiment_row(model_id)
    if row["status"] in ("queued", "running"):
        raise ApiError("This run is still training and cannot be deleted yet.", code="model_busy", status=409)
    predictor.evict(model_id)
    if row["artifact_name"]:
        for suffix in (".joblib", ".index.joblib", ".heldout.json"):
            (MODELS_DIR / f"{row['artifact_name']}{suffix}").unlink(missing_ok=True)
    (EXPERIMENTS_DIR / f"run-{model_id}.json").unlink(missing_ok=True)
    was_deployed = model_id in repo.deployed_ids()
    db.execute("DELETE FROM experiments WHERE id=?", (model_id,))
    if was_deployed:
        repo.undeploy(model_id)
    return ok({"deleted": model_id})
