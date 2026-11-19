"""Text classifiers shared by symptom triage and the chat assistant.

Three model families, combined into an ensemble (average of probabilities):

1. TF-IDF character n-grams + Logistic Regression   (classic ML baseline)
2. Neural network (multi-layer perceptron, 128 hidden units, ReLU, Adam)
   trained from scratch on the same character n-gram features
3. Pretrained multilingual Transformer embeddings + Logistic Regression
   (deep learning transfer learning; only if installed - see embeddings.py)

Averaging models that make different kinds of mistakes is usually more
accurate and better calibrated than any single one of them.
"""
import itertools
import json
import re
import warnings
from pathlib import Path
import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
import embeddings


def normalize(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^\w\sऀ-ॿ]", " ", text)  # keep Devanagari
    return re.sub(r"\s+", " ", text)


def _tfidf():
    return TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, preprocessor=normalize)


def build_tfidf_lr():
    return make_pipeline(_tfidf(), LogisticRegression(max_iter=2000, C=10, class_weight="balanced"))


def build_mlp(seed=0):
    return make_pipeline(_tfidf(), MLPClassifier(hidden_layer_sizes=(128,), alpha=1e-3, max_iter=600, random_state=seed))


class EmbeddingLR:
    """Pretrained Transformer sentence embeddings -> Logistic Regression."""

    def __init__(self, cache_name=None):
        self.cache_name = cache_name
        self.clf = LogisticRegression(max_iter=3000, C=10, class_weight="balanced")

    def fit(self, X, y):
        self.clf.fit(embeddings.encode(list(X), cache_name=self.cache_name), list(y))
        self.classes_ = self.clf.classes_
        return self

    def predict_proba(self, X):
        return self.clf.predict_proba(embeddings.encode(list(X)))

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(1)]


COMPONENT_LABELS = {
    "tfidf_lr": "TF-IDF + Logistic Regression",
    "mlp": "Neural network (MLP, trained from scratch)",
    "transformer": "Pretrained multilingual Transformer (MiniLM) + Logistic Regression",
}


class EnsembleTextClassifier:
    def __init__(self, components=("tfidf_lr", "mlp", "transformer"), cache_name=None):
        self.requested = list(components)
        self.cache_name = cache_name
        self.models = {}

    def fit(self, X, y):
        X, y = list(X), list(y)
        self.classes_ = np.array(sorted(set(y)))
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", ConvergenceWarning)
            for name in self.requested:
                if name == "tfidf_lr":
                    self.models[name] = build_tfidf_lr().fit(X, y)
                elif name == "mlp":
                    self.models[name] = build_mlp().fit(X, y)
                elif name == "transformer" and embeddings.available():
                    try:
                        self.models[name] = EmbeddingLR(self.cache_name).fit(X, y)
                    except Exception:
                        pass  # fall back to the other models
        return self

    def _aligned(self, model, X):
        p = model.predict_proba(X)
        out = np.zeros((len(X), len(self.classes_)))
        for j, c in enumerate(model.classes_):
            out[:, np.searchsorted(self.classes_, c)] = p[:, j]
        return out

    def predict_proba(self, X):
        X = list(X)
        return np.mean([self._aligned(m, X) for m in self.models.values()], axis=0)

    def predict(self, X):
        return self.classes_[self.predict_proba(X).argmax(1)]

    @property
    def description(self):
        names = [COMPONENT_LABELS[n] for n in self.models]
        return "Ensemble of " + " + ".join(names) if len(names) > 1 else names[0]


CONFIG_PATH = Path(__file__).resolve().parent / "models" / "ensemble_config.json"
ALL = ["tfidf_lr", "mlp", "transformer"]


def chosen_components(task: str):
    """Components picked by evaluate_triage.py / assistant.py (cross-validation on training data)."""
    try:
        return json.loads(CONFIG_PATH.read_text())[task]["components"]
    except Exception:
        return ALL


def select_components(task, X, y, cv_accuracy):
    """Try every combination of available model families, keep the best by cross-validation
    on the TRAINING data (the test set is never used for this choice), save it, return the table."""
    available = ["tfidf_lr", "mlp"] + (["transformer"] if embeddings.available() else [])
    scores = {}
    for r in range(1, len(available) + 1):
        for combo in itertools.combinations(available, r):
            scores["+".join(combo)] = cv_accuracy(lambda c=combo: EnsembleTextClassifier(list(c)), X, y)
    best = max(scores, key=lambda k: (scores[k], -k.count("+")))  # ties -> simpler model
    cfg = json.loads(CONFIG_PATH.read_text()) if CONFIG_PATH.exists() else {}
    cfg[task] = {"components": best.split("+"), "cv_accuracy": scores[best], "all_cv_scores": scores,
                 "deep_learning": embeddings.status()}
    CONFIG_PATH.parent.mkdir(exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    return cfg[task]
