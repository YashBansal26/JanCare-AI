"""Surge / outbreak early-warning for JanCare.

Input: daily counts per series (a department's bookings, or a symptom group
such as "fever" from the AI triage log). For the latest days we ask: how
unlikely is this count if nothing unusual were happening? The expected level
is the median of the previous 14 days (robust to past spikes), adjusted for
weekday. A Poisson tail probability < 1% with a meaningful rise -> alert.
This is the same idea public-health systems use for syndromic surveillance
(e.g. CDC EARS), in a very simplified form.
"""
from datetime import date
import math
import statistics

SYMPTOM_GROUPS = {
    "fever": ["fever", "bukhar", "बुखार", "dengue", "malaria", "typhoid", "chills"],
    "diarrhoea / vomiting": ["diarrh", "loose motion", "dast", "दस्त", "vomit", "ulti", "उल्टी"],
    "breathing / cough": ["cough", "khansi", "खांसी", "breath", "saans", "सांस", "wheez"],
    "skin rash": ["rash", "daane", "दाने", "itch", "khujli", "खुजली"],
}


def symptom_group(text):
    t = (text or "").lower()
    for group, words in SYMPTOM_GROUPS.items():
        if any(w in t for w in words):
            return group
    return None


def poisson_sf(k, lam):
    """P(X >= k) for X ~ Poisson(lam)."""
    if k <= 0:
        return 1.0
    term, cdf = math.exp(-lam), 0.0
    for i in range(k):
        cdf += term
        term *= lam / (i + 1)
    return max(0.0, 1.0 - cdf)


def detect(series, recent_days=2, min_count=5, p_threshold=0.01, min_ratio=1.5):
    """series: {name: [{"date": "YYYY-MM-DD", "count": n}, ...]} (missing days = 0)."""
    alerts = []
    for name, points in series.items():
        counts = {p["date"]: int(p["count"]) for p in points}
        if not counts:
            continue
        days = sorted(counts)
        start, end = date.fromisoformat(days[0]), date.fromisoformat(days[-1])
        all_days = [date.fromordinal(o).isoformat() for o in range(start.toordinal(), end.toordinal() + 1)]
        vals = [counts.get(d, 0) for d in all_days]
        for i in range(max(14, len(vals) - recent_days), len(vals)):
            hist = vals[i - 14:i]
            dow = date.fromisoformat(all_days[i]).weekday()
            same_dow = [v for j, v in zip(range(i - 14, i), hist) if date.fromisoformat(all_days[j]).weekday() == dow]
            base = max(1.0, 0.5 * statistics.median(hist) + 0.5 * (statistics.mean(same_dow) if same_dow else statistics.median(hist)))
            k = vals[i]
            p = poisson_sf(k, base)
            if k >= min_count and k >= min_ratio * base and p < p_threshold:
                alerts.append({"series": name, "date": all_days[i], "count": k, "expected": round(base, 1),
                               "ratio": round(k / base, 1), "p_value": float(f"{p:.2g}"),
                               "severity": "High" if p < 0.001 else "Medium",
                               "message": f"{name}: {k} on {all_days[i]} vs about {base:.0f} expected ({k / base:.1f}x)"})
    return sorted(alerts, key=lambda a: a["p_value"])


if __name__ == "__main__":
    import random
    random.seed(0)
    demo = {"fever": [{"date": date.fromordinal(date(2026, 11, 1).toordinal() + i).isoformat(),
                       "count": random.randint(3, 7) + (12 if i >= 17 else 0)} for i in range(19)]}
    print(detect(demo))
