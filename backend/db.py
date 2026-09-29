"""SQLite access. A fresh connection per call keeps this safe across the training thread."""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    n_rows INTEGER NOT NULL,
    columns_json TEXT NOT NULL,
    text_column TEXT,
    label_column TEXT,
    n_classes INTEGER,
    class_distribution_json TEXT,
    status TEXT NOT NULL,
    validation_json TEXT,
    description TEXT,
    quality_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dataset_id INTEGER NOT NULL,
    model_type TEXT NOT NULL,
    feature_json TEXT NOT NULL,
    preprocessing_json TEXT NOT NULL,
    hyperparameters_json TEXT NOT NULL,
    test_size REAL NOT NULL,
    cv_folds INTEGER NOT NULL,
    random_state INTEGER NOT NULL,
    max_train_samples INTEGER,
    tune INTEGER NOT NULL DEFAULT 0,
    train_balance TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL,
    stage TEXT,
    progress REAL NOT NULL DEFAULT 0,
    error TEXT,
    metrics_json TEXT,
    labels_json TEXT,
    artifact_name TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    predicted_label TEXT NOT NULL,
    confidence REAL NOT NULL,
    model_id INTEGER,
    model_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    text_column TEXT NOT NULL,
    model_id INTEGER NOT NULL,
    model_name TEXT NOT NULL,
    feature_label TEXT NOT NULL,
    n_rows INTEGER NOT NULL,
    n_classified INTEGER NOT NULL,
    n_skipped INTEGER NOT NULL,
    summary_json TEXT NOT NULL,
    result_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_experiments_dataset ON experiments(dataset_id);
CREATE INDEX IF NOT EXISTS idx_classifications_created ON classifications(created_at);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    conn = connect()
    try:
        return conn.execute(sql, params).fetchall()
    finally:
        conn.close()


def query_one(sql: str, params: tuple = ()) -> sqlite3.Row | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()) -> int:
    """Runs a write and returns lastrowid (or rowcount for UPDATE/DELETE)."""
    with transaction() as conn:
        cur = conn.execute(sql, params)
        return cur.lastrowid if sql.lstrip().upper().startswith("INSERT") else cur.rowcount


def init_db() -> None:
    with transaction() as conn:
        conn.executescript(SCHEMA)
        # Lightweight migration for databases created before quality reports existed.
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(datasets)")}
        if "quality_json" not in cols:
            conn.execute("ALTER TABLE datasets ADD COLUMN quality_json TEXT")
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(experiments)")}
        if "tune" not in cols:
            conn.execute("ALTER TABLE experiments ADD COLUMN tune INTEGER NOT NULL DEFAULT 0")
        if "train_balance" not in cols:
            conn.execute("ALTER TABLE experiments ADD COLUMN train_balance TEXT NOT NULL DEFAULT 'none'")
        # A server restart kills the in-process training thread; don't leave runs "running" forever.
        conn.execute(
            "UPDATE experiments SET status='failed', stage=NULL, error=? WHERE status IN ('queued','running')",
            ("Training was interrupted because the server restarted. Start the run again.",),
        )


def dumps(value) -> str:
    return json.dumps(value, separators=(",", ":"))


def loads(value, default=None):
    return json.loads(value) if value else default
