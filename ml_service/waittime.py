"""Wait-time prediction for JanCare queues.

Instead of "people ahead x 8 minutes", predicts each consultation's duration
from department, hour, patient age band and first-visit flag, then sums over
the patients ahead. A second (quantile) model gives a realistic upper estimate,
shown as a range ("15-25 min").

  python waittime.py     # train + evaluate -> models/waittime_model.pkl, waittime_metrics.json
Real data: Staff dashboard -> AI -> Export consult data -> data/live_consults.csv
(columns: department,hour,age,first_visit,duration_min).
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error
from features import DEPARTMENTS, SLOTS

BASE = Path(__file__).resolve().parent
MODEL_PATH = BASE / "models" / "waittime_model.pkl"
METRICS_PATH = BASE / "models" / "waittime_metrics.json"
LIVE_PATH = BASE / "data" / "live_consults.csv"
FIXED_MINUTES = 8  # the old rule
FEATURES = ["hour", "age_band", "first_visit", *[f"dept_{d.replace(' ', '_')}" for d in DEPARTMENTS]]
DEPT_MEAN = {"General Medicine": 6, "Pediatrics": 8, "Orthopedics": 9, "Cardiology": 12, "Dermatology": 6, "Neurology": 13}


def age_band(age):
    a = float(age if age is not None else 35)
    return 0 if a < 12 else 1 if a < 40 else 2 if a < 60 else 3


def build(rows):
    out = []
    for r in rows:
        f = {"hour": int(r.get("hour", 10)), "age_band": age_band(r.get("age")), "first_visit": int(bool(r.get("first_visit", 0)))}
        for d in DEPARTMENTS:
            f[f"dept_{d.replace(' ', '_')}"] = int(r.get("department") == d)
        out.append(f)
    return pd.DataFrame(out, columns=FEATURES)


def generate(n=30000, seed=11):
    rng = np.random.default_rng(seed)
    rows = []
    for _ in range(n):
        dept = str(rng.choice(DEPARTMENTS))
        hour = int(rng.choice(SLOTS))
        age = int(np.clip(rng.normal(40, 20), 1, 90))
        first = int(rng.random() < 0.35)
        mean = DEPT_MEAN[dept] * (1.35 if first else 1.0) * (1.25 if age >= 60 else 1.0)
        mean *= 0.85 if hour in (9, 10, 11) else 1.0  # doctors speed up at peak hours
        rows.append({"department": dept, "hour": hour, "age": age, "first_visit": first,
                     "duration_min": round(float(rng.gamma(4, mean / 4)), 1)})
    return pd.DataFrame(rows)


def train():
    df = generate()
    live = 0
    if LIVE_PATH.exists():
        l = pd.read_csv(LIVE_PATH)
        live = len(l)
        df = pd.concat([df, l], ignore_index=True)
    df = df[(df.duration_min > 0) & (df.duration_min < 120)].sample(frac=1, random_state=0).reset_index(drop=True)
    X, y = build(df.to_dict("records")), df["duration_min"].values
    cut = int(len(df) * 0.8)
    mean_m = GradientBoostingRegressor(n_estimators=200, max_depth=3, random_state=0).fit(X[:cut], y[:cut])
    p90_m = GradientBoostingRegressor(loss="quantile", alpha=0.8, n_estimators=200, max_depth=3, random_state=0).fit(X[:cut], y[:cut])

    # Evaluate the thing patients see: total wait for a queue of 1-15 people
    rng = np.random.default_rng(1)
    te = df.iloc[cut:].reset_index(drop=True)
    pt = mean_m.predict(X[cut:])
    errs_model, errs_fixed = [], []
    for _ in range(3000):
        k = int(rng.integers(1, 16))
        idx = rng.choice(len(te), k, replace=False)
        true = te.duration_min.values[idx].sum()
        pred = pt[idx].sum()
        errs_model.append(abs(true - pred))
        errs_fixed.append(abs(true - FIXED_MINUTES * k))
    report = {
        "model_type": "GradientBoostingRegressor (mean) + quantile model (80th percentile)",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "synthetic_rows": int(len(df) - live), "live_rows": int(live),
        "consult_mae_min": round(float(mean_absolute_error(y[cut:], pt)), 2),
        "consult_mae_fixed_8min": round(float(mean_absolute_error(y[cut:], np.full(len(pt), FIXED_MINUTES))), 2),
        "queue_wait_mae_min": round(float(np.mean(errs_model)), 1),
        "queue_wait_mae_fixed_8min": round(float(np.mean(errs_fixed)), 1),
        "improvement_over_fixed_pct": round(100 * (1 - np.mean(errs_model) / np.mean(errs_fixed)), 1),
        "evaluation": "random queues of 1-15 held-out patients",
        "data_notice": "Synthetic consultation durations unless live_rows > 0.",
    }
    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump({"mean": mean_m, "p80": p90_m}, MODEL_PATH, compress=3)
    METRICS_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


try:
    _models = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None
except Exception as e:  # e.g. saved with another scikit-learn version
    print(f"[waittime] could not load model ({e}); run python waittime.py. Using fixed 8-min rule.")
    _models = None


def predict(department, hour, ahead, doctor_on_break=False):
    """ahead: list of {age, first_visit} for patients before this one."""
    if not ahead:
        return {"minutes": 0, "low": 0, "high": 0, "model": "waittime"}
    if _models is None:
        m = FIXED_MINUTES * len(ahead)
        return {"minutes": m, "low": m, "high": m, "model": "fixed"}
    X = build([{**a, "department": department, "hour": hour} for a in ahead])
    mean = float(_models["mean"].predict(X).sum())
    high = float(_models["p80"].predict(X).sum())
    spread = (high - mean) / np.sqrt(len(ahead))  # individual delays partly cancel out
    extra = 15 if doctor_on_break else 0
    return {"minutes": round(mean + extra), "low": max(0, round(mean - spread * 0.6 + extra)),
            "high": round(mean + spread + extra), "model": "waittime"}


if __name__ == "__main__":
    train()
