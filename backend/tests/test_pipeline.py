import numpy as np
import pytest
from sklearn.pipeline import Pipeline

from classification.features import FeatureConfig, build_vectorizer
from classification.model import TrainedModel
from classification.registry import MODELS, resolve_hyperparameters
from preprocessing.text import PreprocessConfig, TextPreprocessor
from similarity.index import SimilarityIndex
from tests.conftest import make_rows


def test_preprocessing_trace():
    p = TextPreprocessor(PreprocessConfig(lowercase=True, remove_punctuation=True, remove_stopwords=True))
    trace = p.trace("The Rocket's LAUNCH, was delayed!!")
    assert trace["tokens"] == ["the", "rocket's", "launch", "was", "delayed"]
    assert "the" in trace["removed_stopwords"] and "was" in trace["removed_stopwords"]
    assert trace["final"] == "rocket's launch delayed"
    assert p("The Rocket's LAUNCH, was delayed!!") == trace["final"]


def test_preprocessing_keeps_punctuation_when_asked():
    p = TextPreprocessor(PreprocessConfig(lowercase=False, remove_punctuation=False, remove_stopwords=False))
    assert p.tokens("Hi, NASA!") == ["Hi", ",", "NASA", "!"]


def test_stemming():
    p = TextPreprocessor(PreprocessConfig(stemming=True))
    assert p("launching rockets") == "launch rocket"


@pytest.mark.parametrize("kind,lo,hi", [("tfidf", 1, 2), ("bow", 1, 1), ("char", 3, 5), ("combo", 1, 2)])
def test_feature_config_and_vectorizers(kind, lo, hi):
    cfg = FeatureConfig.from_dict({"kind": kind, "ngram_min": lo, "ngram_max": hi, "min_df": 1})
    vec = build_vectorizer(cfg)
    X = vec.fit_transform(["orbit rocket launch", "engine car brake"])
    assert X.shape[0] == 2 and X.shape[1] > 0


def test_feature_config_rejects_bad_ranges():
    with pytest.raises(ValueError):
        FeatureConfig.from_dict({"kind": "tfidf", "ngram_min": 3, "ngram_max": 1})
    with pytest.raises(ValueError):
        FeatureConfig.from_dict({"kind": "word2vec"})


def _fit(model_type, kind="tfidf"):
    rows = make_rows(40)
    texts, labels = [r[0] for r in rows], [r[1] for r in rows]
    spec = MODELS[model_type]
    prep = TextPreprocessor(PreprocessConfig())
    cfg = FeatureConfig.from_dict({"kind": kind, "min_df": 1})
    pipe = Pipeline([("features", build_vectorizer(cfg)), ("classifier", spec.build(resolve_hyperparameters(spec, None), 0))])
    pipe.fit(prep.transform(texts), labels)
    return TrainedModel(model_type, prep, pipe.named_steps["features"], pipe.named_steps["classifier"], cfg.label, {"feature": cfg.to_dict()}), texts


@pytest.mark.parametrize("model_type", list(MODELS))
def test_every_model_classifies_with_valid_probabilities(model_type):
    model, _ = _fit(model_type)
    result = model.classify("The astronaut watched the rocket launch toward orbit around the moon.")
    assert result["predicted_label"] == "space"
    probs = [p["probability"] for p in result["probabilities"]]
    assert abs(sum(probs) - 1) < 1e-4
    assert all(0 <= p <= 1 for p in probs)
    assert result["confidence"] == pytest.approx(max(probs), abs=1e-6)
    spec = MODELS[model_type]
    if spec.calibrated:
        assert "calibrated" in result["probability_method"].lower()
    # SVM margins are reported separately and are never labelled as probabilities.
    assert (result["decision_scores"] is not None) == spec.has_margin


@pytest.mark.parametrize("model_type", ["linear_svm", "logreg", "mnb"])
def test_explanations_are_exact_contributions(model_type):
    model, _ = _fit(model_type)
    result = model.classify("rocket orbit launch nasa")
    exp = result["explanation"]
    assert exp["available"] and exp["supporting"]
    top = {f["feature"] for f in exp["supporting"]}
    assert top & {"rocket", "orbit", "launch", "nasa"}
    for f in exp["supporting"] + exp["opposing"]:
        assert f["contribution"] == pytest.approx(f["value"] * f["weight"], rel=1e-3, abs=1e-6)


def test_linear_contributions_reconstruct_score():
    """For LogisticRegression, Σ contributions + intercept equals the class logit."""
    model, _ = _fit("logreg")
    text = "engine brake tire clutch"
    X = model.vectorize([text])
    est = model.estimator
    c = list(est.classes_).index("autos")
    logit = float((X @ est.coef_[c])[0] + est.intercept_[c])
    weights, _ = model._explainer()
    contrib = (X.toarray()[0] * weights[c]).sum()
    assert contrib + est.intercept_[c] == pytest.approx(logit, rel=1e-6)


def test_rbf_has_no_fabricated_explanation():
    model, _ = _fit("rbf_svm")
    exp = model.classify("rocket orbit")["explanation"]
    assert exp["available"] is False and exp["supporting"] == [] and exp["note"]


def test_similarity_is_cosine_and_ranked():
    model, texts = _fit("mnb")
    labels = ["x"] * len(texts)
    index = SimilarityIndex(model.vectorize(texts), texts, labels)
    res = index.query(model.vectorize([texts[3]]), k=3)
    assert res[0]["index"] == 3 and res[0]["similarity"] == pytest.approx(1.0, abs=1e-4)
    sims = [r["similarity"] for r in res]
    assert sims == sorted(sims, reverse=True)
    assert np.all(np.array(sims) <= 1.0001)


def test_artifact_roundtrip(tmp_path):
    model, _ = _fit("linear_svm")
    path = tmp_path / "m.joblib"
    model.save(path)
    loaded = TrainedModel.load(path)
    a = model.classify("doctor patient vaccine")
    b = loaded.classify("doctor patient vaccine")
    assert a["predicted_label"] == b["predicted_label"] == "medicine"
    assert a["confidence"] == pytest.approx(b["confidence"])


def test_exactly_the_four_textiq_models():
    assert list(MODELS) == ["linear_svm", "rbf_svm", "mnb", "logreg"]
    assert all(spec.grid for spec in MODELS.values())


def test_classify_exposes_nlp_trace_and_vector_terms():
    model, _ = _fit("linear_svm")
    r = model.classify("The astronauts launched the rocket into orbit.")
    trace = r["preprocessing"]
    assert trace["filtered_tokens"] and all(t not in ("the", "into") for t in trace["filtered_tokens"])
    terms = r["vector"]["top_terms"]
    assert terms and all(t["weight"] > 0 for t in terms)
    assert [t["weight"] for t in terms] == sorted((t["weight"] for t in terms), reverse=True)


def test_combined_word_and_character_features():
    model, _ = _fit("linear_svm", kind="combo")
    r = model.classify("The astronauts launched the rocket into orbit.")
    assert r["predicted_label"] == "space"
    all_names = list(model._names())
    assert any(n.startswith("‹") for n in all_names) and any(not n.startswith("‹") for n in all_names)  # both blocks present
    shown = [f["feature"] for f in r["explanation"]["supporting"]] + [t["term"] for t in r["vector"]["top_terms"]]
    assert shown and not any(n.startswith(("words__", "chars__")) for n in shown)
    assert r["vector"]["n_in_vocabulary"] >= 1
