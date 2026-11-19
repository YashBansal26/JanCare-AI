// Demo data so every screen has something to show. Everything created here is
// marked isDemo:true (patients use @demo.jancare.in emails) and can be removed
// with one click. Doctors and the demo lab account are kept.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import Doctor from '../models/Doctor.js';
import LabOrder from '../models/LabOrder.js';
import LabReport from '../models/LabReport.js';
import LabStaff from '../models/LabStaff.js';
import Notification from '../models/Notification.js';
import TriageLog from '../models/TriageLog.js';
import { makeTextPdf } from './pdfReport.js';

const DEMO_DOMAIN = 'demo.jancare.in';

// seeded random numbers -> the same demo every time
function rng(seed = 42) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

const PEOPLE = [
  ['Aarav Sharma', 'Male'], ['Priya Verma', 'Female'], ['Rohan Gupta', 'Male'], ['Ananya Singh', 'Female'], ['Vikram Yadav', 'Male'],
  ['Sneha Patel', 'Female'], ['Arjun Reddy', 'Male'], ['Kavya Nair', 'Female'], ['Rahul Mishra', 'Male'], ['Pooja Joshi', 'Female'],
  ['Amit Kumar', 'Male'], ['Neha Chauhan', 'Female'], ['Suresh Pandey', 'Male'], ['Meena Devi', 'Female'], ['Rajesh Tiwari', 'Male'],
  ['Sunita Rao', 'Female'], ['Manoj Saxena', 'Male'], ['Deepa Iyer', 'Female'], ['Karan Malhotra', 'Male'], ['Ritu Agarwal', 'Female'],
  ['Sanjay Dubey', 'Male'], ['Kiran Bhat', 'Female'], ['Anil Mehta', 'Male'], ['Geeta Kumari', 'Female'], ['Vijay Pillai', 'Male'],
  ['Lakshmi Menon', 'Female'], ['Ramesh Chandra', 'Male'], ['Asha Bano', 'Female'], ['Imran Khan', 'Male'], ['Fatima Shaikh', 'Female'],
  ['Harpreet Singh', 'Male'], ['Simran Kaur', 'Female'], ['Mohit Jain', 'Male'], ['Nisha Thakur', 'Female'], ['Gopal Das', 'Male'],
  ['Rekha Sinha', 'Female'], ['Ajay Bisht', 'Male'], ['Swati Kulkarni', 'Female'], ['Prakash Naidu', 'Male'], ['Divya Ghosh', 'Female'],
  ['Naveen Rawat', 'Male'], ['Shalini Mittal', 'Female'], ['Tarun Bansal', 'Male'], ['Usha Rani', 'Female'], ['Dinesh Soni', 'Male'],
  ['Pallavi Desai', 'Female'], ['Abdul Rahman', 'Male'], ['Jyoti Prasad', 'Female'], ['Sachin Pawar', 'Male'], ['Bhavna Shah', 'Female'],
];
const KIDS = [['Aditya', 'Male'], ['Isha', 'Female'], ['Kabir', 'Male'], ['Myra', 'Female'], ['Vivaan', 'Male'], ['Saanvi', 'Female'], ['Reyansh', 'Male'], ['Anika', 'Female']];

const DOCTORS = [
  { name: 'Dr. Ananya Sharma', email: 'cardio@jancare.demo', department: 'Cardiology', qualification: 'MBBS, MD, DM (Cardiology)', specialization: 'Interventional cardiology', experienceYears: 14, room: 'OPD-101' },
  { name: 'Dr. Rajesh Verma', email: 'ortho@jancare.demo', department: 'Orthopedics', qualification: 'MBBS, MS (Ortho)', specialization: 'Joint replacement & sports injuries', experienceYears: 11, room: 'OPD-104' },
  { name: 'Dr. Meera Iyer', email: 'neuro@jancare.demo', department: 'Neurology', qualification: 'MBBS, MD, DM (Neurology)', specialization: 'Epilepsy & headache', experienceYears: 9, room: 'OPD-201' },
  { name: 'Dr. Sameer Khan', email: 'derma@jancare.demo', department: 'Dermatology', qualification: 'MBBS, MD (Dermatology)', specialization: 'Skin infections & allergy', experienceYears: 7, room: 'OPD-203' },
  { name: 'Dr. Priya Nair', email: 'peds@jancare.demo', department: 'Pediatrics', qualification: 'MBBS, MD (Pediatrics)', specialization: 'Child health & vaccination', experienceYears: 12, room: 'OPD-105' },
  { name: 'Dr. Arvind Gupta', email: 'gm@jancare.demo', department: 'General Medicine', qualification: 'MBBS, MD (Medicine)', specialization: 'Fever, diabetes & hypertension', experienceYears: 18, room: 'OPD-102' },
];

const VISIT = {
  'General Medicine': {
    symptoms: ['fever and body ache since 3 days', 'bukhar aur khansi', 'cough and cold', 'stomach pain and acidity', 'sugar level high', 'weakness and tiredness', 'तीन दिन से बुखार'],
    rx: [{ diagnosis: 'Viral fever', medicines: [['Paracetamol 650 mg', '1-1-1', 'After food', 3], ['Cetirizine 10 mg', '0-0-1', 'After food', 3]], tests: ['CBC (Complete Blood Count)', 'Dengue NS1'], advice: 'Drink plenty of fluids and rest. Come back if fever lasts more than 3 days.' },
         { diagnosis: 'Type 2 diabetes - review', medicines: [['Metformin 500 mg', '1-0-1', 'After food', 30]], tests: ['Blood Sugar (Fasting)', 'HbA1c'], advice: 'Walk 30 minutes daily; avoid sweets and sugary drinks.' },
         { diagnosis: 'Acid peptic disease', medicines: [['Pantoprazole 40 mg', '1-0-0', 'Before food', 14]], tests: [], advice: 'Avoid spicy and oily food; do not lie down right after meals.' }],
  },
  Pediatrics: {
    symptoms: ['my baby has fever', 'child has loose motions', 'bachche ko khansi', 'kid has cough and cold', 'बच्चे को बुखार'],
    rx: [{ diagnosis: 'Acute gastroenteritis', medicines: [['ORS sachet', '1-1-1', 'After food', 3], ['Zinc syrup 20 mg', '1-0-0', 'After food', 14]], tests: ['CBC (Complete Blood Count)'], advice: 'Give ORS after every loose stool; continue feeding.' },
         { diagnosis: 'Upper respiratory infection', medicines: [['Paracetamol syrup 250 mg/5 ml', 'SOS', 'After food', 3], ['Levocetirizine syrup', '0-0-1', 'After food', 5]], tests: [], advice: 'Warm fluids; return if breathing becomes fast.' }],
  },
  Orthopedics: {
    symptoms: ['knee pain while climbing stairs', 'kamar dard', 'lower back pain since a week', 'shoulder pain', 'ghutne me dard'],
    rx: [{ diagnosis: 'Osteoarthritis knee', medicines: [['Aceclofenac 100 mg', '1-0-1', 'After food', 7], ['Pantoprazole 40 mg', '1-0-0', 'Before food', 7], ['Calcium + Vitamin D3', '0-1-0', 'After food', 30]], tests: ['Vitamin D', 'Chest X-Ray'], advice: 'Knee strengthening exercises daily; avoid squatting.' },
         { diagnosis: 'Mechanical low back pain', medicines: [['Paracetamol 650 mg', '1-0-1', 'After food', 5]], tests: ['Vitamin B12'], advice: 'Hot fomentation; sit with back support.' }],
  },
  Cardiology: {
    symptoms: ['chest tightness on walking', 'high blood pressure', 'palpitations', 'bp high rehta hai', 'सीने में दर्द'],
    rx: [{ diagnosis: 'Hypertension', medicines: [['Amlodipine 5 mg', '1-0-0', 'After food', 30], ['Telma 40', '1-0-0', 'After food', 30]], tests: ['Lipid Profile', 'Kidney Function Test'], advice: 'Low-salt diet; check BP twice a week.' },
         { diagnosis: 'Dyslipidaemia', medicines: [['Atorvastatin 10 mg', '0-0-1', 'After food', 30], ['Ecosprin 75 mg', '0-1-0', 'After food', 30]], tests: ['Lipid Profile', 'ECG'], advice: 'Brisk walk 30 minutes; avoid fried food.' }],
  },
  Dermatology: {
    symptoms: ['itchy red rash', 'khujli ho rahi hai', 'hair fall', 'pimples on face', 'ringworm on thigh'],
    rx: [{ diagnosis: 'Tinea corporis', medicines: [['Fluconazole 150 mg', '1-0-0', 'After food', 4], ['Levocetirizine 5 mg', '0-0-1', 'After food', 10]], tests: [], advice: 'Keep skin dry; do not share towels.' },
         { diagnosis: 'Telogen effluvium', medicines: [['Biotin 10 mg', '1-0-0', 'After food', 30]], tests: ['Thyroid Profile (TSH)', 'Vitamin D', 'CBC (Complete Blood Count)'], advice: 'Protein-rich diet; hair fall usually settles in 3 months.' }],
  },
  Neurology: {
    symptoms: ['severe headache', 'migraine with vomiting', 'numbness in hands', 'chakkar aa rahe hain', 'सिर दर्द'],
    rx: [{ diagnosis: 'Migraine', medicines: [['Naproxen 250 mg', 'SOS', 'After food', 10], ['Amitriptyline 10 mg', '0-0-1', 'After food', 30]], tests: ['Thyroid Profile (TSH)'], advice: 'Sleep on time; keep a headache diary.' },
         { diagnosis: 'Peripheral neuropathy', medicines: [['Methylcobalamin 1500 mcg', '1-0-0', 'After food', 30]], tests: ['Vitamin B12', 'HbA1c'], advice: 'Check sugar regularly; protect feet from injury.' }],
  },
};
const COMMENTS = { 5: ['Doctor explained everything clearly.', 'Very quick, no long waiting.', 'Excellent care, thank you!', 'बहुत अच्छा अनुभव'],
  4: ['Good consultation, waited a bit.', 'Helpful staff.', 'अच्छा था'], 3: ['Waiting time was long.', 'OK experience.'], 2: ['Had to wait over an hour.'], 1: ['Very long queue, no updates.'] };

// test name -> report lines; r() decides abnormal values
function reportLines(test, r, sex) {
  const pick = (normal, abnormal) => (r() < 0.35 ? abnormal : normal);
  const f = (x, d = 1) => x.toFixed(d);
  switch (test) {
    case 'CBC (Complete Blood Count)': return [
      `Haemoglobin ${f(pick(sex === 'Female' ? 12.5 + r() * 2 : 13.8 + r() * 2.5, 8.5 + r() * 2.5))} g/dL`,
      `Total Leucocyte Count ${Math.round(pick(5000 + r() * 5000, 11800 + r() * 4000))} /cumm`,
      `Platelet Count ${Math.round(pick(180000 + r() * 150000, 70000 + r() * 60000)).toLocaleString('en-IN')} /cumm`];
    case 'Dengue NS1': return [`Dengue NS1 Antigen: ${r() < 0.3 ? 'POSITIVE' : 'Negative'}`, `Platelet Count ${Math.round(pick(170000 + r() * 120000, 60000 + r() * 50000)).toLocaleString('en-IN')} /cumm`];
    case 'Blood Sugar (Fasting)': return [`Fasting Blood Sugar ${Math.round(pick(78 + r() * 18, 128 + r() * 70))} mg/dL`];
    case 'HbA1c': return [`HbA1c ${f(pick(4.8 + r() * 0.7, 6.7 + r() * 2.5))} %`];
    case 'Lipid Profile': return [`Total Cholesterol ${Math.round(pick(150 + r() * 45, 215 + r() * 60))} mg/dL`, `LDL Cholesterol ${Math.round(pick(80 + r() * 40, 140 + r() * 50))} mg/dL`,
      `HDL Cholesterol ${Math.round(pick(45 + r() * 15, 30 + r() * 8))} mg/dL`, `Triglycerides ${Math.round(pick(90 + r() * 50, 170 + r() * 120))} mg/dL`];
    case 'Kidney Function Test': return [`Serum Creatinine ${f(pick(0.7 + r() * 0.5, 1.5 + r() * 1.0))} mg/dL`, `Blood Urea ${Math.round(pick(18 + r() * 18, 45 + r() * 30))} mg/dL`, `Uric Acid ${f(pick(3.5 + r() * 2.5, 7.4 + r() * 2))} mg/dL`];
    case 'Thyroid Profile (TSH)': return [`TSH ${f(pick(0.8 + r() * 2.8, 5.5 + r() * 6), 2)} uIU/mL`];
    case 'Vitamin D': return [`Vitamin D (25-OH) ${f(pick(31 + r() * 30, 9 + r() * 15))} ng/mL`];
    case 'Vitamin B12': return [`Vitamin B12 ${Math.round(pick(260 + r() * 500, 110 + r() * 70))} pg/mL`];
    case 'ECG': return ['ECG: Normal sinus rhythm, rate 78/min. No ST-T changes.'];
    case 'Chest X-Ray': return ['X-Ray: No significant abnormality detected.'];
    default: return [`${test}: within normal limits`];
  }
}

export async function loadDemoData({ DEPARTMENTS, VALID_SLOTS, localDateString, mlPost }) {
  const r = rng(2026);
  const pickOne = (xs) => xs[Math.floor(r() * xs.length)];
  const between = (a, b) => a + Math.floor(r() * (b - a + 1));
  const started = Date.now();

  // 1. staff accounts the demo relies on
  for (const d of DOCTORS) if (!(await Doctor.findOne({ email: d.email }))) await Doctor.create({ ...d, password: 'Doctor@123' });
  if (!(await LabStaff.findOne({ email: 'lab@jancare.demo' }))) await LabStaff.create({ name: 'Lab Technician (demo)', email: 'lab@jancare.demo', password: 'Lab@12345' });
  const doctorBy = Object.fromEntries((await Doctor.find({ active: true }).lean()).map(d => [d.department, d]));

  // 2. patients
  const hash = await bcrypt.hash('Demo@1234', 10);
  const users = PEOPLE.map(([name, gender], i) => {
    const age = i < 6 ? between(60, 78) : between(19, 58);
    const u = {
      _id: new mongoose.Types.ObjectId(), username: name, gender, age, password: hash, isDemo: true,
      email: `${name.split(' ')[0].toLowerCase()}.${i + 1}@${DEMO_DOMAIN}`, phone: `98${String(76500000 + i * 7919).slice(0, 8)}`,
      preferredLanguage: r() < 0.4 ? 'hi' : 'en', notifyChannel: r() < 0.3 ? 'WhatsApp' : 'SMS',
      healthProfile: {
        allergies: r() < 0.12 ? ['Penicillin'] : r() < 0.08 ? ['Sulfa'] : r() < 0.06 ? ['NSAIDs'] : [],
        conditions: age >= 50 && r() < 0.5 ? [pickOne(['Diabetes', 'Hypertension', 'Diabetes, Hypertension'])] : r() < 0.06 ? ['Asthma'] : [],
        bloodGroup: pickOne(['A+', 'B+', 'O+', 'AB+', 'O-', 'B-']),
        abhaId: r() < 0.45 ? `${between(10, 99)}-${between(1000, 9999)}-${between(1000, 9999)}-${between(1000, 9999)}` : '',
      },
      familyMembers: [],
    };
    if (i % 6 === 1) {
      const [kid, kg] = KIDS[(i / 6 | 0) % KIDS.length];
      u.familyMembers.push({ _id: new mongoose.Types.ObjectId(), name: `${kid} ${name.split(' ')[1]}`, relation: kg === 'Male' ? 'Son' : 'Daughter', age: between(2, 12), gender: kg, allergies: [], conditions: [], abhaId: '' });
    }
    return u;
  });
  await User.collection.insertMany(users.map(u => ({ ...new User(u).toObject(), createdAt: new Date(started - 60 * 86400000), updatedAt: new Date() })));

  // 3. appointments
  const today = localDateString();
  const slotStart = (date, slot) => new Date(`${date}T${slot.slice(0, 5)}:00`);
  const minutes = (d, m) => new Date(d.getTime() + m * 60000);
  const CONSULT = { 'General Medicine': 6, Pediatrics: 8, Orthopedics: 9, Cardiology: 12, Dermatology: 6, Neurology: 13 };
  const appts = [];
  const visitFor = (dept, date, slot, status, extra = {}) => {
    const u = pickOne(users);
    const kid = dept === 'Pediatrics' ? u.familyMembers[0] : null;
    const who = kid || u;
    const v = VISIT[dept];
    const symptoms = r() < 0.75 ? pickOne(v.symptoms) : '';
    return {
      _id: new mongoose.Types.ObjectId(), ticketId: randomUUID(), patientEmail: u.email, patientName: kid ? kid.name : u.username,
      patientAge: who.age, patientGender: who.gender, familyMemberId: kid?._id || null, department: dept, date, timeSlot: slot, status,
      symptoms, aiTriage: symptoms ? { department: dept, confidence: Math.round((0.55 + r() * 0.4) * 100) / 100, urgency: r() < 0.12 ? 'Urgent' : 'Routine', emergency: false } : null,
      source: r() < 0.2 ? 'walk-in' : 'online', isDemo: true, ...extra, _user: u,
    };
  };
  const weightedSlot = () => (r() < 0.6 ? pickOne(VALID_SLOTS.slice(1, 4)) : pickOne(VALID_SLOTS));
  const complete = (a, start, mondayBusy) => {
    const doc = doctorBy[a.department];
    a.checkedInAt = minutes(start, between(-10, 20));
    a.admittedAt = minutes(a.checkedInAt, between(4, 35) + (mondayBusy ? 15 : 0) + (['09', '10'].includes(a.timeSlot.slice(0, 2)) ? 10 : 0));
    a.completedAt = minutes(a.admittedAt, Math.max(3, Math.round(CONSULT[a.department] * (0.6 + r() * 0.9))));
    if (doc) { a.doctorId = doc._id; a.doctorName = doc.name; a.room = doc.room; }
    const t = pickOne(VISIT[a.department].rx);
    a.prescription = { diagnosis: t.diagnosis, medicines: t.medicines.map(([name, dose, timing, days]) => ({ name, dose, timing, days, notes: '' })),
                       labTests: t.tests, followUpDays: r() < 0.4 ? pickOne([7, 14, 30]) : null, writtenAt: a.completedAt };
    a.advice = t.advice;
    a.doctorNotes = `${t.diagnosis}. Vitals stable.`;
  };

  // 3a. last 30 days
  for (let back = 30; back >= 1; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    if (d.getDay() === 0) continue;
    const date = localDateString(d);
    const monday = d.getDay() === 1;
    for (const dept of DEPARTMENTS) {
      const n = between(2, 4) + (monday ? 2 : 0) + (['General Medicine', 'Pediatrics'].includes(dept) ? 1 : 0);
      const day = [];
      for (let k = 0; k < n; k++) {
        const slot = weightedSlot();
        const roll = r();
        const status = roll < 0.74 ? 'Completed' : roll < 0.87 ? 'No-Show' : 'Cancelled';
        const a = visitFor(dept, date, slot, status);
        a.createdAt = new Date(slotStart(date, slot).getTime() - (a.source === 'walk-in' ? 0 : between(0, 9)) * 86400000 - between(1, 10) * 3600000);
        if (status === 'Completed') {
          complete(a, slotStart(date, slot), monday);
          if (r() < 0.65) {
            const roll2 = r();
            const rating = roll2 < 0.45 ? 5 : roll2 < 0.8 ? 4 : roll2 < 0.92 ? 3 : roll2 < 0.97 ? 2 : 1;
            a.feedback = { rating, comment: r() < 0.6 ? pickOne(COMMENTS[rating]) : '', at: minutes(a.completedAt, between(30, 600)) };
          }
        }
        if (status === 'Cancelled') a.cancelledAt = minutes(a.createdAt, between(60, 3000));
        day.push(a);
      }
      day.filter(a => a.checkedInAt).sort((x, y) => x.checkedInAt - y.checkedInAt).forEach((a, i) => { a.tokenNumber = i + 1; });
      appts.push(...day);
    }
  }

  // 3b. today: finished, in the room, waiting and still to come - per department
  const nowH = new Date().getHours();
  const pastSlots = VALID_SLOTS.filter(s => parseInt(s, 10) < Math.max(9, Math.min(nowH, 16)));
  const laterSlots = VALID_SLOTS.filter(s => parseInt(s, 10) > nowH);
  const nowSlot = VALID_SLOTS.filter(s => parseInt(s, 10) <= Math.max(8, nowH)).at(-1) || VALID_SLOTS[0];
  for (const dept of DEPARTMENTS) {
    let token = 0;
    const base = new Date(Date.now() - 3 * 3600000);
    for (let k = 0; k < 2; k++) {
      const a = visitFor(dept, today, pickOne(pastSlots.length ? pastSlots : [nowSlot]), 'Completed');
      a.createdAt = minutes(base, -between(600, 4000));
      complete(a, minutes(base, k * 30), false);
      a.tokenNumber = ++token;
      appts.push(a);
    }
    const doc = doctorBy[dept];
    const inRoom = visitFor(dept, today, nowSlot, 'In Progress', { checkedInAt: minutes(new Date(), -between(25, 45)), admittedAt: minutes(new Date(), -between(2, 8)),
      doctorId: doc?._id, doctorName: doc?.name || '', room: doc?.room || '' });
    inRoom.createdAt = minutes(new Date(), -between(1500, 6000));
    inRoom.tokenNumber = ++token;
    appts.push(inRoom);
    const waiting = between(3, 6);
    for (let k = 0; k < waiting; k++) {
      const a = visitFor(dept, today, nowSlot, 'Checked In', { checkedInAt: minutes(new Date(), -between(1, 30)) });
      a.createdAt = minutes(new Date(), -between(60, 5000));
      appts.push(a);
    }
    appts.filter(a => a.department === dept && a.date === today && a.status === 'Checked In').sort((x, y) => x.checkedInAt - y.checkedInAt).forEach(a => { a.tokenNumber = ++token; });
    for (let k = 0; k < (laterSlots.length ? between(2, 4) : 0); k++) {
      const a = visitFor(dept, today, pickOne(laterSlots), 'Scheduled');
      a.createdAt = minutes(new Date(), -between(60, 9000));
      appts.push(a);
    }
  }

  // 3c. upcoming week (for no-show risk and capacity planning)
  for (let k = 0; k < 30; k++) {
    const d = new Date(); d.setDate(d.getDate() + between(1, 7));
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const a = visitFor(pickOne(DEPARTMENTS), localDateString(d), weightedSlot(), 'Scheduled');
    a.createdAt = new Date(Date.now() - between(0, 20) * 86400000);
    appts.push(a);
  }

  const docs = appts.map(({ _user, ...a }) => ({ ...new Appointment(a).toObject(), createdAt: a.createdAt || new Date(), updatedAt: new Date() }));
  await Appointment.collection.insertMany(docs);

  // 4. lab orders + reports (older visits have reports; recent ones wait in the lab queue)
  let reportsMade = 0, ordersMade = 0;
  for (const a of appts.filter(x => x.status === 'Completed' && x.prescription?.labTests?.length)) {
    const ageDays = (Date.now() - new Date(`${a.date}T00:00:00`)) / 86400000;
    for (const testName of a.prescription.labTests) {
      const order = { _id: new mongoose.Types.ObjectId(), appointmentId: a._id, patientEmail: a.patientEmail, patientName: a.patientName,
        patientAge: a.patientAge, patientGender: a.patientGender, department: a.department, doctorName: a.doctorName || '', testName,
        status: 'Ordered', isDemo: true, createdAt: a.completedAt, updatedAt: new Date() };
      if (ageDays > 2 || (ageDays > 1 && r() < 0.5)) {
        const lines = reportLines(testName, r, a.patientGender);
        const pdf = makeTextPdf([{ text: 'JanCare Hospital Laboratory (demo report)', bold: true, size: 14 },
          { text: `Patient: ${a.patientName}   Age: ${a.patientAge}   Sex: ${a.patientGender}`, size: 10 },
          { text: `Test: ${testName}   Date: ${a.date}`, size: 10 }, { text: 'Result', bold: true, gap: 26 },
          ...lines.map(text => ({ text })), { text: 'This is generated demo data, not a real report.', size: 8, gap: 40 }]);
        let analysis = null;
        try { analysis = await mlPost('/lab/analyze', { mimeType: 'application/pdf', dataBase64: pdf.toString('base64'), sex: a.patientGender, age: a.patientAge }, 15000); }
        catch { /* AI service optional */ }
        const report = await LabReport.create({ appointmentId: a._id, patientEmail: a.patientEmail, testName, fileName: `${testName.replace(/[^\w]+/g, '_')}_${a.date}.pdf`,
          mimeType: 'application/pdf', size: pdf.length, data: pdf, uploadedBy: 'Lab Technician (demo)', resultSummary: '', analysis, labOrderId: order._id, isDemo: true });
        Object.assign(order, { status: 'Completed', sampleCollectedAt: minutes(a.completedAt, 20), completedAt: minutes(a.completedAt, 60 * between(5, 30)), reportId: report._id, collectedBy: 'Lab Technician (demo)' });
        reportsMade++;
      } else if (r() < 0.5) {
        Object.assign(order, { status: 'Sample collected', sampleCollectedAt: minutes(a.completedAt, 25), collectedBy: 'Lab Technician (demo)' });
      }
      await LabOrder.collection.insertOne(order);
      ordersMade++;
    }
  }

  // 5. anonymous triage log with a fever surge in the last two days (shows the outbreak alert)
  const logs = [];
  for (let back = 20; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back);
    const date = localDateString(d);
    const fever = back <= 1 ? between(14, 19) : between(2, 5);
    for (let k = 0; k < fever; k++) logs.push({ date, department: 'General Medicine', urgency: 'Routine', emergency: false, symptomGroup: 'fever', isDemo: true, createdAt: d, updatedAt: d });
    for (const g of ['diarrhoea / vomiting', 'breathing / cough', 'skin rash']) {
      for (let k = 0; k < between(1, 3); k++) logs.push({ date, department: 'General Medicine', urgency: 'Routine', emergency: false, symptomGroup: g, isDemo: true, createdAt: d, updatedAt: d });
    }
  }
  await TriageLog.collection.insertMany(logs);

  return { message: 'Demo data loaded', patients: users.length, familyMembers: users.reduce((s, u) => s + u.familyMembers.length, 0),
           appointments: docs.length, labOrders: ordersMade, labReports: reportsMade, triageLogs: logs.length, seconds: Math.round((Date.now() - started) / 100) / 10,
           logins: { patient: `${users[0].email} / Demo@1234`, doctor: 'gm@jancare.demo / Doctor@123', lab: 'lab@jancare.demo / Lab@12345' } };
}

export async function clearDemoData() {
  const demoEmails = (await User.find({ isDemo: true }).select('email').lean()).map(u => u.email);
  const [appts, users, orders, reports, logs, notes] = await Promise.all([
    Appointment.deleteMany({ isDemo: true }), User.deleteMany({ isDemo: true }), LabOrder.deleteMany({ isDemo: true }),
    LabReport.deleteMany({ isDemo: true }), TriageLog.deleteMany({ isDemo: true }), Notification.deleteMany({ patientEmail: { $in: demoEmails } }),
  ]);
  return { message: 'Demo data removed', appointments: appts.deletedCount, patients: users.deletedCount, labOrders: orders.deletedCount,
           labReports: reports.deletedCount, triageLogs: logs.deletedCount, notifications: notes.deletedCount };
}
