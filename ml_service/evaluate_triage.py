"""Evaluate the JanCare symptom triage on held-out data.

* data/triage_test.csv        - development test set (different wording from training);
                                its errors were used to add training phrases, so it is
                                no longer independent
* data/triage_blind_test.csv  - blind test set written afterwards and never used for
                                tuning: this is the headline accuracy
* data/triage_safety_test.csv - emergency vs non-emergency cases for the rule layer

Compares against the original JanCare setup (char 2-4 n-grams, the old 85-phrase
training list), and writes models/triage_metrics.json.
"""
from pathlib import Path
import json
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, recall_score, precision_score
from sklearn.model_selection import StratifiedKFold
import numpy as np
import embeddings
from textmodels import EnsembleTextClassifier, select_components
from sklearn.pipeline import make_pipeline
import triage

BASE = Path(__file__).resolve().parent


def lang(text):
    if any("ऀ" <= ch <= "ॿ" for ch in text):
        return "hindi"
    return "english_or_hinglish"


def cv_accuracy(make, X, y, folds=5):
    """Stratified k-fold accuracy for any model factory (works for the ensemble too)."""
    X, y = np.array(X, dtype=object), np.array(y)
    accs = []
    for tr, va in StratifiedKFold(folds, shuffle=True, random_state=0).split(X, y):
        m = make().fit(list(X[tr]), list(y[tr]))
        accs.append(float((np.asarray(m.predict(list(X[va]))) == y[va]).mean()))
    return round(float(np.mean(accs)), 3)


def compare_models(X, y, test_texts, test_labels, components):
    """Blind-test accuracy of each model family alone and of the chosen ensemble."""
    single = ["tfidf_lr", "mlp"] + (["transformer"] if embeddings.available() else [])
    out = {}
    for name in single + ["chosen"]:
        comps = components if name == "chosen" else [name]
        m = EnsembleTextClassifier(comps).fit(X, y)
        out[name] = {"label": m.description, "test_accuracy": round(float((np.asarray(m.predict(list(test_texts))) == np.asarray(test_labels)).mean()), 3)}
    return out


def main():
    dev = pd.read_csv(BASE / "data" / "triage_test.csv")
    test = pd.read_csv(BASE / "data" / "triage_blind_test.csv")
    safety = pd.read_csv(BASE / "data" / "triage_safety_test.csv")
    X, y = triage.load_training_data()
    labels = sorted(set(y))

    sel = select_components("triage", X, y, cv_accuracy)  # chosen on training data only
    new = EnsembleTextClassifier(sel["components"]).fit(X, y)
    old_df = pd.read_csv(BASE / "data" / "triage_v1_train.csv")  # original hard-coded phrase list
    old = make_pipeline(TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4)),
                        LogisticRegression(max_iter=1000, C=10)).fit(old_df["text"], old_df["department"])

    pred = new.predict(test["text"])
    proba = new.predict_proba(test["text"])
    top3 = sum(t in new.classes_[p.argsort()[::-1][:3]] for t, p in zip(test["department"], proba)) / len(test)
    old_pred = old.predict(test["text"])
    by_lang = {}
    for g, idx in test.groupby(test["text"].map(lang)).groups.items():
        pos = test.index.get_indexer(idx)
        by_lang[g] = round(float(accuracy_score(test.loc[idx, "department"], pred[pos])), 3)

    s_pred = [int(triage.is_red_flag(t) or p >= 8) for t, p in zip(safety["text"], safety["pain"])]
    missed = [t for t, e, p in zip(safety["text"], safety["expected_emergency"], s_pred) if e == 1 and p == 0]

    report = {
        "model_type": new.description,
        "selection": {"method": "5-fold cross-validation on training data", "cv_scores": sel["all_cv_scores"], "chosen": sel["components"]},
        "deep_learning_status": embeddings.status(),
        "train_examples": len(X),
        "test_set": "blind (data/triage_blind_test.csv)",
        "test_examples": int(len(test)),
        "accuracy": round(float(accuracy_score(test["department"], pred)), 3),
        "top3_accuracy": round(float(top3), 3),
        "macro_f1": round(float(f1_score(test["department"], pred, average="macro")), 3),
        "accuracy_by_language": by_lang,
        "dev_set_accuracy": round(float(accuracy_score(dev["department"], new.predict(dev["text"]))), 3),
        "model_comparison": compare_models(X, y, test["text"], test["department"], sel["components"]),
        "previous_model_accuracy_note": "original JanCare model (char 2-4, original 89 phrases) on the same blind test",
        "previous_model_accuracy": round(float(accuracy_score(test["department"], old_pred)), 3),
        "labels": labels,
        "confusion_matrix": confusion_matrix(test["department"], pred, labels=labels).tolist(),
        "errors": [{"text": t, "expected": e, "predicted": p}
                   for t, e, p in zip(test["text"], test["department"], pred) if e != p],
        "safety_layer": {
            "cases": int(len(safety)),
            "emergency_recall": round(float(recall_score(safety["expected_emergency"], s_pred)), 3),
            "emergency_precision": round(float(precision_score(safety["expected_emergency"], s_pred, zero_division=0)), 3),
            "missed_emergencies": missed,
        },
        "notice": "Small hand-written test set; a demo measurement, not clinical validation. "
                  "The blind set was also used to compare model families, so treat small differences with caution.",
    }
    out = BASE / "models" / "triage_metrics.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("confusion_matrix", "labels", "errors")}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
