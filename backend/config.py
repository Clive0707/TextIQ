"""Filesystem locations and limits. Everything lives inside the project folder."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Tests point this at a temporary folder; normally data lives in the project root.
STORAGE_ROOT = Path(os.environ.get("TEXTIQ_STORAGE_ROOT", ROOT))

DATA_DIR = STORAGE_ROOT / "data"
DATASETS_DIR = DATA_DIR / "datasets"
UPLOADS_DIR = DATA_DIR / "uploads"
BATCH_DIR = DATA_DIR / "batch"
SKLEARN_CACHE_DIR = ROOT / "data" / "sklearn_cache"
MODELS_DIR = STORAGE_ROOT / "trained_models"
EXPERIMENTS_DIR = STORAGE_ROOT / "experiments"
FRONTEND_DIST = ROOT / "frontend" / "dist"
DB_PATH = DATA_DIR / "intelliclass.db"

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB per CSV
MAX_DATASET_ROWS = 500_000
MAX_BATCH_ROWS = 100_000
MAX_TEXT_CHARS = 100_000
ALLOWED_UPLOAD_EXTENSIONS = {".csv"}

MODEL_CACHE_SIZE = 4


def ensure_dirs() -> None:
    for d in (DATA_DIR, DATASETS_DIR, UPLOADS_DIR, BATCH_DIR, SKLEARN_CACHE_DIR, MODELS_DIR, EXPERIMENTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
