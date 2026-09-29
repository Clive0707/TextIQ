import pandas as pd
import pytest

from classification.registry import MODELS, resolve_hyperparameters
from datasets.news import CATEGORY_MAP, TOPICS, build


def _raw(rows):
    return pd.DataFrame(rows, columns=["headline", "short_description", "category", "date"])


def test_mapping_covers_exactly_the_eight_topics():
    assert set(CATEGORY_MAP.values()) == set(TOPICS) and len(TOPICS) == 8
    assert CATEGORY_MAP["MONEY"] == "Business"


def test_build_maps_cleans_and_reports_real_counts():
    raw = _raw(
        [
            ("Apple Unveils New Chip", "The processor is faster and uses less power than before.", "TECH", "2020-01-01"),
            ("Apple Unveils New Chip", "The processor is faster and uses less power than before.", "TECH", "2020-01-02"),  # duplicate
            ("Same Text Different Topic Here", "", "POLITICS", "2020-01-03"),
            ("Same Text Different Topic Here", "", "SPORTS", "2020-01-03"),  # conflicting labels → both dropped
            ("Too short", "", "SPORTS", "2020-01-04"),  # < 5 words
            ("", "", "WELLNESS", "2020-01-05"),  # empty
            ("Recipe Of The Week For Busy Families", "Quick pasta.", "FOOD & DRINK", "2020-01-06"),  # unmapped section
            ("Markets rally &amp; stocks climb", "Investors cheered the jobs report.", "MONEY", "2020-01-07"),
            ("Team wins the championship final tonight", "", "SPORTS", "2020-01-08"),
        ]
    )
    df, rep = build(raw)
    assert list(df.columns) == ["id", "text", "category", "headline", "source_category", "date"]
    assert rep["source_records"] == 9
    assert rep["excluded_other_sections"] == 1
    assert rep["mapped_records"] == 8
    assert rep["empty_text"] == 1 and rep["too_short"] == 1
    assert rep["conflicting_duplicates"] == 2 and rep["duplicate_texts"] == 1
    assert rep["final_records"] == len(df) == 3
    assert set(df["category"]) == {"Technology", "Business", "Sports"}
    # HTML entities decoded, headline and description joined into one sentence sequence
    assert df.loc[df.category == "Business", "text"].iloc[0] == "Markets rally & stocks climb. Investors cheered the jobs report."
    assert df.loc[df.category == "Sports", "text"].iloc[0] == "Team wins the championship final tonight"


def test_balanced_class_weight_is_a_validated_boolean():
    spec = MODELS["linear_svm"]
    assert resolve_hyperparameters(spec, None)["balanced"] is False
    hp = resolve_hyperparameters(spec, {"balanced": True})
    assert spec.build(hp, 0).estimator.class_weight == "balanced"
    with pytest.raises(ValueError):
        resolve_hyperparameters(spec, {"balanced": 1})
    with pytest.raises(ValueError):
        resolve_hyperparameters(MODELS["mnb"], {"balanced": True})  # not offered for Naive Bayes


def test_training_frame_removes_duplicates_before_split(tmp_path):
    from datasets.loader import training_frame

    rows = ["text,label"] + ['"alpha beta gamma delta",a'] * 5 + ['"Alpha  beta gamma DELTA",a', '"shared words here now",a', '"shared words here now",b', '"only once here too",b', '"another one for b",b']
    p = tmp_path / "d.csv"
    p.write_text("\n".join(rows) + "\n", encoding="utf-8")
    df, info = training_frame(p, "text", "label")
    assert info["n_source_rows"] == 10
    assert info["n_conflicting_removed"] == 2  # same text labelled a and b
    assert info["n_duplicates_removed"] == 5  # 6 case/space variants of one text → 1 kept
    assert sorted(df["text"].str.lower().str.replace(r"\s+", " ", regex=True)) == sorted(set(df["text"].str.lower().str.replace(r"\s+", " ", regex=True)))