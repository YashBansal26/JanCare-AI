"""Generate a realistic *synthetic* OPD time series for JanCare.

Unlike a flat random table, this simulates the patterns real OPDs show, so a
model has something genuine to learn beyond a day/hour/department lookup:

* one row per date x hourly slot x department (a real time series)
* weekday + hourly curves and department base load
* seasonality: monsoon fever/dengue (General Medicine, Pediatrics),
  winter respiratory & cardiac load, summer skin problems
* Indian festival / public holidays (very low turnout) and the surge on the
  first working day after a holiday
* random multi-week outbreak waves (autocorrelated: recent weeks predict next week)
* gradual growth in footfall over time
* Poisson noise

Still SYNTHETIC: replace with de-identified real OPD counts before making claims.
"""
from datetime import date, timedelta
from pathlib import Path
import numpy as np
import pandas as pd
from features import DEPARTMENTS, SLOTS, HOLIDAYS, is_holiday, is_after_holiday

BASE_DIR = Path(__file__).resolve().parent
START, END = date(2024, 11, 1), date(2026, 10, 31)

DEPT_BASE = {"General Medicine": 34, "Pediatrics": 26, "Orthopedics": 22,
             "Cardiology": 18, "Dermatology": 16, "Neurology": 14}
DOW = [1.30, 1.15, 1.00, 0.97, 1.05, 0.85, 0.35]  # Mon..Sun
HOUR = {8: 0.70, 9: 1.25, 10: 1.45, 11: 1.30, 12: 1.00, 14: 0.85, 15: 0.75, 16: 0.60}


def seasonal(dept, month):
    m = 1.0
    if month in (7, 8, 9, 10) and dept in ("General Medicine", "Pediatrics"):
        m *= {7: 1.25, 8: 1.45, 9: 1.50, 10: 1.25}[month]          # monsoon fever / dengue
    if month in (12, 1, 2):
        m *= {"Cardiology": 1.30, "Pediatrics": 1.20, "General Medicine": 1.15, "Orthopedics": 1.10}.get(dept, 1.0)
    if month in (4, 5, 6) and dept == "Dermatology":
        m *= 1.40                                                    # heat rashes / fungal
    return m


def outbreak_series(rng, days):
    """Smooth random waves (AR(1) process) per department."""
    waves = {}
    for dept in DEPARTMENTS:
        x, vals = 0.0, []
        for _ in range(days):
            x = 0.97 * x + rng.normal(0, 0.035)
            vals.append(np.exp(x))
        waves[dept] = vals
    return waves


def generate(seed=42):
    rng = np.random.default_rng(seed)
    days = (END - START).days + 1
    waves = outbreak_series(rng, days)
    rows = []
    for i in range(days):
        d = START + timedelta(days=i)
        hol, after = is_holiday(d), is_after_holiday(d)
        festival = d.isoformat() in HOLIDAYS
        trend = 1 + 0.08 * i / 365  # ~8% yearly growth
        for dept in DEPARTMENTS:
            for h in SLOTS:
                lam = DEPT_BASE[dept] * DOW[d.weekday()] * HOUR[h] * seasonal(dept, d.month) * waves[dept][i] * trend
                if festival:
                    lam *= 0.25
                if after:
                    lam *= 1.35
                rows.append({"date": d.isoformat(), "day_of_week": d.weekday(), "hour": h, "department": dept,
                             "is_holiday": hol, "patient_count": int(rng.poisson(max(lam, 0.5)))})
    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = generate()
    out = BASE_DIR / "data" / "historical_opd.csv"
    out.parent.mkdir(exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Generated {len(df)} rows ({df.date.min()} to {df.date.max()}) at {out}")
