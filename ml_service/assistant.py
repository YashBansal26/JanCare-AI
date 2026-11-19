"""JanCare patient assistant: multilingual intent classifier (EN / Hindi / Hinglish).

Understands what the patient is asking; the backend then answers with the
patient's REAL data (their appointment, queue position, predicted wait).
No external LLM is called, so it works offline and never invents medical
advice. Symptom descriptions are routed to the triage model, and red-flag
emergencies always win.
"""
from pathlib import Path
import json
import pandas as pd
from sklearn.model_selection import cross_val_score, StratifiedKFold
from textmodels import EnsembleTextClassifier, build_tfidf_lr, chosen_components, select_components
import embeddings
from triage import is_red_flag, triage

DATA = Path(__file__).resolve().parent / "data" / "assistant_intents.csv"
MIN_CONF = 0.35


def build():
    return build_tfidf_lr()


_df = pd.read_csv(DATA)
_model = EnsembleTextClassifier(chosen_components("assistant"), cache_name="assistant_train").fit(_df["text"], _df["intent"])


def understand(text: str):
    text = (text or "").strip()[:500]
    if not text:
        return {"intent": "unknown", "confidence": 0.0}
    if is_red_flag(text):
        return {"intent": "emergency", "confidence": 1.0, "triage": triage(text, 0)}
    probs = _model.predict_proba([text])[0]
    i = probs.argmax()
    intent, conf = _model.classes_[i], float(probs[i])
    if conf < MIN_CONF:
        t = triage(text, 0)  # maybe it is a symptom description the intent model missed
        intent = "symptoms" if t["confidence"] >= 0.45 else "unknown"
    out = {"intent": intent, "confidence": round(conf, 2)}
    if intent == "symptoms":
        out["triage"] = triage(text, 0)
    return out


def evaluate():
    from evaluate_triage import cv_accuracy
    X, y = _df["text"].tolist(), _df["intent"].tolist()
    sel = select_components("assistant", X, y, cv_accuracy)
    report = {"model_type": EnsembleTextClassifier(sel["components"]).fit(X, y).description,
              "deep_learning_status": embeddings.status(), "examples": int(len(_df)),
              "intents": sorted(_df["intent"].unique().tolist()),
              "cross_validation_accuracy": sel["cv_accuracy"],
              "model_comparison_cv": sel["all_cv_scores"],
              "note": "Model combination chosen by 5-fold cross-validation. Restart the AI service to use it."}
    (Path(__file__).resolve().parent / "models" / "assistant_metrics.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    evaluate()
