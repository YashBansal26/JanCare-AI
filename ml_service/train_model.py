"""Train and evaluate the JanCare OPD crowd model.

Pipeline
1. Load data/historical_opd.csv (synthetic) and, if present, data/live_opd.csv
   (real counts exported from JanCare bookings: Staff dashboard -> AI -> Export).
   Live rows override synthetic rows for the same date/hour/department.
2. Build calendar + holiday + seasonal + lag features (features.py).
3. Chronological split: train (first 70%) / validation (next 10%) / test (last 20% of dates).
4. Compare two baselines and two ML models, pick the best on validation,
   refit on train+validation, report honest test metrics.

The bundled dataset is synthetic demonstration data, not real hospital records.
"""
from pathlib import Path
from datetime import datetime, timezone
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder
from features import FEATURES, calendar_features, add_history_features

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "historical_opd.csv"
LIVE_PATH = BASE_DIR / "data" / "live_opd.csv"
MODEL_DIR = BASE_DIR / "models"
REQUIRED = {"date", "hour", "department", "patient_count"}


def load_data():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}. Run `python generate_data.py` first.")
    df = pd.read_csv(DATA_PATH)
    sources = {"synthetic_rows": int(len(df)), "live_rows": 0}
    if LIVE_PATH.exists():
        live = pd.read_csv(LIVE_PATH)
        if REQUIRED - set(live.columns):
            raise ValueError(f"live_opd.csv must have columns {sorted(REQUIRED)}")
        sources["live_rows"] = int(len(live))
        df = pd.concat([df, live], ignore_index=True)
        df = df.drop_duplicates(subset=["date", "hour", "department"], keep="last")
    missing = REQUIRED - set(df.columns)
    if missing:
        raise ValueError(f"Dataset is missing columns: {sorted(missing)}")
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=list(REQUIRED))
    return df, sources


def metrics(y, p):
    return {"mae": round(float(mean_absolute_error(y, p)), 3),
            "rmse": round(float(mean_squared_error(y, p) ** 0.5), 3),
            "r2": round(float(r2_score(y, p)), 3)}


def train():
    df, sources = load_data()
    if df["date"].nunique() < 60:
        raise ValueError("Need at least 60 days of data to train and evaluate the model.")
    encoder = LabelEncoder().fit(df["department"].astype(str))
    df["department_encoded"] = encoder.transform(df["department"].astype(str))
    df = add_history_features(df)
    cal = pd.DataFrame([calendar_features(d, int(h), int(c)) for d, h, c in
                        zip(df["date"].dt.date, df["hour"], df["department_encoded"])])
    for col in cal.columns:
        df[col] = cal[col].values
    y = df["patient_count"].astype(float)

    dates = np.sort(df["date"].unique())
    d_val, d_test = dates[int(len(dates) * 0.7)], dates[int(len(dates) * 0.8)]
    tr, va, te = df["date"] < d_val, (df["date"] >= d_val) & (df["date"] < d_test), df["date"] >= d_test

    def lookup_baseline(fit_mask, eval_mask):
        keys = ["day_of_week", "hour", "department_encoded"]
        table = df[fit_mask].groupby(keys)["patient_count"].mean()
        idx = pd.MultiIndex.from_frame(df.loc[eval_mask, keys])
        return table.reindex(idx).fillna(y[fit_mask].mean()).values

    candidates = {
        "RandomForestRegressor": lambda: RandomForestRegressor(n_estimators=120, min_samples_leaf=12, max_depth=16, random_state=42, n_jobs=-1),
        "HistGradientBoostingRegressor": lambda: HistGradientBoostingRegressor(max_iter=500, learning_rate=0.04, min_samples_leaf=40, l2_regularization=1.0, random_state=42),
    }
    val_scores = {}
    for name, make in candidates.items():
        m = make().fit(df.loc[tr, FEATURES], y[tr])
        val_scores[name] = round(float(mean_absolute_error(y[va], m.predict(df.loc[va, FEATURES]))), 3)
    best = min(val_scores, key=val_scores.get)

    fit = tr | va
    model = candidates[best]().fit(df.loc[fit, FEATURES], y[fit])
    pred = model.predict(df.loc[te, FEATURES])
    test_metrics = metrics(y[te], pred)
    lookup = metrics(y[te], lookup_baseline(fit, te))
    naive = metrics(y[te], df.loc[te, "same_slot_last_week"])
    improvement = round(100 * (1 - test_metrics["mae"] / lookup["mae"]), 1)

    sample = df[te].sample(min(3000, int(te.sum())), random_state=0)
    imp = permutation_importance(model, sample[FEATURES], sample["patient_count"], n_repeats=5, random_state=0,
                                 scoring="neg_mean_absolute_error")
    importance = sorted(({"feature": f, "importance": round(float(v), 3)} for f, v in zip(FEATURES, imp.importances_mean)),
                        key=lambda r: -r["importance"])

    report = {
        "model_type": best,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "evaluation": "chronological split: train 70% / validation 10% / test last 20% of dates",
        "data_range": [str(dates[0])[:10], str(dates[-1])[:10]],
        "dataset_rows": int(len(df)), **sources,
        "test_rows": int(te.sum()),
        **test_metrics,
        "baseline_mae": lookup["mae"],
        "baselines": {"day_hour_department_average": lookup, "same_slot_last_week": naive},
        "validation_mae": val_scores,
        "improvement_over_baseline_pct": improvement,
        "feature_importance": importance,
        "data_notice": "Bundled training data is synthetic and must not be treated as real hospital evidence."
              if sources["live_rows"] == 0 else "Mix of synthetic and exported JanCare booking data.",
    }
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_DIR / "crowd_model.pkl", compress=3)
    joblib.dump(encoder, MODEL_DIR / "dept_encoder.pkl")
    # last 35 days of history are needed at serving time for the lag features
    recent = df[df["date"] >= df["date"].max() - pd.Timedelta(days=35)][["date", "hour", "department", "patient_count"]]
    recent.assign(date=recent["date"].dt.strftime("%Y-%m-%d")).to_csv(MODEL_DIR / "recent_history.csv", index=False)
    (MODEL_DIR / "metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "feature_importance"}, indent=2))
    print("Top features:", ", ".join(f"{r['feature']} ({r['importance']})" for r in importance[:5]))


if __name__ == "__main__":
    train()
