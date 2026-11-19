"""AI symptom triage for JanCare.

1. An ensemble of text classifiers (textmodels.py) maps the patient's free-text
   complaint (English / Hindi / Hinglish) to an OPD department: TF-IDF + logistic
   regression, a neural network, and - if installed - a pretrained multilingual
   Transformer. Trained on data/triage_train.csv.
2. A safety rule layer flags emergency red-flags and high pain scores.
   Safety rules ALWAYS override the ML output. This is a demo, not a diagnosis.

Evaluate with `python evaluate_triage.py` (held-out test set, written separately).
Trains in well under a second at startup, so no extra model files are needed.
"""
from pathlib import Path
import re
import pandas as pd
from textmodels import EnsembleTextClassifier, build_tfidf_lr, chosen_components, normalize  # noqa: F401

DATA = Path(__file__).resolve().parent / "data" / "triage_train.csv"
LOW_CONFIDENCE = 0.30


def build_model():
    """Classic single model (kept for evaluation / comparison)."""
    return build_tfidf_lr()


def load_training_data(path=DATA):
    df = pd.read_csv(path).dropna()
    return df["text"].tolist(), df["department"].tolist()


_texts, _labels = load_training_data()
_model = EnsembleTextClassifier(chosen_components("triage"), cache_name="triage_train").fit(_texts, _labels)
MODEL_TYPE = _model.description

# Emergency red flags (English / Hinglish / Hindi). Rules override ML.
RED_FLAGS = [
    r"chest pain.*(sweat|arm|breath)", r"can.?t breathe", r"cannot breathe", r"difficulty breathing",
    r"not breathing", r"unconscious", r"not waking", r"heavy bleeding", r"bleeding heavily", r"stroke",
    r"face.{0,12}droop", r"slurred", r"suicid", r"seizure", r"\bfits?\b.*(now|not waking)", r"poison",
    r"severe burn", r"behosh", r"saans nahi", r"bahut khoon", r"khoon beh",
    r"बेहोश", r"सांस नहीं", r"सांस लेने में तकलीफ", r"बहुत खून", r"खून बह", r"ज़हर", r"जहर", r"लकवा", r"आत्महत्या",
]
URGENT_FLAGS = [r"chest", r"seene", r"chhati", r"सीने", r"छाती", r"high fever", r"tez bukhar", r"तेज बुखार", r"blood", r"खून"]


def is_red_flag(text: str) -> bool:
    t = (text or "").lower()
    return any(re.search(p, t) for p in RED_FLAGS)


def triage(text: str, pain: int = 0):
    text = (text or "").strip()
    pain = max(0, min(10, int(pain or 0)))
    probs = _model.predict_proba([text])[0] if text else None
    ranked = sorted(zip(_model.classes_, probs), key=lambda x: -x[1])[:3] if text else []
    dept, conf = (ranked[0][0], float(ranked[0][1])) if ranked else ("General Medicine", 0.0)
    low_conf = conf < LOW_CONFIDENCE  # not sure -> default to General Medicine
    if low_conf:
        dept = "General Medicine"
    flagged = is_red_flag(text)
    emergency = flagged or pain >= 8
    urgent = pain >= 6 or any(re.search(p, text.lower()) for p in URGENT_FLAGS)
    urgency = "Emergency" if emergency else ("Urgent" if urgent else "Routine")
    return {
        "department": dept,
        "confidence": round(conf, 2),
        "low_confidence": low_conf,
        "alternatives": [{"department": d, "confidence": round(float(p), 2)} for d, p in ranked[1:]],
        "urgency": urgency,
        "emergency": emergency,
        "reason": "red-flag symptom" if flagged else ("pain score >= 8" if pain >= 8 else "none"),
        "model_type": MODEL_TYPE,
    }
