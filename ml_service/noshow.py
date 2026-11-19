"""No-show risk prediction for JanCare appointments.

Predicts the probability that a booked patient will not turn up, so staff can
send an extra reminder or plan slight overbooking. Uses only information the
system already has at booking time. Gender is deliberately NOT used as a feature
(fairness); age is used only in broad bands.

  python noshow.py            # generate synthetic data, train, evaluate
Writes models/noshow_model.pkl and models/noshow_metrics.json.
The bundled training data is SYNTHETIC; retrain on real JanCare history
(Staff dashboard -> AI -> Export no-show data -> data/live_noshow.csv) before relying on it.
"""
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss, precision_score, recall_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from features import DEPARTMENTS, SLOTS, is_after_holiday, season

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "models" / "noshow_model.pkl"
METRICS_PATH = BASE / "models" / "noshow_metrics.json"
LIVE_PATH = BASE / "data" / "live_noshow.csv"

FEATURES = ["lead_time_days", "hour", "day_of_week", "is_afternoon", "is_monsoon", "is_after_holiday",
            "age_band", "prior_appointments", "prior_no_shows", "prior_no_show_rate", "first_visit",
            *[f"dept_{d.replace(' ', '_')}" for d in DEPARTMENTS]]
HIGH, MEDIUM = 0.30, 0.15


def age_band(age):
    age = float(age or 35)
    return 0 if age < 18 else 1 if age < 30 else 2 if age < 45 else 3 if age < 60 else 4


def build_features(rows):
    """rows: list of dicts with date, hour, department, age, lead_time_days, prior_appointments, prior_no_shows."""
    out = []
    for r in rows:
        d = date.fromisoformat(str(r["date"])[:10])
        prior = int(r.get("prior_appointments") or 0)
        missed = min(int(r.get("prior_no_shows") or 0), prior)
        f = {
            "lead_time_days": max(0.0, float(r.get("lead_time_days") or 0)),
            "hour": int(r["hour"]),
            "day_of_week": d.weekday(),
            "is_afternoon": int(int(r["hour"]) >= 14),
            "is_monsoon": int(season(d.month) == "monsoon"),
            "is_after_holiday": is_after_holiday(d),
            "age_band": age_band(r.get("age")),
            "prior_appointments": prior,
            "prior_no_shows": missed,
            "prior_no_show_rate": (missed + 0.1) / (prior + 1),  # smoothed
            "first_visit": int(prior == 0),
        }
        for dept in DEPARTMENTS:
            f[f"dept_{dept.replace(' ', '_')}"] = int(r.get("department") == dept)
        out.append(f)
    return pd.DataFrame(out, columns=FEATURES)


def generate(n=40000, seed=7):
    """Synthetic appointment history with realistic no-show drivers (published studies
    consistently find lead time and past no-shows to be the strongest predictors)."""
    rng = np.random.default_rng(seed)
    start = date(2024, 11, 1)
    rows, y = [], []
    for _ in range(n):
        d = start + timedelta(days=int(rng.integers(0, 730)))
        if d.weekday() == 6:
            d += timedelta(days=1)
        prior = int(rng.poisson(1.8))
        tendency = rng.beta(1.2, 9)  # each patient's own unreliability
        missed = int(rng.binomial(prior, tendency)) if prior else 0
        lead = float(min(rng.exponential(5), 45))
        r = {"date": d.isoformat(), "hour": int(rng.choice(SLOTS)), "department": str(rng.choice(DEPARTMENTS)),
             "age": int(np.clip(rng.normal(38, 18), 1, 90)), "lead_time_days": round(lead, 1),
             "prior_appointments": prior, "prior_no_shows": missed}
        z = -2.9 + 0.045 * min(lead, 30) + 2.2 * tendency * 3 + (0.35 if r["hour"] >= 14 else 0)
        z += 0.35 * (season(d.month) == "monsoon") + 0.25 * (18 <= r["age"] < 30) - 0.3 * (r["age"] >= 60)
        z += {"Dermatology": 0.3, "Orthopedics": 0.1, "Cardiology": -0.45, "Pediatrics": -0.2}.get(r["department"], 0)
        z += 0.25 * (prior == 0) - 0.25 * is_after_holiday(d)
        rows.append(r)
        y.append(int(rng.random() < 1 / (1 + np.exp(-z))))
    df = pd.DataFrame(rows)
    df["no_show"] = y
    return df


def train():
    df = generate()
    source = {"synthetic_rows": int(len(df)), "live_rows": 0}
    if LIVE_PATH.exists():
        live = pd.read_csv(LIVE_PATH)
        source["live_rows"] = int(len(live))
        df = pd.concat([df, live], ignore_index=True)
    df = df.sort_values("date").reset_index(drop=True)
    X, y = build_features(df.to_dict("records")), df["no_show"].values
    cut = int(len(df) * 0.8)  # chronological: train on older, test on newest 20%
    Xtr, Xte, ytr, yte = X.iloc[:cut], X.iloc[cut:], y[:cut], y[cut:]

    models = {
        "LogisticRegression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)),
        "HistGradientBoostingClassifier": HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05,
                                                                         min_samples_leaf=50, random_state=0),
    }
    v = int(len(Xtr) * 0.875)  # last part of the training period is validation for model choice
    val_auc = {name: round(float(roc_auc_score(ytr[v:], m.fit(Xtr.iloc[:v], ytr[:v]).predict_proba(Xtr.iloc[v:])[:, 1])), 3)
               for name, m in models.items()}
    best = max(val_auc, key=val_auc.get)
    results = {}
    for name, m in models.items():
        p = m.fit(Xtr, ytr).predict_proba(Xte)[:, 1]
        results[name] = {"roc_auc": round(float(roc_auc_score(yte, p)), 3),
                         "pr_auc": round(float(average_precision_score(yte, p)), 3),
                         "brier": round(float(brier_score_loss(yte, p)), 4)}
    model = models[best]
    p = model.predict_proba(Xte)[:, 1]
    base_p = Xte["prior_no_show_rate"].values  # baseline: patient's own past no-show rate
    flagged = p >= HIGH
    report = {
        "model_type": best,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "evaluation": "chronological split; model chosen on validation, newest 20% of appointments held out for test",
        **source, "test_rows": int(len(yte)),
        "no_show_rate": round(float(y.mean()), 3),
        **results[best],
        "baseline": {"name": "patient's own past no-show rate",
                     "roc_auc": round(float(roc_auc_score(yte, base_p)), 3),
                     "pr_auc": round(float(average_precision_score(yte, base_p)), 3)},
        "validation_roc_auc": val_auc,
        "all_models_test": results,
        "high_risk_threshold": HIGH,
        "high_risk_share": round(float(flagged.mean()), 3),
        "high_risk_precision": round(float(precision_score(yte, flagged, zero_division=0)), 3),
        "high_risk_recall": round(float(recall_score(yte, flagged)), 3),
        "fairness_note": "Gender is not used as an input. Age is used only in broad bands.",
        "data_notice": "Trained on synthetic data unless live_rows > 0.",
    }
    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(model, MODEL_PATH, compress=3)
    METRICS_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def reasons(f: pd.Series):
    out = []
    if f["prior_no_shows"] > 0:
        out.append(f"missed {int(f['prior_no_shows'])} of {int(f['prior_appointments'])} previous visits")
    if f["lead_time_days"] >= 10:
        out.append(f"booked {int(f['lead_time_days'])} days in advance")
    if f["first_visit"]:
        out.append("first visit")
    if f["is_afternoon"]:
        out.append("afternoon slot")
    if f["is_monsoon"]:
        out.append("monsoon season")
    return out[:3]


try:
    _model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None
except Exception as e:
    print(f"[noshow] could not load model ({e}); run python noshow.py")
    _model = None


def predict(rows):
    if _model is None:
        raise RuntimeError("No-show model not trained. Run python noshow.py")
    X = build_features(rows)
    probs = _model.predict_proba(X)[:, 1]
    res = []
    for r, p, (_, f) in zip(rows, probs, X.iterrows()):
        risk = "High" if p >= HIGH else "Medium" if p >= MEDIUM else "Low"
        res.append({"id": r.get("id"), "probability": round(float(p), 3), "risk": risk, "reasons": reasons(f)})
    return res


if __name__ == "__main__":
    train()
