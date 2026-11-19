# JanCare — OPD Appointment & Queue Management (AI Demo)

JanCare is a student demonstration project for outpatient appointment booking and hospital queue management. It includes a React/Vite patient portal, an Express/MongoDB API, and a Python/FastAPI scikit-learn crowd forecasting service.

> **Important demo limitation:** the bundled `ml_service/data/historical_opd.csv` is synthetic. Model metrics describe performance on this generated dataset only; they are not evidence of real hospital performance. Do not use this prototype for clinical decisions or real patient operations.

## AI features

| Model | What it does | Result on held-out data (synthetic demo data) |
|---|---|---|
| **Crowd forecast** (`train_model.py`) | Predicts patients per department and hourly slot using calendar, Indian holidays, season and recent-history (lag) features. Each slot shows plain-language reasons ("monsoon season: fever cases rise"). | MAE about 5.2 vs 8.0 for a day/hour/department average, **about 35% better than the baseline**; R² about 0.89 |
| **Symptom triage** (`triage.py`) | Free-text complaint in English / Hindi / Hinglish → suggested OPD department + 2 alternatives. **Voice input** by microphone (browser speech recognition). | **72% top-1 / 94% top-3** on a blind test set (old model: 69%) |
| **Emergency safety layer** | Red-flag phrases or pain ≥ 8 always override the AI with an Emergency Ward warning. | 100% emergency recall on 22 safety test cases |
| **No-show risk** (`noshow.py`) | Flags upcoming appointments likely to be missed (lead time, past no-shows, slot, season, age band; gender deliberately excluded). Staff can send a reminder. | ROC-AUC 0.63 vs 0.56 for "patient's past no-show rate" |

| **Wait-time prediction** (`waittime.py`) | Predicts each consultation's length (department, hour, age, first visit) and sums over the patients ahead; shows a range like "25–37 min". | Queue wait error 11.0 min vs 17.9 min for the fixed 8-minute rule (**39% better**) |
| **AI patient assistant** (`assistant.py`) | Floating chat (typed or spoken) in English / Hindi / Hinglish: "meri appointment kab hai", "mere aage kitne log hain", "kab kam bheed hoti hai". Answers from the patient's own live data; symptoms go to triage; red flags → emergency message. No external LLM. | Intent accuracy 68% (cross-validation, 11 intents) |
| **Surge / outbreak alerts** (`surge.py`) | Watches daily bookings per department and anonymous symptom groups from triage (fever, diarrhoea, breathing, rash). Flags statistically unusual rises (Poisson test vs 14-day baseline), similar in spirit to public-health syndromic surveillance. | Shown in the staff AI panel |
| **Urgency-aware slot recommendation** | Urgent symptoms → earliest open slot; routine → least crowded slot. | |

All evaluation numbers are written to `ml_service/models/*metrics.json` and shown to staff in the **AI Model Performance** panel of the admin dashboard.

**Learning from real use:** the panel's *Export* buttons download JanCare's own attendance and no-show history as CSV. Save them as `ml_service/data/live_opd.csv` / `live_noshow.csv` and re-run training; the real rows are merged with, and override, the synthetic data.

Retrain / re-evaluate everything (from `ml_service`):

```powershell
python generate_data.py     # synthetic OPD time series (2 years)
python train_model.py       # crowd model  -> models/metrics.json
python noshow.py            # no-show model -> models/noshow_metrics.json
python evaluate_triage.py   # triage tests -> models/triage_metrics.json
python waittime.py          # wait-time model -> models/waittime_metrics.json
python assistant.py         # chat intent check -> models/assistant_metrics.json
```

Honest limitations: all training data is synthetic or hand-written, so these numbers show the method works, not that it works in a real hospital. The triage training set is small (about 220 phrases); a pretrained multilingual model (e.g. MuRIL) and real de-identified complaints would be the next step. Voice input uses the browser's speech service (Chrome sends audio to Google), so mention this to users.

## Features

- Patient registration/login (passwords are hashed); Aadhaar is not required or collected.
- Book appointments by department, date and hourly slot; server validates dates and capacity.
- Green/yellow/red slot labels using forecast demand and actual active bookings.
- Unique opaque ticket ID and QR pass for each booking.
- Patient cancellation, queue position and estimated waiting time.
- Hospital staff dashboard: check ticket, check in, start consultation, complete or cancel eligible appointments, transfer department, toggle doctor availability and review basic analytics.
- Simulated SMS messages printed in the backend terminal and stored as notification history; no SMS provider/API is called.
- English/Hindi patient UI and translated queue/voice readout where provided.
- Random Forest OPD crowd forecast with chronological holdout evaluation (MAE, RMSE, R² and baseline MAE).

## Hospital operations and patient features

| Feature | Where | What it does |
|---|---|---|
| **AI lab-report reader** | Lab portal, doctor portal, patient Medical Records | Reads uploaded reports (text of digital PDFs; offline OCR for photos via RapidOCR), finds 25 common tests (Hb, platelets, sugar, HbA1c, lipids, TSH, kidney, liver, vitamins…), compares them with sex/age-specific reference ranges and explains abnormal values in English and Hindi. A reading aid, not a diagnosis. |
| **Prescription safety check** | Doctor portal, while writing a prescription | Warns about the patient's allergies (incl. penicillin→cephalosporin cross-reaction), drug interactions (e.g. warfarin + NSAID, ARB + spironolactone, SSRI + tramadol), duplicates (incl. combination brands like Combiflam), age and condition risks, and medicines still running from earlier visits. Rule-based list of ~60 common OPD medicines with Indian brand names. |
| **Doctor capacity planning** | Staff dashboard | Turns the AI crowd forecast into "doctors needed vs on duty" per department for any date, using real average consultation times once enough visits exist. |
| **Lab module** | `/lab` | Lab staff see tests ordered in prescriptions, mark *Sample collected*, upload the report (AI reads it, patient gets a message). Staff create lab accounts. |
| **Waiting-hall display** | `/display` | Full-screen TV board: "Now serving" token + room per department, next tokens, doctor on break, spoken announcements in English and Hindi. Tokens only, never names. Tokens are issued at check-in. |
| **Walk-in registration** | Staff dashboard | Front desk registers patients without the app; AI suggests the department and flags emergencies; the patient gets a token immediately. |
| **Family members** | Medical Records → Family members; booking page | One account books for parents and children, each with their own age, allergies and ABHA number. |
| **Ratings & feedback** | Medical Records (patient), analytics (staff), doctor portal header | 1–5 stars + comment after each completed visit. |
| **Hindi / English SMS & WhatsApp** | Patient profile, language switch | All patient messages (booking, check-in token, your turn, reminders, report ready) are sent in the patient's language over their chosen channel. Delivery is simulated. |
| **ABHA health ID** | Patient profile, family members, doctor card, printed prescription | Stored and shown; not connected to the government ABDM system. |
| **Demo data** | Staff dashboard → Demo data | One click adds 50 patients, 30 days of visits, prescriptions, ratings, lab reports, today's live queue and a fever surge. One click removes it. |
| **Analytics** | Staff dashboard | Footfall (online vs walk-in), average wait, no-show rate by department, when patients arrive vs the AI forecast, ratings by department and doctor, recent comments, complaints by symptom group. |

Demo logins after loading demo data: patient `aarav.1@demo.jancare.in` / `Demo@1234` · doctor `gm@jancare.demo` / `Doctor@123` · lab `lab@jancare.demo` / `Lab@12345`.


## Doctor portal

Each OPD doctor has a profile (qualification, specialization, experience, room, OPD days and timings, languages).

- **Staff** add and edit doctors in the admin dashboard (*Doctors* section).
- **Patients** see "Your doctor" cards on the booking page, including whether the doctor is in OPD on the chosen day; after a visit they see the doctor's name, room and advice on their pass.
- **Doctors** sign in at `http://localhost:5173/doctor` to see:
  - today's queue (urgent patients flagged by the AI are moved up within their slot)
  - an **AI pre-visit summary** for each patient: the symptoms they typed while booking, the AI's urgency and suggested department
  - visit history and previous notes, no-show risk, and the AI crowd forecast for the day
  - *Call next patient*, *Complete consultation* (private notes + advice for the patient), *Mark no-show* and *Take a break*

### Prescriptions & lab reports

- During or after the consultation the doctor writes a **prescription** (diagnosis, medicines with dose like `1-0-1`, before/after food, days, lab tests, follow-up) and can **upload lab reports** (PDF or image, max 5 MB) — also later, from the queue via *Rx / Reports*. The patient gets a (simulated) SMS when a report is uploaded.
- Patients open the **Medical Records** tab to see each completed visit: the prescription, the doctor's advice, a **today's medicine schedule** (morning / afternoon / night), lab reports to view or download, pending tests, and a **Print / Save as PDF** prescription. If a follow-up is due, one click opens booking for that department. Available in English and Hindi.
- Report files are stored in MongoDB and can only be opened by the patient they belong to, doctors of that department, or staff. Doctors' private consultation notes are never shown to patients.

Demo doctors (one per department, password `Doctor@123`):

```powershell
cd backend
npm run seed-doctors
```

Logins: `cardio@jancare.demo`, `ortho@jancare.demo`, `neuro@jancare.demo`, `derma@jancare.demo`, `peds@jancare.demo`, `gm@jancare.demo`.


## Requirements

- Node.js 18 or newer and npm
- Python 3.10 or newer
- MongoDB running locally (or a MongoDB connection URI)

## Setup (Windows PowerShell)

Open three terminals from this project folder.

### 1. Backend

```powershell
cd backend
Copy-Item .env.example .env
```

Open `backend/.env` and replace `JWT_SECRET` with a private random string of at least 32 characters. Confirm `MONGO_URI` points to your running MongoDB instance. Then run:

```powershell
npm ci
npm run dev
```

Backend health check: `http://localhost:5000/api/health`.

Create the first staff account in another backend terminal (while MongoDB is running):

```powershell
npm run create-admin -- staff@example.com StrongPassword123 STAFF-001
```

Use the email/password above at `http://localhost:5173/admin`. Public staff registration is intentionally disabled.

### 2. ML service

```powershell
cd ml_service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python generate_data.py
python train_model.py
python noshow.py
python evaluate_triage.py
python waittime.py
python assistant.py
python -m uvicorn app:app --reload --port 8000
```

The training command writes the model, encoder and evaluation metrics into `ml_service/models/`. Open `http://localhost:8000/health` to check the model status and metrics.

On macOS/Linux, activate the environment with `source .venv/bin/activate` instead.

### 3. Frontend

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Optional frontend API URL configuration can be set by copying `frontend/.env.example` to `frontend/.env`.

## Demo walkthrough

1. Register a patient using a valid email, 10-digit phone, age, gender and password (8+ characters recommended).
2. Log in, choose department/date, inspect crowd and capacity, and book a slot.
3. Open **My Appointments** to see the QR pass, queue estimate and simulated notification log.
4. Open `/admin` in another tab and sign in with the staff account.
5. Paste/scan the QR ticket ID in the ticket field. A USB/Bluetooth QR scanner that types into the focused field can be used; this project does not request camera access.
6. Check the patient in, start consultation, and finish it. Patient status updates on the next automatic refresh.
7. Cancel an eligible booking from either portal and confirm it is no longer active in the queue.

## Slot and queue behavior

- The API supports Orthopedics, Pediatrics, Cardiology, Dermatology, Neurology and General Medicine.
- Slots are 08:00–13:00 and 14:00–17:00, in one-hour blocks.
- Capacity is a demo value of 80 per department/slot. The current remaining-seat estimate subtracts predicted demand and active bookings. This is a prototype policy; calibrate it against real operational capacity before real use.
- Waiting time is an estimate based on queue position and an 8-minute average consultation assumption; actual wait can differ.
- In-process request locking reduces same-process overbooking in a local demo. For multi-instance production, use a MongoDB transaction or atomic slot-inventory reservation design.
- Doctor availability is stored in memory and resets when the backend restarts.

## AI evaluation and data

`python train_model.py` performs a chronological 80/20 row split and prints MAE, RMSE, R², and a simple historical-group baseline MAE. The generated dataset includes artificial crowd patterns, so results are suitable only for demonstrating an ML workflow. Replace it with de-identified hospital OPD records, split by time, and evaluate against a baseline before making performance claims.

## Security and privacy notes

- Never commit `backend/.env` or production credentials.
- Staff accounts are created from the backend terminal, not from public signup.
- JWT secrets must be private and at least 32 characters.
- This is not a production-ready medical system. Before real deployment, add HTTPS, rate limiting, audit logging, stronger role-based permissions, backup/retention policies, and a security/privacy review.
