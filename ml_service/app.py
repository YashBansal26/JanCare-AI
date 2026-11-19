from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Optional
import json
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from features import FEATURES, SLOTS, HOLIDAYS, calendar_features
from triage import triage
import noshow
import triage as triage_module
import embeddings
import waittime
import surge
import assistant
import labreport

BASE_DIR = Path(__file__).resolve().parent
MODELS = BASE_DIR / "models"
MODEL_PATH = MODELS / "crowd_model.pkl"
ENCODER_PATH = MODELS / "dept_encoder.pkl"
HISTORY_PATH = MODELS / "recent_history.csv"
app = FastAPI(title="JanCare AI Service", version="2.0.0",
              description="OPD crowd forecasting, symptom triage and no-show risk prediction.")
try:
    model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None
    encoder = joblib.load(ENCODER_PATH) if ENCODER_PATH.exists() else None
except Exception as e:
    print(f"[crowd] could not load model ({e}); run python train_model.py")
    model = encoder = None
history = pd.read_csv(HISTORY_PATH, parse_dates=["date"]) if HISTORY_PATH.exists() else None


def read_json(name):
    p = MODELS / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


class PredictionRequest(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    department: str = Field(min_length=2, max_length=80)


def severity(count: int):
    if count < 35:
        return "Green", "Lower crowd"
    if count < 60:
        return "Yellow", "Moderate crowd"
    return "Red", "High predicted crowd"


def history_features(d: date, department: str, hour: int):
    """Lag features from the most recent known history (no future data)."""
    if history is None:
        return 30.0, 30.0
    h = history[(history["department"] == department) & (history["hour"] == hour)]
    ref = min(pd.Timestamp(d), h["date"].max() + pd.Timedelta(days=1)) if len(h) else pd.Timestamp(d)
    window = h[(h["date"] < ref) & (h["date"] >= ref - pd.Timedelta(days=28))]
    recent = float(window["patient_count"].mean()) if len(window) else float(h["patient_count"].mean() if len(h) else 30)
    week = h[h["date"] == pd.Timestamp(d) - pd.Timedelta(days=7)]
    last_week = float(week["patient_count"].iloc[0]) if len(week) else recent
    return recent, last_week


def explain(f: dict, department: str, d: date):
    """Plain-language drivers for a slot forecast (for patients and staff)."""
    why = []
    if f["is_holiday"]:
        why.append("holiday / Sunday - reduced OPD")
    if f["is_after_holiday"] and (d - timedelta(days=1)).isoformat() in HOLIDAYS:
        why.append("day after a public holiday - pent-up demand")
    if f["is_monsoon"] and department in ("General Medicine", "Pediatrics"):
        why.append("monsoon season: fever cases rise")
    if f["is_winter"] and department in ("Cardiology", "Pediatrics", "General Medicine"):
        why.append("winter season: higher load")
    if f["same_slot_last_week"] > f["recent_level"] * 1.2:
        why.append("this slot was busier than usual last week")
    if f["day_of_week"] == 0 and not f["is_holiday"]:
        why.append("Mondays are usually the busiest")
    if f["hour"] in (9, 10, 11):
        why.append("peak morning hour")
    if f["hour"] >= 14:
        why.append("afternoons are usually quieter")
    return why[:3]


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None and encoder is not None,
            "noshow_model_loaded": noshow._model is not None,
            "triage_model": triage_module.MODEL_TYPE, "deep_learning": embeddings.status(),
            "data_notice": "Bundled datasets are synthetic demo data.",
            "metrics": read_json("metrics.json")}


@app.get("/ai/metrics")
def ai_metrics():
    """All model evaluation results, for the staff AI dashboard."""
    return {"crowd": read_json("metrics.json"), "triage": read_json("triage_metrics.json"),
            "noshow": read_json("noshow_metrics.json"), "waittime": read_json("waittime_metrics.json"),
            "assistant": read_json("assistant_metrics.json"),
            "live": {"triage_model": triage_module.MODEL_TYPE, "assistant_model": assistant._model.description,
                     "deep_learning": embeddings.status()}}


@app.post("/predict")
def predict_crowd(request: PredictionRequest):
    if model is None or encoder is None:
        raise HTTPException(status_code=503, detail="Model is not available. Run python train_model.py in ml_service first.")
    try:
        req_date = datetime.strptime(request.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")
    if request.department not in set(encoder.classes_):
        raise HTTPException(status_code=400, detail="Unknown department. Choose a supported OPD department.")
    dept_code = int(encoder.transform([request.department])[0])
    rows = []
    for hour in SLOTS:
        f = calendar_features(req_date, hour, dept_code)
        f["recent_level"], f["same_slot_last_week"] = history_features(req_date, request.department, hour)
        rows.append(f)
    X = pd.DataFrame(rows)[FEATURES]
    preds = model.predict(X)
    results = []
    for f, p in zip(rows, preds):
        count = max(0, int(round(float(p))))
        color, label = severity(count)
        results.append({"time_slot": f"{f['hour']:02d}:00 - {f['hour']+1:02d}:00", "predicted_patients": count,
                        "severity_color": color, "severity_label": label,
                        "why": explain(f, request.department, req_date)})
    metrics = read_json("metrics.json") or {}
    return {"date": request.date, "department": request.department, "predictions": results,
            "model_type": metrics.get("model_type", type(model).__name__),
            "data_notice": "Predictions are a demonstration using synthetic training data."}


class TriageRequest(BaseModel):
    text: str = Field(default="", max_length=500)
    pain: int = Field(default=0, ge=0, le=10)


@app.post("/triage")
def triage_endpoint(request: TriageRequest):
    return triage(request.text, request.pain)


class NoShowItem(BaseModel):
    id: Optional[str] = None
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    hour: int = Field(ge=0, le=23)
    department: str
    age: Optional[float] = None
    lead_time_days: float = Field(default=0, ge=0)
    prior_appointments: int = Field(default=0, ge=0)
    prior_no_shows: int = Field(default=0, ge=0)


class NoShowRequest(BaseModel):
    appointments: List[NoShowItem] = Field(max_length=500)


@app.post("/no-show")
def no_show_endpoint(request: NoShowRequest):
    if not request.appointments:
        return {"predictions": []}
    try:
        return {"predictions": noshow.predict([a.model_dump() for a in request.appointments])}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


class WaitAhead(BaseModel):
    age: Optional[float] = None
    first_visit: int = 0


class WaitRequest(BaseModel):
    department: str
    hour: int = Field(ge=0, le=23)
    ahead: List[WaitAhead] = Field(default_factory=list, max_length=300)
    doctor_on_break: bool = False


@app.post("/wait-time")
def wait_time_endpoint(request: WaitRequest):
    return waittime.predict(request.department, request.hour, [a.model_dump() for a in request.ahead], request.doctor_on_break)


class SurgeRequest(BaseModel):
    series: dict  # {name: [{"date": "YYYY-MM-DD", "count": n}]}


@app.post("/surge")
def surge_endpoint(request: SurgeRequest):
    return {"alerts": surge.detect(request.series)}


class TextRequest(BaseModel):
    text: str = Field(default="", max_length=500)


@app.post("/symptom-group")
def symptom_group_endpoint(request: TextRequest):
    return {"group": surge.symptom_group(request.text)}


@app.post("/assistant")
def assistant_endpoint(request: TextRequest):
    return assistant.understand(request.text)


class LabAnalyzeRequest(BaseModel):
    text: str = Field(default="", max_length=5000)
    mimeType: str = ""
    dataBase64: str = Field(default="", max_length=8_000_000)
    sex: str = ""
    age: Optional[float] = None


@app.post("/lab/analyze")
def lab_analyze_endpoint(request: LabAnalyzeRequest):
    """Read a lab report (PDF text / OCR / typed) and flag values outside reference ranges."""
    return labreport.analyze(request.text, request.mimeType, request.dataBase64, request.sex, request.age)
