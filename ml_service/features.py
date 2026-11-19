"""Shared feature engineering for the JanCare crowd model.

Used by generate_data.py, train_model.py and app.py so that training and
serving build exactly the same features.
"""
from datetime import date, timedelta
import math

DEPARTMENTS = ["Orthopedics", "Pediatrics", "Cardiology", "Dermatology", "Neurology", "General Medicine"]
SLOTS = [8, 9, 10, 11, 12, 14, 15, 16]  # 13:00 is the lunch break

# Major Indian public / festival holidays (approximate dates for lunar festivals).
# Replace with the hospital's official holiday calendar before real use.
HOLIDAYS = {
    # 2024
    "2024-11-01", "2024-11-15", "2024-12-25",
    # 2025
    "2025-01-26", "2025-03-14", "2025-03-31", "2025-04-18", "2025-06-07", "2025-08-15",
    "2025-08-16", "2025-10-02", "2025-10-20", "2025-11-05", "2025-12-25",
    # 2026
    "2026-01-26", "2026-03-04", "2026-03-20", "2026-04-03", "2026-05-27", "2026-08-15",
    "2026-09-04", "2026-10-02", "2026-10-20", "2026-11-08", "2026-11-24", "2026-12-25",
    # 2027
    "2027-01-26", "2027-03-10", "2027-03-22", "2027-03-26", "2027-08-15", "2027-10-02",
    "2027-10-29", "2027-12-25",
}


def as_date(d):
    return d if isinstance(d, date) else date.fromisoformat(str(d)[:10])


def is_holiday(d) -> int:
    d = as_date(d)
    return int(d.isoformat() in HOLIDAYS or d.weekday() == 6)  # Sundays: reduced OPD


def is_after_holiday(d) -> int:
    """First working day after a holiday/Sunday: patients who waited come in together."""
    d = as_date(d)
    return int(not is_holiday(d) and is_holiday(d - timedelta(days=1)))


def days_to_next_holiday(d, horizon=7) -> int:
    d = as_date(d)
    for k in range(1, horizon + 1):
        if (d + timedelta(days=k)).isoformat() in HOLIDAYS:
            return k
    return horizon + 1


def season(month: int) -> str:
    if month in (12, 1, 2):
        return "winter"
    if month in (3, 4, 5, 6):
        return "summer"
    if month in (7, 8, 9):
        return "monsoon"
    return "post_monsoon"


FEATURES = [
    "day_of_week", "hour", "department_encoded", "month", "doy_sin", "doy_cos",
    "is_holiday", "is_after_holiday", "days_to_next_holiday", "is_monsoon", "is_winter",
    "recent_level", "same_slot_last_week",
]


def calendar_features(d, hour: int, dept_code: int) -> dict:
    d = as_date(d)
    doy = d.timetuple().tm_yday
    s = season(d.month)
    return {
        "day_of_week": d.weekday(),
        "hour": hour,
        "department_encoded": dept_code,
        "month": d.month,
        "doy_sin": math.sin(2 * math.pi * doy / 365.25),
        "doy_cos": math.cos(2 * math.pi * doy / 365.25),
        "is_holiday": is_holiday(d),
        "is_after_holiday": is_after_holiday(d),
        "days_to_next_holiday": days_to_next_holiday(d),
        "is_monsoon": int(s == "monsoon"),
        "is_winter": int(s == "winter"),
    }


def add_history_features(df):
    """Add lag features computed only from data strictly before each row's date.

    recent_level        mean patients for this dept+hour over the previous 28 days
    same_slot_last_week patients in the same dept+hour exactly 7 days earlier
    Both are what a hospital actually knows the day before, so there is no leakage.
    """
    import pandas as pd
    df = df.sort_values(["department", "hour", "date"]).copy()
    df["date"] = pd.to_datetime(df["date"])
    out = []
    for _, g in df.groupby(["department", "hour"], sort=False):
        g = g.set_index("date").sort_index()
        s = g["patient_count"].astype(float)
        g["recent_level"] = s.shift(1).rolling("28D", min_periods=1).mean()
        lag = s.copy()
        lag.index = lag.index + pd.Timedelta(days=7)
        g["same_slot_last_week"] = lag.reindex(g.index)
        out.append(g.reset_index())
    res = pd.concat(out, ignore_index=True)
    # fall back sensibly when history is missing (first weeks / after a gap)
    res["recent_level"] = res["recent_level"].fillna(res.groupby(["department", "hour"])["patient_count"].transform("mean"))
    res["same_slot_last_week"] = res["same_slot_last_week"].fillna(res["recent_level"])
    return res.sort_values("date").reset_index(drop=True)
