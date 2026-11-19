// JanCare extra features: patient profile & family, feedback, prescription safety check,
// doctor capacity planning, lab module, waiting-hall display, walk-in desk, analytics and demo data.
import { randomUUID, randomBytes } from 'node:crypto';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import Doctor from '../models/Doctor.js';
import LabOrder from '../models/LabOrder.js';
import LabReport from '../models/LabReport.js';
import LabStaff from '../models/LabStaff.js';
import Notification from '../models/Notification.js';
import TriageLog from '../models/TriageLog.js';
import { labProtect } from '../middleware/labAuthMiddleware.js';
import { checkPrescription } from '../services/rxSafety.js';
import { computeCapacity, DEFAULT_CONSULT_MIN } from '../services/capacity.js';
import { loadDemoData, clearDemoData } from '../services/demoData.js';

const str = (v, n = 100) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const list = (v, n = 10) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map(x => str(x, 60)).filter(Boolean).slice(0, n);
const ABHA_RE = /^\d{2}-?\d{4}-?\d{4}-?\d{4}$/;
const GENDERS = ['Male', 'Female', 'Other'];

export function registerExtras(app, ctx) {
  const { protect, adminProtect, doctorProtect, DEPARTMENTS, VALID_SLOTS, localDateString, notify, nextToken,
          changeAppointmentStatus, saveLabReport, healthFor, getCrowdPredictions, mlPost, generateToken,
          doctorAvailability, triageForBooking } = ctx;

  // Every route here is wrapped so a database error returns 500 instead of crashing the server
  const safe = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error(`${req.method} ${req.path} failed:`, e.message);
    if (!res.headersSent) res.status(500).json({ error: 'Server error - please try again.' });
  });
  const R = Object.fromEntries(['get', 'post', 'put', 'delete'].map(m => [m, (path, ...handlers) => app[m](path, ...handlers.slice(0, -1), safe(handlers.at(-1)))]));

  // ================= PATIENT PROFILE, FAMILY, PREFERENCES =================
  const profileOut = (u) => ({
    username: u.username, email: u.email, phone: u.phone, age: u.age, gender: u.gender,
    healthProfile: u.healthProfile || {}, familyMembers: u.familyMembers || [],
    preferredLanguage: u.preferredLanguage || 'en', notifyChannel: u.notifyChannel || 'SMS',
  });

  R.get('/api/me/profile', protect, async (req, res) => res.json(profileOut(await User.findById(req.user._id))));

  R.put('/api/me/profile', protect, async (req, res) => {
    const user = await User.findById(req.user._id);
    const b = req.body || {};
    if (b.healthProfile) {
      const abha = str(b.healthProfile.abhaId, 20);
      if (abha && !ABHA_RE.test(abha)) return res.status(400).json({ error: 'ABHA number must have 14 digits (e.g. 12-3456-7890-1234).' });
      user.healthProfile = {
        allergies: list(b.healthProfile.allergies), conditions: list(b.healthProfile.conditions),
        bloodGroup: str(b.healthProfile.bloodGroup, 5), abhaId: abha,
      };
    }
    if (['en', 'hi'].includes(b.preferredLanguage)) user.preferredLanguage = b.preferredLanguage;
    if (['SMS', 'WhatsApp'].includes(b.notifyChannel)) user.notifyChannel = b.notifyChannel;
    await user.save();
    res.json(profileOut(user));
  });

  const memberFrom = (b) => {
    const age = Number(b.age);
    if (!str(b.name) || !Number.isFinite(age) || age < 0 || age > 120 || !GENDERS.includes(b.gender)) return null;
    const abha = str(b.abhaId, 20);
    if (abha && !ABHA_RE.test(abha)) return null;
    return { name: str(b.name, 80), relation: str(b.relation, 30) || 'Family', age, gender: b.gender,
             allergies: list(b.allergies), conditions: list(b.conditions), abhaId: abha };
  };

  R.post('/api/me/family', protect, async (req, res) => {
    const m = memberFrom(req.body || {});
    if (!m) return res.status(400).json({ error: 'Name, age (0-120), gender and a valid ABHA number (if given) are required.' });
    const user = await User.findById(req.user._id);
    if (user.familyMembers.length >= 10) return res.status(400).json({ error: 'Up to 10 family members per account.' });
    user.familyMembers.push(m);
    await user.save();
    res.status(201).json(profileOut(user));
  });

  R.put('/api/me/family/:id', protect, async (req, res) => {
    const m = memberFrom(req.body || {});
    if (!m) return res.status(400).json({ error: 'Name, age (0-120), gender and a valid ABHA number (if given) are required.' });
    const user = await User.findById(req.user._id);
    const member = user.familyMembers.id(req.params.id);
    if (!member) return res.status(404).json({ error: 'Family member not found' });
    Object.assign(member, m);
    await user.save();
    res.json(profileOut(user));
  });

  R.delete('/api/me/family/:id', protect, async (req, res) => {
    const user = await User.findById(req.user._id);
    const member = user.familyMembers.id(req.params.id);
    if (!member) return res.status(404).json({ error: 'Family member not found' });
    member.deleteOne();
    await user.save();
    res.json(profileOut(user));
  });

  // ================= FEEDBACK =================
  R.post('/api/appointments/:id/feedback', protect, async (req, res) => {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1 to 5 stars.' });
    const appt = await Appointment.findOne({ _id: req.params.id, patientEmail: req.user.email });
    if (!appt || appt.status !== 'Completed') return res.status(404).json({ error: 'Completed visit not found' });
    appt.feedback = { rating, comment: str(req.body.comment, 500), at: new Date() };
    await appt.save();
    res.json({ message: 'Thank you for your feedback', feedback: appt.feedback });
  });

  R.get('/api/doctor/ratings', doctorProtect, async (req, res) => {
    const rated = await Appointment.find({ doctorId: req.doctor._id, 'feedback.rating': { $gte: 1 } })
      .select('feedback date').sort({ 'feedback.at': -1 }).lean();
    const avg = rated.length ? rated.reduce((s, a) => s + a.feedback.rating, 0) / rated.length : null;
    res.json({ count: rated.length, average: avg && Math.round(avg * 10) / 10,
               recent: rated.filter(a => a.feedback.comment).slice(0, 5).map(a => ({ rating: a.feedback.rating, comment: a.feedback.comment, date: a.date })) });
  });

  // ================= PRESCRIPTION SAFETY CHECK =================
  R.post('/api/doctor/appointments/:id/rx-check', doctorProtect, async (req, res) => {
    const appt = await Appointment.findById(req.params.id);
    if (!appt || appt.department !== req.doctor.department) return res.status(404).json({ error: 'Appointment not found in your department' });
    const user = await User.findOne({ email: appt.patientEmail }).lean();
    const health = healthFor(user, appt.familyMemberId);
    // medicines still running from this patient's other visits
    const others = await Appointment.find({ patientEmail: appt.patientEmail, familyMemberId: appt.familyMemberId || null,
      _id: { $ne: appt._id }, status: 'Completed', 'prescription.medicines.0': { $exists: true } }).select('date prescription').lean();
    const today = new Date();
    const current = others.flatMap(o => (o.prescription.medicines || []).filter(m => {
      if (!m.days) return true;
      const end = new Date(`${o.date}T00:00:00`); end.setDate(end.getDate() + m.days);
      return end > today;
    }).map(m => ({ name: m.name, from: o.date })));
    const medicines = (Array.isArray(req.body.medicines) ? req.body.medicines : []).slice(0, 20).map(m => ({ name: str(m?.name, 120) }));
    res.json({ ...checkPrescription(medicines, { age: appt.patientAge, allergies: health.allergies, conditions: health.conditions }, current),
               allergies: health.allergies, conditions: health.conditions, currentMedicines: current });
  });

  // ================= DOCTOR CAPACITY PLANNING =================
  R.get('/api/admin/ai/capacity', adminProtect, async (req, res) => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : localDateString(new Date(Date.now() + 86400000));
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T00:00:00`).getDay()];
    const forecast = {}, booked = {}, doctors = {}, consultMinutes = {};
    await Promise.all(DEPARTMENTS.map(async dept => {
      try { forecast[dept] = (await getCrowdPredictions(date, dept)).reduce((s, p) => s + (Number(p.predicted_patients) || 0), 0); }
      catch { forecast[dept] = null; }
    }));
    const appts = await Appointment.find({ date, status: { $nin: ['Cancelled', 'No-Show'] } }).select('department').lean();
    appts.forEach(a => { booked[a.department] = (booked[a.department] || 0) + 1; });
    (await Doctor.find({ active: true, opdDays: weekday }).select('department').lean()).forEach(d => { doctors[d.department] = (doctors[d.department] || 0) + 1; });
    const since = localDateString(new Date(Date.now() - 30 * 86400000));
    const done = await Appointment.find({ status: 'Completed', date: { $gte: since }, admittedAt: { $ne: null }, completedAt: { $ne: null } })
      .select('department admittedAt completedAt').lean();
    for (const dept of DEPARTMENTS) {
      const mins = done.filter(a => a.department === dept).map(a => (new Date(a.completedAt) - new Date(a.admittedAt)) / 60000).filter(m => m > 0 && m < 120);
      consultMinutes[dept] = mins.length >= 10 ? Math.round(mins.reduce((s, m) => s + m, 0) / mins.length) : DEFAULT_CONSULT_MIN[dept];
    }
    const rows = computeCapacity({ departments: DEPARTMENTS, forecast, booked, doctors, consultMinutes });
    res.json({ date, weekday, rows, assumptions: { opdHours: 8, utilisation: 0.85,
      note: 'Expected patients = AI crowd forecast for the day (or bookings, if higher). Consultation time = average of the last 30 days when at least 10 visits exist, otherwise a typical value.' } });
  });

  // ================= LAB MODULE =================
  R.post('/api/auth/lab/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid credentials' });
    const lab = await LabStaff.findOne({ email: email.trim().toLowerCase() });
    if (!lab || !lab.active || !(await lab.matchPassword(password))) return res.status(401).json({ error: 'Invalid lab credentials' });
    res.json({ token: generateToken(lab._id, 'lab'), lab: { name: lab.name, email: lab.email } });
  });

  R.get('/api/lab/me', labProtect, (req, res) => res.json({ name: req.lab.name, email: req.lab.email }));

  R.get('/api/lab/orders', labProtect, async (req, res) => {
    const status = ['Ordered', 'Sample collected', 'Completed'].includes(req.query.status) ? req.query.status : null;
    const filter = status ? { status } : { status: { $in: ['Ordered', 'Sample collected'] } };
    const q = str(req.query.q, 60);
    if (q) filter.$or = [{ patientName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { testName: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
    const orders = await LabOrder.find(filter).sort({ status: 1, createdAt: 1 }).limit(300).lean();
    const counts = Object.fromEntries(await Promise.all(['Ordered', 'Sample collected', 'Completed'].map(async s => [s, await LabOrder.countDocuments({ status: s })])));
    const reports = await LabReport.find({ _id: { $in: orders.map(o => o.reportId).filter(Boolean) } }).select('-data').lean();
    const repBy = Object.fromEntries(reports.map(r => [String(r._id), r]));
    res.json({ orders: orders.map(o => ({ ...o, report: o.reportId ? repBy[String(o.reportId)] || null : null })), counts });
  });

  R.put('/api/lab/orders/:id/collect', labProtect, async (req, res) => {
    const order = await LabOrder.findById(req.params.id);
    if (!order || order.status !== 'Ordered') return res.status(400).json({ error: 'Only ordered tests can be marked as sample collected.' });
    order.status = 'Sample collected'; order.sampleCollectedAt = new Date(); order.collectedBy = req.lab.name;
    await order.save();
    const [patient, appt] = await Promise.all([User.findOne({ email: order.patientEmail }), Appointment.findById(order.appointmentId)]);
    await notify(patient, appt, 'sample', { test: order.testName });
    res.json(order);
  });

  R.post('/api/lab/orders/:id/report', labProtect, async (req, res) => {
    try {
      const order = await LabOrder.findById(req.params.id);
      if (!order || order.status === 'Cancelled') return res.status(404).json({ error: 'Lab order not found' });
      const appt = await Appointment.findById(order.appointmentId);
      const r = await saveLabReport(appt, { ...req.body, testName: order.testName, labOrderId: String(order._id) }, `Lab: ${req.lab.name}`);
      if (r.error) return res.status(r.code).json({ error: r.error });
      res.status(201).json(r.report);
    } catch (e) {
      console.error('Lab upload failed:', e);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  R.get('/api/admin/lab-staff', adminProtect, async (_req, res) => res.json(await LabStaff.find({}).select('-password').sort({ name: 1 })));
  R.post('/api/admin/lab-staff', adminProtect, async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!str(name) || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Name, a valid email and a password of at least 8 characters are required.' });
    }
    if (await LabStaff.findOne({ email: email.trim().toLowerCase() })) return res.status(409).json({ error: 'This email already has a lab account.' });
    const lab = await LabStaff.create({ name: str(name), email, password });
    res.status(201).json({ _id: lab._id, name: lab.name, email: lab.email, active: lab.active });
  });

  // ================= WAITING-HALL DISPLAY (public, no names) =================
  R.get('/api/display/queue', async (_req, res) => {
    const today = localDateString();
    const appts = await Appointment.find({ date: today, status: { $in: ['Checked In', 'In Progress'] } })
      .select('department status tokenNumber room doctorName checkedInAt admittedAt aiTriage').lean();
    const rank = { Emergency: 0, Urgent: 1 };
    res.json({
      date: today, time: new Date().toISOString(),
      departments: DEPARTMENTS.map(dept => {
        const mine = appts.filter(a => a.department === dept);
        const waiting = mine.filter(a => a.status === 'Checked In')
          .sort((x, y) => ((rank[x.aiTriage?.urgency] ?? 2) - (rank[y.aiTriage?.urgency] ?? 2)) || (new Date(x.checkedInAt) - new Date(y.checkedInAt)));
        return {
          department: dept,
          nowServing: mine.filter(a => a.status === 'In Progress').sort((x, y) => new Date(y.admittedAt) - new Date(x.admittedAt))
            .map(a => ({ token: a.tokenNumber, room: a.room || '', doctor: a.doctorName || '', since: a.admittedAt })),
          next: waiting.slice(0, 6).map(a => a.tokenNumber),
          waitingCount: waiting.length,
          onBreak: doctorAvailability[dept]?.available === false,
        };
      }),
    });
  });

  // ================= WALK-IN REGISTRATION (front desk) =================
  const currentSlot = () => {
    const h = new Date().getHours();
    const hour = h < 8 ? 8 : h === 13 ? 14 : h > 16 ? 16 : h;
    return VALID_SLOTS.find(s => parseInt(s, 10) === hour) || VALID_SLOTS[0];
  };

  R.post('/api/admin/walk-in', adminProtect, async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 80), phone = str(b.phone, 10), age = Number(b.age), symptoms = str(b.symptoms, 500);
    if (!name || !/^\d{10}$/.test(phone) || !Number.isFinite(age) || age < 0 || age > 120 || !GENDERS.includes(b.gender)) {
      return res.status(400).json({ error: 'Name, 10-digit phone, age and gender are required.' });
    }
    try {
      const aiTriage = await triageForBooking(symptoms);
      const department = DEPARTMENTS.includes(b.department) ? b.department : (aiTriage?.department || 'General Medicine');
      let user = await User.findOne({ phone, username: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
      if (!user) {
        user = await User.create({ username: name, email: `walkin.${phone}.${randomBytes(3).toString('hex')}@walkin.jancare.in`,
          password: randomBytes(18).toString('hex'), phone, age: Math.max(1, Math.min(100, Math.round(age))), gender: b.gender,
          walkIn: true, preferredLanguage: b.language === 'hi' ? 'hi' : 'en' });
      }
      const today = localDateString();
      const appt = await Appointment.create({
        ticketId: randomUUID(), patientEmail: user.email, patientName: name, patientAge: age, patientGender: b.gender,
        department, date: today, timeSlot: currentSlot(), status: 'Checked In', checkedInAt: new Date(),
        tokenNumber: await nextToken(department, today), source: 'walk-in', symptoms, aiTriage,
      });
      await notify(user, appt, 'walkin');
      res.status(201).json({ token: appt.tokenNumber, department, timeSlot: appt.timeSlot, triage: aiTriage,
        emergency: Boolean(aiTriage?.emergency), appointmentId: appt._id });
    } catch (e) {
      console.error('Walk-in failed:', e);
      res.status(500).json({ error: 'Walk-in registration failed' });
    }
  });

  // ================= ANALYTICS =================
  R.get('/api/admin/analytics', adminProtect, async (req, res) => {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const from = localDateString(new Date(Date.now() - (days - 1) * 86400000));
    const to = localDateString();
    const appts = await Appointment.find({ date: { $gte: from, $lte: to } })
      .select('date timeSlot department status source checkedInAt admittedAt completedAt feedback doctorName').lean();
    const dates = [];
    for (let d = new Date(`${from}T00:00:00`); localDateString(d) <= to; d.setDate(d.getDate() + 1)) dates.push(localDateString(d));
    const attended = (a) => ['Checked In', 'In Progress', 'Completed'].includes(a.status);
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const daily = dates.map(date => {
      const day = appts.filter(a => a.date === date);
      const waits = day.filter(a => a.checkedInAt && a.admittedAt).map(a => (new Date(a.admittedAt) - new Date(a.checkedInAt)) / 60000).filter(w => w >= 0 && w < 480);
      return { date, online: day.filter(a => attended(a) && a.source !== 'walk-in').length, walkIn: day.filter(a => attended(a) && a.source === 'walk-in').length,
               noShows: day.filter(a => a.status === 'No-Show').length, avgWaitMin: avg(waits) };
    });
    const byDept = DEPARTMENTS.map(dept => {
      const d = appts.filter(a => a.department === dept);
      const closed = d.filter(a => ['Completed', 'No-Show'].includes(a.status));
      const rated = d.filter(a => a.feedback?.rating);
      return { department: dept, visits: d.filter(attended).length,
               noShowRate: closed.length ? Math.round(100 * d.filter(a => a.status === 'No-Show').length / closed.length) : null,
               avgRating: rated.length ? Math.round(10 * rated.reduce((s, a) => s + a.feedback.rating, 0) / rated.length) / 10 : null, ratings: rated.length };
    });
    // hourly pattern: share of the day's patients per slot - actual vs AI forecast for tomorrow
    const slotCounts = VALID_SLOTS.map(s => appts.filter(a => attended(a) && a.timeSlot === s).length);
    const slotTotal = slotCounts.reduce((s, n) => s + n, 0);
    const fc = Object.fromEntries(VALID_SLOTS.map(s => [s, 0]));
    try {
      const tomorrow = localDateString(new Date(Date.now() + 86400000));
      for (const dept of DEPARTMENTS) (await getCrowdPredictions(tomorrow, dept)).forEach(p => { if (p.time_slot in fc) fc[p.time_slot] += Number(p.predicted_patients) || 0; });
    } catch { /* forecast optional */ }
    const fcTotal = Object.values(fc).reduce((s, n) => s + n, 0);
    const hourly = VALID_SLOTS.map((s, i) => ({ slot: s.slice(0, 5), actualPct: slotTotal ? Math.round(1000 * slotCounts[i] / slotTotal) / 10 : 0,
                                                forecastPct: fcTotal ? Math.round(1000 * fc[s] / fcTotal) / 10 : 0 }));
    const doctors = Object.values(appts.filter(a => a.feedback?.rating && a.doctorName).reduce((m, a) => {
      (m[a.doctorName] ||= { doctor: a.doctorName, ratings: 0, sum: 0 }); m[a.doctorName].ratings++; m[a.doctorName].sum += a.feedback.rating; return m;
    }, {})).map(d => ({ doctor: d.doctor, ratings: d.ratings, avgRating: Math.round(10 * d.sum / d.ratings) / 10 })).sort((a, b) => b.avgRating - a.avgRating);
    const comments = appts.filter(a => a.feedback?.comment).sort((a, b) => new Date(b.feedback.at) - new Date(a.feedback.at)).slice(0, 6)
      .map(a => ({ date: a.date, department: a.department, rating: a.feedback.rating, comment: a.feedback.comment }));
    const symptomGroups = await TriageLog.aggregate([{ $match: { date: { $gte: from }, symptomGroup: { $ne: null } } }, { $group: { _id: '$symptomGroup', n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
    const closedAll = appts.filter(a => ['Completed', 'No-Show'].includes(a.status));
    const ratedAll = appts.filter(a => a.feedback?.rating);
    const allWaits = daily.map(d => d.avgWaitMin).filter(x => x !== null);
    res.json({ from, to, days,
      totals: { visits: appts.filter(attended).length, walkIns: appts.filter(a => attended(a) && a.source === 'walk-in').length,
                noShowRate: closedAll.length ? Math.round(100 * appts.filter(a => a.status === 'No-Show').length / closedAll.length) : null,
                avgWaitMin: avg(allWaits), avgRating: ratedAll.length ? Math.round(10 * ratedAll.reduce((s, a) => s + a.feedback.rating, 0) / ratedAll.length) / 10 : null,
                ratings: ratedAll.length },
      daily, byDept, hourly, doctors, comments, symptomGroups: symptomGroups.map(g => ({ group: g._id, count: g.n })) });
  });

  // ================= DEMO DATA =================
  R.get('/api/admin/demo', adminProtect, async (_req, res) => res.json({ loaded: (await User.countDocuments({ isDemo: true })) > 0,
    patients: await User.countDocuments({ isDemo: true }), appointments: await Appointment.countDocuments({ isDemo: true }) }));
  R.post('/api/admin/demo/load', adminProtect, async (_req, res) => {
    try {
      if (await User.countDocuments({ isDemo: true })) return res.status(409).json({ error: 'Demo data is already loaded. Clear it first.' });
      res.json(await loadDemoData({ DEPARTMENTS, VALID_SLOTS, localDateString, mlPost }));
    } catch (e) {
      console.error('Demo data failed:', e);
      res.status(500).json({ error: `Demo data failed: ${e.message}` });
    }
  });
  R.delete('/api/admin/demo', adminProtect, async (_req, res) => {
    try { res.json(await clearDemoData()); }
    catch (e) { res.status(500).json({ error: `Clearing failed: ${e.message}` }); }
  });
}

