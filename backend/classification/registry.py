"""
The four TextIQ classifiers: Linear SVM, RBF SVM, Multinomial Naive Bayes and
Logistic Regression. The set is intentionally fixed at four.

Probability handling:
  * SVMs (linear and RBF) have no native probabilities. Their decision function is a
    margin, not a probability, so they are wrapped in CalibratedClassifierCV (Platt /
    sigmoid scaling fitted with internal cross-validation) and only the calibrated
    output is reported as a probability.
  * Logistic Regression and Multinomial Naive Bayes expose genuine posteriors natively
    (the NB posterior is typically over-confident, and is labelled uncalibrated).

Tuning: each spec has a small grid searched with cross-validation on the training split
only (see services/training.py); SVMs are tuned uncalibrated and calibrated afterwards.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import SVC, LinearSVC

CALIBRATION_FOLDS = 3


@dataclass(frozen=True)
class Hyperparameter:
    name: str
    label: str
    type: str  # 'float' | 'int' | 'bool'
    default: float | bool
    min: float
    max: float
    step: float
    help: str


@dataclass(frozen=True)
class ModelSpec:
    type: str
    name: str
    short_name: str
    estimator: str
    description: str
    probability_method: str
    explanation: str  # 'coefficients' | 'naive_bayes' | 'none'
    explanation_note: str
    base: Callable[[dict, int], object]  # uncalibrated estimator (used for tuning)
    hyperparameters: tuple[Hyperparameter, ...] = field(default_factory=tuple)
    grid: dict = field(default_factory=dict)  # small tuning grid over hyperparameter names
    cost_note: str | None = None
    calibrated: bool = False  # wrapped in CalibratedClassifierCV
    has_margin: bool = False  # exposes an SVM decision function (margin)

    def build(self, hp: dict, seed: int):
        est = self.base(hp, seed)
        return _calibrated(est) if self.calibrated else est

    def public(self) -> dict:
        return {
            "type": self.type,
            "name": self.name,
            "short_name": self.short_name,
            "estimator": self.estimator,
            "description": self.description,
            "probability_method": self.probability_method,
            "explanation": self.explanation,
            "explanation_note": self.explanation_note,
            "hyperparameters": [h.__dict__ for h in self.hyperparameters],
            "cost_note": self.cost_note,
            "grid": self.grid,
        }


def _cw(hp: dict):
    return "balanced" if hp.get("balanced") else None


def _calibrated(base):
    return CalibratedClassifierCV(base, method="sigmoid", cv=CALIBRATION_FOLDS)


def _gamma(hp: dict):
    return "scale" if not hp.get("gamma") else hp["gamma"]


C_SVM = Hyperparameter("C", "Regularisation C", "float", 1.0, 0.01, 100.0, 0.01, "Inverse regularisation strength. Larger C fits the training data more tightly.")
BALANCED = Hyperparameter(
    "balanced",
    "Balanced class weights",
    "bool",
    False,
    0,
    1,
    1,
    "Weights each class inversely to its frequency (class_weight='balanced') so small classes count as much as large ones during training.",
)
ALPHA = Hyperparameter("alpha", "Smoothing α", "float", 0.1, 0.001, 10.0, 0.001, "Additive (Laplace/Lidstone) smoothing applied to feature counts.")

MODELS: dict[str, ModelSpec] = {
    "linear_svm": ModelSpec(
        type="linear_svm",
        name="SVM — Linear",
        short_name="SVM — Linear",
        estimator="LinearSVC + CalibratedClassifierCV",
        description="Support vector machine with a linear kernel (one-vs-rest). Strong baseline for sparse, high-dimensional text features.",
        probability_method=f"Platt-calibrated (sigmoid, {CALIBRATION_FOLDS}-fold)",
        explanation="coefficients",
        explanation_note="Contribution = feature value × class weight, averaged over the calibration folds' LinearSVC coefficients.",
        base=lambda hp, seed: LinearSVC(C=hp["C"], dual="auto", class_weight=_cw(hp), random_state=seed),
        hyperparameters=(C_SVM, BALANCED),
        grid={"C": [0.1, 0.3, 1.0, 3.0]},
        calibrated=True,
        has_margin=True,
    ),
    "rbf_svm": ModelSpec(
        type="rbf_svm",
        name="SVM — RBF",
        short_name="SVM — RBF",
        estimator="SVC(kernel='rbf') + CalibratedClassifierCV",
        description="Support vector machine with a radial basis function kernel. Can model non-linear boundaries at a higher training cost.",
        probability_method=f"Platt-calibrated (sigmoid, {CALIBRATION_FOLDS}-fold)",
        explanation="none",
        explanation_note="An RBF kernel has no per-feature weights, so a faithful word-level explanation is not available for this model.",
        base=lambda hp, seed: SVC(kernel="rbf", C=hp["C"], gamma=_gamma(hp), cache_size=1000, class_weight=_cw(hp), random_state=seed),
        hyperparameters=(
            Hyperparameter("C", "Regularisation C", "float", 10.0, 0.01, 1000.0, 0.01, C_SVM.help),
            Hyperparameter("gamma", "Kernel width γ (0 = scale)", "float", 0.0, 0.0, 100.0, 0.01, "RBF kernel coefficient. 0 uses scikit-learn's 'scale' heuristic, 1 / (n_features × variance)."),
            BALANCED,
        ),
        grid={"C": [1.0, 10.0], "gamma": [0.0, 0.5, 1.0]},
        cost_note="Kernel SVM training time grows roughly quadratically with the number of training documents, so it is trained on a capped, stratified subset of the training split — use 'Max training documents'. Tuning uses a further subset.",
        calibrated=True,
        has_margin=True,
    ),
    "mnb": ModelSpec(
        type="mnb",
        name="Multinomial Naive Bayes",
        short_name="Multinomial NB",
        estimator="MultinomialNB",
        description="Generative model over term counts/weights. Very fast to train; a classic text baseline.",
        probability_method="Naive Bayes posterior (uncalibrated)",
        explanation="naive_bayes",
        explanation_note="Contribution = feature value × (log P(term | class) − mean log P(term | any class)).",
        base=lambda hp, seed: MultinomialNB(alpha=hp["alpha"]),
        hyperparameters=(ALPHA,),
        grid={"alpha": [0.03, 0.1, 0.3, 1.0]},
    ),
    "logreg": ModelSpec(
        type="logreg",
        name="Logistic Regression",
        short_name="Logistic Regression",
        estimator="LogisticRegression (L2, lbfgs)",
        description="Multinomial logistic regression with L2 penalty. Produces probabilities directly and interpretable per-class weights.",
        probability_method="Multinomial logistic (softmax) posterior",
        explanation="coefficients",
        explanation_note="Contribution = feature value × class coefficient, i.e. the term's additive effect on the class logit.",
        base=lambda hp, seed: LogisticRegression(C=hp["C"], max_iter=2000, class_weight=_cw(hp), random_state=seed),
        hyperparameters=(Hyperparameter("C", "Regularisation C", "float", 10.0, 0.01, 1000.0, 0.01, C_SVM.help), BALANCED),
        grid={"C": [1.0, 3.0, 10.0, 30.0]},
    ),
}


def get_spec(model_type: str) -> ModelSpec:
    if model_type not in MODELS:
        raise ValueError(f"Unknown model type '{model_type}'. Choose one of: {', '.join(MODELS)}.")
    return MODELS[model_type]


def resolve_hyperparameters(spec: ModelSpec, given: dict | None) -> dict:
    given = given or {}
    unknown = set(given) - {h.name for h in spec.hyperparameters}
    if unknown:
        raise ValueError(f"Unsupported hyperparameter(s) for {spec.name}: {', '.join(sorted(unknown))}.")
    resolved = {}
    for h in spec.hyperparameters:
        v = given.get(h.name, h.default)
        if h.type == "bool":
            if not isinstance(v, bool):
                raise ValueError(f"{h.label} must be true or false.")
            resolved[h.name] = v
            continue
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ValueError(f"{h.label} must be a number.")
        if not (h.min <= v <= h.max):
            raise ValueError(f"{h.label} must be between {h.min} and {h.max}.")
        resolved[h.name] = int(v) if h.type == "int" else float(v)
    return resolved
