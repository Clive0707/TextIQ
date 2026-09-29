import io
import time

import pytest


def _ok(resp, status=200):
    body = resp.get_json()
    assert resp.status_code == status, body
    assert body["ok"] is True
    return body["data"]


def _err(resp, status):
    body = resp.get_json()
    assert resp.status_code == status, body
    assert body["ok"] is False and body["error"]["message"]
    assert "Traceback" not in str(body)
    return body["error"]


def _wait(client, run_id, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        run = _ok(client.get(f"/api/models/{run_id}"))
        if run["status"] in ("completed", "failed"):
            return run
        time.sleep(0.2)
    raise AssertionError("training timed out")


@pytest.fixture(scope="module")
def trained(app, csv_bytes):
    client = app.test_client()
    ds = _ok(client.post("/api/datasets/upload", data={"file": (io.BytesIO(csv_bytes), "topics.csv"), "name": "Topics"}, content_type="multipart/form-data"), 201)
    assert ds["text_column"] == "body" and ds["label_column"] == "topic"
    assert ds["status"] == "ready" and ds["n_classes"] == 3
    assert ds["validation"]["empty_text_rows"] == 1
    runs = {}
    for model_type in ("linear_svm", "logreg", "mnb"):
        body = {"dataset_id": ds["id"], "model_type": model_type, "feature": {"kind": "tfidf", "ngram_min": 1, "ngram_max": 2, "min_df": 1}, "test_size": 0.25, "cv_folds": 3 if model_type == "mnb" else 0}
        run = _ok(client.post("/api/models/train", json=body), 202)
        runs[model_type] = run["id"]
    done = {k: _wait(client, v) for k, v in runs.items()}
    return ds, done


def test_tuning_uses_training_data_and_records_grid(client, trained):
    ds = trained[0]
    run = _ok(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "mnb", "tune": True, "train_balance": "oversample", "feature": {"kind": "tfidf", "min_df": 1}}), 202)
    done = _wait(client, run["id"])
    assert done["status"] == "completed", done["error"]
    t = done["metrics"]["tuning"]
    assert t["folds"] == 3 and len(t["results"]) == 4
    assert done["hyperparameters"]["alpha"] == t["best_params"]["alpha"] in (0.03, 0.1, 0.3, 1.0)
    assert t["n_docs"] == done["metrics"]["n_train"]  # CV only ever saw the training split
    counts = done["metrics"]["split_counts"]
    assert sum(v["test"] for v in counts.values()) == done["metrics"]["n_test"]
    assert done["metrics"]["n_train_fit"] >= done["metrics"]["n_train"]  # oversampling applies to training only
    _err(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "mnb", "train_balance": "smote"}), 400)


def test_health(client):
    data = _ok(client.get("/api/health"))
    assert data["status"] == "ok" and "scikit-learn" in data["versions"]


def test_catalog_lists_required_models(client):
    types = {m["type"] for m in _ok(client.get("/api/models/catalog"))}
    assert {"linear_svm", "rbf_svm", "mnb", "logreg"} <= types


def test_training_produces_real_metrics(trained):
    _, runs = trained
    for run in runs.values():
        assert run["status"] == "completed", run["error"]
        m = run["metrics"]
        assert 0 <= m["accuracy"] <= 1 and m["n_test"] > 0 and m["n_features"] > 0
        assert len(m["confusion_matrix"]["matrix"]) == 3
        assert sum(map(sum, m["confusion_matrix"]["matrix"])) == m["n_test"]
    assert runs["mnb"]["metrics"]["cv_folds"] == 3 and runs["mnb"]["metrics"]["cv_f1_macro_mean"] is not None


def test_first_completed_model_becomes_active(client, trained):
    settings = _ok(client.get("/api/settings"))
    assert settings["active_model_id"] in {r["id"] for r in trained[1].values()}


def test_classify_and_history(client, trained):
    run = trained[1]["logreg"]
    data = _ok(client.post("/api/classify", json={"text": "The patient received a vaccine at the hospital.", "model_id": run["id"]}))
    assert data["predicted_label"] == "medicine"
    assert data["preprocessing"]["final"]
    assert data["explanation"]["available"]
    history = _ok(client.get("/api/classifications?limit=5"))
    assert history[0]["id"] == data["classification_id"]


def test_heldout_sample_comes_from_test_split(client, trained):
    run = trained[1]["linear_svm"]
    s = _ok(client.get(f"/api/models/{run['id']}/sample"))
    assert s["text"] and s["label"] in {"space", "autos", "medicine"}
    assert s["n_samples"] <= run["metrics"]["n_test"]


def test_classify_validation(client, trained):
    _err(client.post("/api/classify", json={"text": "   "}), 422)
    _err(client.post("/api/classify", json={"text": "zzqx qqqz", "model_id": trained[1]["mnb"]["id"]}), 422)
    _err(client.post("/api/classify", json={"text": "x", "model_id": 99999}), 404)
    _err(client.post("/api/classify", data="not json", content_type="text/plain"), 400)


def test_similarity_separate_endpoint(client, trained):
    data = _ok(client.post("/api/similarity", json={"text": "rocket launch orbit", "model_id": trained[1]["linear_svm"]["id"], "k": 3}))
    assert data["method"] == "cosine" and 0 < len(data["results"]) <= 3
    assert data["results"][0]["label"] == "space"


def test_batch_flow(client, trained):
    csv = b"id,message\n1,The rocket reached orbit\n2,\n3,New brake pads and tires for the car\n"
    up = _ok(client.post("/api/batch/upload", data={"file": (io.BytesIO(csv), "batch.csv")}, content_type="multipart/form-data"), 201)
    assert up["n_rows"] == 3 and up["suggested_text_column"] == "message"
    job = _ok(client.post("/api/batch/classify", json={"upload_id": up["upload_id"], "text_column": "message", "model_id": trained[1]["linear_svm"]["id"]}))
    assert job["n_classified"] == 2 and job["n_skipped"] == 1
    assert [r["predicted_label"] for r in job["rows"]] == ["space", None, "autos"]
    dl = client.get(f"/api/batch/{job['job_id']}/download")
    assert dl.status_code == 200 and b"predicted_label" in dl.data
    _err(client.post("/api/batch/classify", json={"upload_id": up["upload_id"], "text_column": "nope"}), 422)
    _err(client.post("/api/batch/classify", json={"upload_id": "../../etc", "text_column": "message"}), 400)


def test_upload_rejections(client):
    _err(client.post("/api/datasets/upload", data={"file": (io.BytesIO(b"a,b\n1,2\n"), "x.txt")}, content_type="multipart/form-data"), 400)
    _err(client.post("/api/datasets/upload", data={"file": (io.BytesIO(b'a,b\n"1,2\n3,4,5,6\n'), "bad.csv")}, content_type="multipart/form-data"), 422)
    _err(client.post("/api/datasets/upload", data={}, content_type="multipart/form-data"), 400)


def test_dataset_column_validation(client, trained):
    ds = trained[0]
    bad = _ok(client.patch(f"/api/datasets/{ds['id']}", json={"text_column": "body", "label_column": "extra"}))
    assert bad["status"] == "invalid" and bad["validation"]["errors"]
    _err(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "mnb"}), 409)
    good = _ok(client.patch(f"/api/datasets/{ds['id']}", json={"text_column": "body", "label_column": "topic"}))
    assert good["status"] == "ready"
    preview = _ok(client.get(f"/api/datasets/{ds['id']}/preview?limit=5"))
    assert len(preview["rows"]) == 5 and preview["columns"] == ["body", "topic", "extra"]


def test_invalid_training_config(client, trained):
    ds = trained[0]
    _err(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "gpt"}), 422)
    _err(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "mnb", "hyperparameters": {"alpha": -1}}), 422)
    _err(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "mnb", "feature": {"kind": "tfidf", "ngram_min": 3, "ngram_max": 1}}), 422)


def test_overview_and_analytics_use_real_data(client, trained):
    ov = _ok(client.get("/api/analytics/overview"))
    assert ov["active_model"] and ov["dataset"]["id"] == trained[0]["id"]
    assert {"linear_svm", "logreg", "mnb"} <= {b["model_type"] for b in ov["benchmark"]}
    assert ov["distribution_stats"]["entropy_bits"] > 0
    an = _ok(client.get(f"/api/analytics?model_id={trained[1]['logreg']['id']}"))
    assert an["model"]["id"] == trained[1]["logreg"]["id"] and len(an["comparison"]) >= 3


def test_search(client, trained):
    res = _ok(client.get("/api/search?q=Topics"))
    assert res["datasets"] and res["datasets"][0]["name"] == "Topics"


def test_unknown_endpoint_is_json(client):
    _err(client.get("/api/nope"), 404)


def test_only_the_four_deployed_models_are_usable(client, trained):
    ds = trained[0]
    slots = _ok(client.get("/api/models/deployed"))
    assert [s["type"] for s in slots] == ["linear_svm", "rbf_svm", "mnb", "logreg"]
    assert slots[1]["run"] is None  # RBF not trained in this suite
    first_mnb = trained[1]["mnb"]["id"]
    assert next(s for s in slots if s["type"] == "mnb")["run"]["id"] == first_mnb
    # A second run of the same model type is kept as history but is not usable until deployed.
    extra = _ok(client.post("/api/models/train", json={"dataset_id": ds["id"], "model_type": "mnb", "feature": {"kind": "bow", "min_df": 1}}), 202)
    extra = _wait(client, extra["id"])
    assert extra["is_deployed"] is False
    err = _err(client.post("/api/classify", json={"text": "rocket orbit launch", "model_id": extra["id"]}), 409)
    assert err["code"] == "model_not_deployed"
    _ok(client.post(f"/api/models/{extra['id']}/deploy"))
    assert _ok(client.post("/api/classify", json={"text": "rocket orbit launch", "model_id": extra["id"]}))["predicted_label"] == "space"
    slots = {s["type"]: s["run"]["id"] for s in _ok(client.get("/api/models/deployed")) if s["run"]}
    assert slots["mnb"] == extra["id"] and first_mnb not in slots.values() and len(slots) == 3
    # Deleting a deployed run refills its slot from the remaining runs of that type.
    _ok(client.delete(f"/api/models/{extra['id']}"))
    slots = {s["type"]: s["run"]["id"] for s in _ok(client.get("/api/models/deployed")) if s["run"]}
    assert "mnb" in slots and slots["mnb"] != extra["id"]



def test_pdf_reports(client, trained):
    r = client.get("/api/reports/evaluation.pdf")
    assert r.status_code == 200 and r.mimetype == "application/pdf" and r.data[:4] == b"%PDF" and len(r.data) > 3000
    assert "attachment" in r.headers["Content-Disposition"]
    one = client.get(f"/api/reports/evaluation.pdf?model_id={trained[1]['logreg']['id']}")
    assert one.status_code == 200 and one.data[:4] == b"%PDF"
    _err(client.get("/api/reports/evaluation.pdf?model_id=abc"), 400)
    _err(client.get("/api/reports/evaluation.pdf?model_id=99999"), 404)
