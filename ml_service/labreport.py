"""Lab report explainer for JanCare.

1. Read the report: digital PDFs -> text layer (pypdf); photos / scanned
   pages -> OCR with RapidOCR (PaddleOCR models in ONNX format, bundled with
   the pip package, runs fully offline on CPU). Typed text (e.g. the result
   summary staff enter) is also accepted.
2. Find common test values (Hb, sugar, HbA1c, lipids, TSH, kidney, liver,
   vitamins...) with name aliases and unit normalisation.
3. Compare each with an adult reference range (sex-specific where it matters)
   and explain abnormal values in plain English and Hindi.

This is a reading aid, not a diagnosis: ranges differ between labs, and the
doctor interprets the report. The lab's own printed range is not parsed yet.
"""
import base64
import io
import re

# ---------------------------------------------------------------- reference table
# key: (display name, unit, aliases regex, {"M": (low, high), "F": (...)} or (low, high),
#       explain_low_en, explain_high_en, explain_low_hi, explain_high_hi)
TESTS = [
    ("hba1c", "HbA1c", "%", r"hba1c|glycated\s*ha?emoglobin|glycosylated", (4.0, 5.6),
     "", "Average sugar over 3 months is high (5.7-6.4 = prediabetes, 6.5+ = diabetes range).",
     "", "पिछले 3 महीनों की औसत शुगर ज़्यादा है (5.7-6.4 प्री-डायबिटीज़, 6.5+ डायबिटीज़ की सीमा)।"),
    ("hb", "Haemoglobin", "g/dL", r"\bh(?:a)?emoglobin\b|\bhb\b(?!\s*a1c)|\bhgb\b", {"M": (13.0, 17.0), "F": (12.0, 15.0), "C": (11.0, 14.0)},
     "Low haemoglobin can mean anaemia - it may cause tiredness and breathlessness.", "Haemoglobin is above the usual range.",
     "हीमोग्लोबिन कम है - यह खून की कमी (एनीमिया) हो सकती है, जिससे थकान और सांस फूलना हो सकता है।", "हीमोग्लोबिन सामान्य से ज़्यादा है।"),
    ("wbc", "White blood cells (TLC)", "/µL", r"\bwbc\b|\btlc\b|total\s*leu[ck]ocyte|white\s*blood\s*cell|total\s*wbc", (4000, 11000),
     "White cells are low - immunity may be reduced.", "White cells are high - often seen with infection or inflammation.",
     "सफेद रक्त कोशिकाएं कम हैं - रोग प्रतिरोधक क्षमता कम हो सकती है।", "सफेद रक्त कोशिकाएं ज़्यादा हैं - अक्सर संक्रमण या सूजन में होता है।"),
    ("plt", "Platelets", "/µL", r"platelet|\bplt\b", (150000, 410000),
     "Platelets are low - in fever this can be a sign of dengue; follow the doctor's advice closely.", "Platelets are above the usual range.",
     "प्लेटलेट्स कम हैं - बुखार में यह डेंगू का संकेत हो सकता है; डॉक्टर की सलाह ध्यान से मानें।", "प्लेटलेट्स सामान्य से ज़्यादा हैं।"),
    ("rbc", "Red blood cells", "million/µL", r"\brbc\b|red\s*blood\s*cell|erythrocyte\s*count", {"M": (4.5, 5.5), "F": (3.8, 4.8), "C": (4.0, 5.2)},
     "Red cell count is low.", "Red cell count is high.", "लाल रक्त कोशिकाएं कम हैं।", "लाल रक्त कोशिकाएं ज़्यादा हैं।"),
    ("esr", "ESR", "mm/hr", r"\besr\b|erythrocyte\s*sedimentation", {"M": (0, 15), "F": (0, 20), "C": (0, 10)},
     "", "ESR is raised - a general sign of inflammation or infection.", "", "ईएसआर बढ़ा है - यह सूजन या संक्रमण का सामान्य संकेत है।"),
    ("fbs", "Blood sugar (fasting)", "mg/dL", r"fasting|\bfbs\b|\bfbg\b|glucose\s*\(?f", (70, 99),
     "Fasting sugar is low.", "Fasting sugar is high (100-125 = prediabetes, 126+ = diabetes range).",
     "खाली पेट शुगर कम है।", "खाली पेट शुगर ज़्यादा है (100-125 प्री-डायबिटीज़, 126+ डायबिटीज़ की सीमा)।"),
    ("ppbs", "Blood sugar (after food)", "mg/dL", r"post\s*prandial|\bppbs\b|\bpp\b|after\s*food|2\s*h(?:ou)?r", (70, 139),
     "Sugar after food is low.", "Sugar after food is high (140-199 = prediabetes, 200+ = diabetes range).",
     "खाने के बाद शुगर कम है।", "खाने के बाद शुगर ज़्यादा है (140-199 प्री-डायबिटीज़, 200+ डायबिटीज़ की सीमा)।"),
    ("rbs", "Blood sugar (random)", "mg/dL", r"random|\brbs\b|blood\s*glucose|blood\s*sugar|\bglucose\b", (70, 140),
     "Random sugar is low.", "Random sugar is high - a fasting test or HbA1c can confirm.",
     "रैंडम शुगर कम है।", "रैंडम शुगर ज़्यादा है - खाली पेट जांच या HbA1c से पुष्टि होती है।"),
    ("ldl", "LDL cholesterol", "mg/dL", r"\bldl\b", (0, 129),
     "", "LDL ('bad' cholesterol) is high - raises heart risk over time.", "", "एलडीएल ('खराब' कोलेस्ट्रॉल) ज़्यादा है - इससे दिल का खतरा बढ़ता है।"),
    ("hdl", "HDL cholesterol", "mg/dL", r"\bhdl\b", {"M": (40, 200), "F": (50, 200), "C": (40, 200)},
     "HDL ('good' cholesterol) is low - exercise usually helps.", "", "एचडीएल ('अच्छा' कोलेस्ट्रॉल) कम है - व्यायाम से अक्सर बढ़ता है।", ""),
    ("tg", "Triglycerides", "mg/dL", r"triglyceride|\btg\b", (0, 149),
     "", "Triglycerides are high - linked to diet, sugar and alcohol.", "", "ट्राइग्लिसराइड ज़्यादा है - खान-पान, मीठा और शराब से जुड़ा है।"),
    ("chol", "Total cholesterol", "mg/dL", r"total\s*cholesterol|\bcholesterol\b|\bs\.?\s*cholesterol", (0, 199),
     "", "Total cholesterol is high.", "", "कुल कोलेस्ट्रॉल ज़्यादा है।"),
    ("tsh", "TSH", "µIU/mL", r"\btsh\b|thyroid\s*stimulating", (0.4, 4.0),
     "Low TSH can mean an overactive thyroid.", "High TSH can mean an underactive thyroid (hypothyroidism).",
     "टीएसएच कम है - थायराइड ज़्यादा सक्रिय हो सकता है।", "टीएसएच ज़्यादा है - थायराइड कम सक्रिय (हाइपोथायरायडिज़्म) हो सकता है।"),
    ("creat", "Creatinine", "mg/dL", r"creatinine", {"M": (0.7, 1.3), "F": (0.6, 1.1), "C": (0.3, 0.7)},
     "", "Creatinine is high - kidney function needs checking.", "", "क्रिएटिनिन ज़्यादा है - किडनी की जांच ज़रूरी है।"),
    ("urea", "Blood urea", "mg/dL", r"\burea\b|\bbun\b", (15, 40),
     "", "Urea is high - can be due to kidney problems or dehydration.", "", "यूरिया ज़्यादा है - किडनी की समस्या या पानी की कमी से हो सकता है।"),
    ("uric", "Uric acid", "mg/dL", r"uric\s*acid", {"M": (3.4, 7.0), "F": (2.4, 6.0), "C": (2.0, 5.5)},
     "", "Uric acid is high - linked to gout (joint pain).", "", "यूरिक एसिड ज़्यादा है - गठिया (जोड़ों के दर्द) से जुड़ा है।"),
    ("alt", "SGPT / ALT", "U/L", r"sgpt|\balt\b|alanine", (7, 56),
     "", "SGPT (liver enzyme) is raised.", "", "एसजीपीटी (लिवर एंजाइम) बढ़ा है।"),
    ("ast", "SGOT / AST", "U/L", r"sgot|\bast\b|aspartate", (8, 48),
     "", "SGOT (liver enzyme) is raised.", "", "एसजीओटी (लिवर एंजाइम) बढ़ा है।"),
    ("bili", "Bilirubin (total)", "mg/dL", r"bilirubin", (0.1, 1.2),
     "", "Bilirubin is high - can cause jaundice (yellow eyes/skin).", "", "बिलीरुबिन ज़्यादा है - इससे पीलिया हो सकता है।"),
    ("vitd", "Vitamin D", "ng/mL", r"vitamin\s*d|25\s*-?\s*oh|\bvit\.?\s*d\b", (30, 100),
     "Vitamin D is low (20-29 insufficient, under 20 deficient) - sunlight and supplements help.", "Vitamin D is above the usual range.",
     "विटामिन डी कम है (20-29 अपर्याप्त, 20 से कम कमी) - धूप और सप्लीमेंट से मदद मिलती है।", "विटामिन डी सामान्य से ज़्यादा है।"),
    ("b12", "Vitamin B12", "pg/mL", r"b\s*-?\s*12|cobalamin", (200, 900),
     "Vitamin B12 is low - can cause tingling, weakness and anaemia.", "Vitamin B12 is above the usual range.",
     "विटामिन बी12 कम है - इससे झनझनाहट, कमज़ोरी और खून की कमी हो सकती है।", "विटामिन बी12 सामान्य से ज़्यादा है।"),
    ("na", "Sodium", "mmol/L", r"sodium|\bna\b\+?", (135, 145),
     "Sodium is low.", "Sodium is high.", "सोडियम कम है।", "सोडियम ज़्यादा है।"),
    ("k", "Potassium", "mmol/L", r"potassium|\bk\b\+?", (3.5, 5.1),
     "Potassium is low - can affect muscles and heart rhythm.", "Potassium is high - can affect heart rhythm.",
     "पोटैशियम कम है - मांसपेशियों और दिल की धड़कन पर असर हो सकता है।", "पोटैशियम ज़्यादा है - दिल की धड़कन पर असर हो सकता है।"),
    ("ca", "Calcium", "mg/dL", r"calcium", (8.5, 10.5),
     "Calcium is low.", "Calcium is high.", "कैल्शियम कम है।", "कैल्शियम ज़्यादा है।"),
]
COMPILED = [(t, re.compile(t[3], re.I)) for t in TESTS]
NAME_HI = {"hba1c": "HbA1c", "hb": "हीमोग्लोबिन", "wbc": "सफेद रक्त कोशिकाएं", "plt": "प्लेटलेट्स", "rbc": "लाल रक्त कोशिकाएं",
           "esr": "ईएसआर", "fbs": "खाली पेट शुगर", "ppbs": "खाने के बाद शुगर", "rbs": "रैंडम शुगर", "ldl": "एलडीएल",
           "hdl": "एचडीएल", "tg": "ट्राइग्लिसराइड", "chol": "कुल कोलेस्ट्रॉल", "tsh": "टीएसएच", "creat": "क्रिएटिनिन",
           "urea": "यूरिया", "uric": "यूरिक एसिड", "alt": "एसजीपीटी", "ast": "एसजीओटी", "bili": "बिलीरुबिन",
           "vitd": "विटामिन डी", "b12": "विटामिन बी12", "na": "सोडियम", "k": "पोटैशियम", "ca": "कैल्शियम"}
NUM = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(lakh|lac|lakhs|thousand|k)\b)?", re.I)


def _group(sex, age):
    if age is not None and age < 12:
        return "C"
    return "F" if str(sex or "").lower().startswith("f") else "M"


def _normalise(key, value, word):
    """Convert common Indian report styles to the unit used in the table."""
    word = (word or "").lower()
    if word in ("lakh", "lac", "lakhs"):
        value *= 100000
    elif word in ("thousand", "k"):
        value *= 1000
    if key == "plt" and value < 1000:      # reported as x10^3/µL, or lakhs (e.g. 1.5)
        value *= 100000 if value < 10 else 1000
    if key == "wbc" and value < 100:       # reported as x10^3/µL
        value *= 1000
    return value


def extract_text(mime_type, data: bytes) -> tuple[str, str]:
    """Returns (text, method)."""
    if mime_type == "application/pdf":
        try:
            from pypdf import PdfReader
            text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages[:5])
            if len(text.strip()) > 20:
                return text, "pdf-text"
        except Exception:
            pass
        return "", "pdf-no-text"  # scanned PDF: would need page rendering for OCR
    if mime_type.startswith("image/"):
        try:
            from rapidocr_onnxruntime import RapidOCR
        except Exception:
            return "", "ocr-not-installed"
        global _ocr
        try:
            _ocr
        except NameError:
            _ocr = RapidOCR()
        result, _ = _ocr(data)
        if not result:
            return "", "ocr-empty"
        # group detected boxes into lines by vertical position
        items = sorted(((min(p[1] for p in box), min(p[0] for p in box), text) for box, text, _s in result))
        lines, current, last_y = [], [], None
        for y, x, text in items:
            if last_y is not None and abs(y - last_y) > 12:
                lines.append(" ".join(t for _, t in sorted(current)))
                current = []
            current.append((x, text))
            last_y = y if last_y is None or abs(y - last_y) > 12 else last_y
        if current:
            lines.append(" ".join(t for _, t in sorted(current)))
        return "\n".join(lines), "ocr"
    return "", "unsupported"


def find_values(text: str):
    found, used = {}, set()
    for line in re.split(r"[\n;]|,\s(?=[A-Za-z])", text or ""):
        line = line.strip()
        if not line:
            continue
        for t, rx in COMPILED:
            key = t[0]
            if key in found:
                continue
            m = rx.search(line)
            if not m:
                continue
            nm = NUM.search(line, m.end())
            if not nm:
                continue
            raw = float(nm.group(1).replace(",", ""))
            found[key] = (t, _normalise(key, raw, nm.group(2)), nm.group(0).strip())
            used.add(key)
            break  # one test per line
    return found


def analyze(text: str = "", mime_type: str = "", data_b64: str = "", sex: str = "", age=None):
    method = "typed-text" if text else "none"
    extracted = text or ""
    if data_b64:
        file_text, method_file = extract_text(mime_type, base64.b64decode(data_b64))
        extracted = (file_text + "\n" + (text or "")).strip()
        method = method_file if file_text else (method if text else method_file)
    group = _group(sex, age)
    values = []
    for key, (t, value, shown) in find_values(extracted).items():
        _, name, unit, _, rng, lo_en, hi_en, lo_hi, hi_hi = t
        low, high = rng[group] if isinstance(rng, dict) else rng
        status = "low" if value < low else "high" if value > high else "normal"
        values.append({
            "key": key, "test": name, "test_hi": NAME_HI.get(key, name), "value": round(value, 2), "as_printed": shown, "unit": unit,
            "low": low, "high": high, "status": status,
            "explain_en": lo_en if status == "low" else hi_en if status == "high" else "Within the usual range.",
            "explain_hi": lo_hi if status == "low" else hi_hi if status == "high" else "सामान्य सीमा में है।",
        })
    order = [t[0] for t in TESTS]
    values.sort(key=lambda v: (v["status"] == "normal", order.index(v["key"])))
    abnormal = [v for v in values if v["status"] != "normal"]
    if not values:
        en = "No recognised test values were found in this report."
        hi = "इस रिपोर्ट में कोई पहचाने जाने वाले जांच मान नहीं मिले।"
    elif not abnormal:
        en = f"All {len(values)} recognised values are within the usual range."
        hi = f"पहचाने गए सभी {len(values)} मान सामान्य सीमा में हैं।"
    else:
        en = f"{len(abnormal)} of {len(values)} values are outside the usual range: " + ", ".join(f"{v['test']} {v['status']}" for v in abnormal) + "."
        hi = f"{len(values)} में से {len(abnormal)} मान सामान्य सीमा से बाहर हैं: " + ", ".join(f"{v['test_hi']} ({'कम' if v['status'] == 'low' else 'ज़्यादा'})" for v in abnormal) + "।"
    return {"method": method, "chars_read": len(extracted), "values": values, "abnormal_count": len(abnormal),
            "summary_en": en, "summary_hi": hi, "range_group": {"M": "adult male", "F": "adult female", "C": "child"}[group],
            "disclaimer": "Reading aid only. Reference ranges vary by lab; your doctor will interpret this report."}
