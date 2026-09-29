"""Loads trained artifacts on demand and keeps a small LRU cache in memory."""
from __future__ import annotations

import threading
from collections import OrderedDict

import joblib

from classification.model import TrainedModel
from config import MODEL_CACHE_SIZE, MODELS_DIR
from services import repository as repo
from similarity.index import SimilarityIndex
from utils.responses import ApiError

_lock = threading.Lock()
_models: OrderedDict[int, TrainedModel] = OrderedDict()
_indexes: OrderedDict[int, SimilarityIndex] = OrderedDict()


def _cache_get(cache: OrderedDict, key: int, loader):
    with _lock:
        if key in cache:
            cache.move_to_end(key)
            return cache[key]
    value = loader()
    with _lock:
        cache[key] = value
        cache.move_to_end(key)
        while len(cache) > MODEL_CACHE_SIZE:
            cache.popitem(last=False)
    return value


def evict(model_id: int) -> None:
    with _lock:
        _models.pop(model_id, None)
        _indexes.pop(model_id, None)


def _ready_row(model_id: int):
    row = repo.get_experiment_row(model_id)
    if row["status"] != "completed" or not row["artifact_name"]:
        raise ApiError("This model has not finished training yet.", code="model_not_ready", status=409)
    return row


def load_model(model_id: int) -> tuple[TrainedModel, dict]:
    row = _ready_row(model_id)
    path = MODELS_DIR / f"{row['artifact_name']}.joblib"
    if not path.exists():
        raise ApiError("The saved model file is missing. Retrain this model.", code="artifact_missing", status=410)

    def loader():
        try:
            return TrainedModel.load(path)
        except Exception:
            raise ApiError("The saved model file could not be loaded. Retrain this model.", code="artifact_invalid", status=500)

    return _cache_get(_models, model_id, loader), repo.experiment_to_dict(row, repo.active_model_id())


def load_index(model_id: int) -> SimilarityIndex:
    row = _ready_row(model_id)
    path = MODELS_DIR / f"{row['artifact_name']}.index.joblib"
    if not path.exists():
        raise ApiError("The similarity index for this model is missing. Retrain the model.", code="artifact_missing", status=410)
    return _cache_get(_indexes, model_id, lambda: joblib.load(path))


def require_deployed(model_id: int) -> None:
    """Only the four deployed runs (one per model type) can be used for predictions."""
    repo.get_experiment_row(model_id)  # 404 for unknown ids
    if model_id not in repo.deployed_ids():
        raise ApiError(
            "This run is not one of the four models in use. Deploy it on the Models page to use it for classification.",
            code="model_not_deployed",
            status=409,
        )


def resolve_model_id(requested: int | None) -> int:
    if requested is not None:
        return requested
    active = repo.active_model_id()
    if active is None:
        raise ApiError("No model is active yet. Train a model on the Models page first.", code="no_active_model", status=409)
    return active
