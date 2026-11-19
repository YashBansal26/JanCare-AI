import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import Appointment from './models/Appointment.js';
import User from './models/User.js';
import { getCrowdPredictions, getTriage, getNoShowRisk, getAiMetrics, mlPost } from './services/mlService.js';
import TriageLog from './models/TriageLog.js';
import LabReport from './models/LabReport.js';
import LabOrder from './models/LabOrder.js';
import { makeNotifier } from './services/messages.js';
import { registerExtras } from './routes/extras.js';
import { protect } from './middleware/authMiddleware.js';
import { adminProtect } from './middleware/adminAuthMiddleware.js';
import { sendBookingConfirmation, logDemoNotification } from './services/messagingService.js';
import Admin from './models/Admin.js';
import Doctor from './models/Doctor.js';
import { doctorProtect } from './middleware/doctorAuthMiddleware.js';
import Notification from './models/Notification.js';
import { randomUUID } from 'node:crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hackathon_opd';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be set in backend/.env and contain at least 32 characters.');
  process.exit(1);
}

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin.includes('vercel.app') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
// Small JSON bodies everywhere; up to 8 MB only for lab-report uploads (base64 file)
const smallJson = express.json();
const uploadJson = express.json({ limit: '8mb' });
app.use((req, res, next) => (req.method === 'POST' && /\/reports$/.test(req.path) ? uploadJson : smallJson)(req, res, next));

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected to', MONGO_URI))
  .catch(err => console.error('MongoDB Connection Error:', err));

const localDateString = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// AI pre-visit summary saved with the booking, so the doctor sees it in the queue
async function triageForBooking(symptoms) {
  if (!symptoms) return null;
  try {
    const t = await getTriage(symptoms, 0);
    return { department: t.department, confidence: t.confidence, urgency: t.urgency, emergency: t.emergency };
  } catch { return null; }
}

// Generate Token
const generateToken = (id, role = 'patient') => jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '12h' });

// --- AUTH ROUTES ---

app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, phone, age, gender } = req.body;
  if (!username || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || !/^\d{10}$/.test(String(phone || '')) || !Number.isInteger(Number(age)) || Number(age) < 1 || Number(age) > 100 || !['Male', 'Female', 'Other'].includes(gender)) {
    return res.status(400).json({ error: 'Enter a valid name, email, 10-digit phone, password (at least 8 characters), age and gender.' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) return res.status(400).json({ error: 'User already exists' });

    const user = await User.create({ username: username.trim(), email: normalizedEmail, password, phone, age: Number(age), gender });
    if (user) {
      res.status(201).json({
        _id: user.id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id)
      });
    } else {
      res.status(400).json({ error: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid credentials' });

  try {
    const user = await User.findOne({
      $or: [
        { email: email },
        { phone: email }
      ]
    });
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user.id,
        email: user.email,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin accounts are created using `npm run create-admin`; public signup is disabled.
app.post('/api/auth/admin/register', (_req, res) => res.status(403).json({ error: 'Public staff registration is disabled. Ask the system administrator to create an account.' }));

// Admin Login
app.post('/api/auth/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid admin credentials' });

  try {
    const admin = await Admin.findOne({ email });
    if (admin && (await admin.matchPassword(password))) {
      res.json({
        _id: admin.id,
        email: admin.email,
        employeeId: admin.employeeId,
        token: generateToken(admin._id, 'admin')
      });
    } else {
      res.status(401).json({ error: 'Invalid admin credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- API ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// AI symptom triage: suggests a department and flags emergencies
app.post('/api/triage', protect, async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 500) : '';
  const pain = Math.max(0, Math.min(10, parseInt(req.body.pain, 10) || 0));
  try {
    const result = await getTriage(text, pain);
    res.json(result);
    // anonymous log for outbreak detection (no text stored); never blocks the response
    mlPost('/symptom-group', { text }).then(({ group }) => TriageLog.create({
      date: localDateString(), department: result.department, urgency: result.urgency, emergency: result.emergency, symptomGroup: group
    })).catch(() => {});
  }
  catch (error) { res.status(error.status || 503).json({ error: error.message }); }
});

// Get predictions for a given date and department
app.get('/api/predictions', protect, async (req, res) => {
  const { date, department } = req.query;
  
  if (!date || !department || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date and department are required' });
  }

  try {
    const rawPredictions = await getCrowdPredictions(date, department);
    
    // HARD LIMIT: Maximum people a single department can see per hour
    const MAX_CAPACITY = 80;

    // Fetch actual real-time MongoDB bookings for this specific date and department
    const actualBookings = await Appointment.find({ date, department, status: { $nin: ['Cancelled', 'No-Show'] } });

    // Fuse Machine Learning Walk-in predictions with Actual Database Data
    const enhancedSlots = rawPredictions.map(slot => {
        // Count real reservations
        const realBookingsCount = actualBookings.filter(b => b.timeSlot === slot.time_slot).length;
        
        // Final Remaining Math: Total Capacity minus (WalkIns + DB Bookings)
        let remainingSeats = Math.max(0, MAX_CAPACITY - Math.max(0, Number(slot.predicted_patients) || 0) - realBookingsCount);
        
        let severity_color = remainingSeats <= 0 ? 'Red' : (remainingSeats <= 25 || slot.predicted_patients >= 55 ? 'Yellow' : 'Green');
        let severity_label = remainingSeats <= 0 ? 'Full' : (severity_color === 'Yellow' ? 'Moderate crowd' : 'Lower crowd');
        
        if (remainingSeats <= 0) {
            remainingSeats = 0;
            severity_color = "Red";
            severity_label = "Waitlist Only";
        } else if (remainingSeats <= 25) {
            severity_color = "Yellow";
            severity_label = "Filling Fast";
        }

        return { ...slot, remainingSeats, severity_color, severity_label };
    });

    res.json({ date, department, slots: enhancedSlots });
  } catch (error) {
    console.error('Prediction route error:', error.message);
    res.status(error.status || 503).json({ error: error.message || 'Failed to fetch predictions' });
  }
});

// A process-local lock prevents two simultaneous demo requests taking the same final place.
// For multi-instance production deployment, replace with a MongoDB transaction/slot inventory.
const slotLocks = new Map();
async function withSlotLock(key, work) {
  const previous = slotLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const chain = previous.then(() => current);
  slotLocks.set(key, chain);
  await previous;
  try { return await work(); }
  finally { release(); if (slotLocks.get(key) === chain) slotLocks.delete(key); }
}
const notify = makeNotifier(Notification);
const DEPARTMENTS = ['Orthopedics', 'Pediatrics', 'Cardiology', 'Dermatology', 'Neurology', 'General Medicine'];
const VALID_SLOTS = ['08:00 - 09:00', '09:00 - 10:00', '10:00 - 11:00', '11:00 - 12:00', '12:00 - 13:00', '14:00 - 15:00', '15:00 - 16:00', '16:00 - 17:00'];
const MAX_CAPACITY = 80;

app.post('/api/appointments', protect, async (req, res) => {
  const { department, date, timeSlot } = req.body;
  const symptoms = typeof req.body.symptoms === 'string' ? req.body.symptoms.trim().slice(0, 500) : '';
  const forMember = typeof req.body.forMember === 'string' && req.body.forMember ? req.body.forMember : null;
  if (!DEPARTMENTS.includes(department) || !VALID_SLOTS.includes(timeSlot) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Choose a valid department, date and time slot.' });
  }
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (date < todayString) return res.status(400).json({ error: 'Appointments cannot be booked for a past date.' });
  const [hour, minute] = timeSlot.split(' - ')[0].split(':').map(Number);
  if (date === todayString && (hour < today.getHours() || (hour === today.getHours() && minute <= today.getMinutes()))) {
    return res.status(400).json({ error: 'This time slot has already started. Please select a future slot.' });
  }
  const lockKey = `${department}|${date}|${timeSlot}`;
  try {
    const result = await withSlotLock(lockKey, async () => {
      const member = forMember ? req.user.familyMembers?.id(forMember) : null;
      if (forMember && !member) return { error: 'Family member not found.', status: 400 };
      const duplicate = await Appointment.findOne({ patientEmail: req.user.email, familyMemberId: member ? member._id : null, department, date, status: { $nin: ['Cancelled', 'No-Show'] } });
      if (duplicate) return { error: `You already have an appointment in ${department} on this date (${duplicate.timeSlot}).`, status: 409 };
      const predictions = await getCrowdPredictions(date, department);
      const prediction = predictions.find(item => item.time_slot === timeSlot);
      if (!prediction) return { error: 'Prediction for this slot is unavailable. Please try again.', status: 503 };
      const activeBookings = await Appointment.countDocuments({ department, date, timeSlot, status: { $nin: ['Cancelled', 'No-Show'] } });
      const remaining = MAX_CAPACITY - Math.max(0, Number(prediction.predicted_patients) || 0) - activeBookings;
      if (remaining <= 0) return { error: 'This slot is full. Please choose another available slot.', status: 409 };
      const user = await User.findById(req.user._id);
      if (!user) return { error: 'Patient account not found.', status: 401 };
      const appointment = await Appointment.create({
        ticketId: randomUUID(), patientEmail: user.email,
        patientName: member ? member.name : user.username,
        patientAge: member ? member.age : user.age, patientGender: member ? member.gender : user.gender,
        familyMemberId: member ? member._id : null, department, date, timeSlot,
        symptoms, aiTriage: await triageForBooking(symptoms)
      });
      await notify(user, appointment, 'booking');
      return { appointment };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ message: 'Appointment booked successfully', appointment: result.appointment });
  } catch (error) {
    console.error('Booking error:', error);
    return res.status(500).json({ error: 'Failed to book appointment. Please try again.' });
  }
});

// Get user appointments with LIVE Queue Math + Estimated Wait Time
async function appointmentsWithQueueFor(email) {
    const rawAppointments = await Appointment.find({ patientEmail: email }).sort({ createdAt: -1 });
    
    const AVG_CONSULT_MINUTES = 8; // fallback if the AI wait-time service is unavailable
    const returningPatients = new Set(await Appointment.distinct('patientEmail', { status: 'Completed' }));

    const appointmentsWithQueue = await Promise.all(rawAppointments.map(async (appt) => {
      let peopleAhead = 0;
      let estimatedWaitMinutes = 0;
      let estimatedWaitRange = null;
      if (['Scheduled', 'Checked In'].includes(appt.status)) {
         // Everyone ahead in the same department, date and slot
         const ahead = await Appointment.find({
            department: appt.department,
            date: appt.date,
            timeSlot: appt.timeSlot,
            _id: { $ne: appt._id },
            $or: [
              { status: 'In Progress' },
              { status: 'Checked In', checkedInAt: { $lt: appt.checkedInAt || new Date() } },
              { status: 'Scheduled', createdAt: { $lt: appt.createdAt }, timeSlot: appt.timeSlot }
            ]
         }).select('patientAge patientEmail').lean();
         peopleAhead = ahead.length;
         estimatedWaitMinutes = peopleAhead * AVG_CONSULT_MINUTES;
         if (peopleAhead > 0) {
           try {
             // AI: predicted consultation length for each patient ahead (department, hour, age, first visit)
             const w = await mlPost('/wait-time', {
               department: appt.department, hour: parseInt(appt.timeSlot, 10) || 9,
               doctor_on_break: doctorAvailability[appt.department]?.available === false,
               ahead: ahead.map(a => ({ age: a.patientAge ?? null, first_visit: returningPatients.has(a.patientEmail) ? 0 : 1 }))
             }, 3000);
             estimatedWaitMinutes = w.minutes;
             estimatedWaitRange = { low: w.low, high: w.high };
           } catch { /* keep the simple estimate */ }
         }
      } else if (appt.status === 'In Progress') {
         estimatedWaitMinutes = 0; // Currently being served
      }
      const { doctorNotes, ...visible } = appt.toObject(); // consultation notes are private to doctors
      return { ...visible, peopleAhead, estimatedWaitMinutes, estimatedWaitRange };
    }));

    return appointmentsWithQueue;
}

app.get('/api/appointments', protect, async (req, res) => {
  try {
    const appointmentsWithQueue = await appointmentsWithQueueFor(req.user.email);
    res.json(appointmentsWithQueue);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Cancel appointment (Patient-side) + Return slot recommendation
app.delete('/api/appointments/:id', protect, async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ _id: req.params.id, patientEmail: req.user.email });
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    if (['Completed', 'In Progress', 'Cancelled', 'No-Show'].includes(appointment.status)) return res.status(400).json({ error: `Cannot cancel an appointment with status ${appointment.status}.` });
    appointment.status = 'Cancelled'; appointment.cancelledAt = new Date(); await appointment.save();
    const cancelUser = await User.findOne({ email: req.user.email });
    await notify(cancelUser, appointment, 'cancel');

    // Smart Recommendation: Find the best alternative green slot
    let recommendedSlot = null;
    try {
      const predictions = await getCrowdPredictions(appointment.date, appointment.department);
      const actualBookings = await Appointment.find({ date: appointment.date, department: appointment.department, status: { $ne: 'Cancelled' } });
      const MAX_CAPACITY = 80;
      
      const available = predictions
        .map(slot => {
          const booked = actualBookings.filter(b => b.timeSlot === slot.time_slot).length;
          const remaining = MAX_CAPACITY - (slot.predicted_patients + booked);
          return { ...slot, remaining };
        })
        .filter(s => s.remaining > 25 && s.time_slot !== appointment.timeSlot)
        .sort((a, b) => b.remaining - a.remaining);
      
      if (available.length > 0) recommendedSlot = available[0];
    } catch (e) { /* slot recommendation is best-effort */ }

    res.json({ message: 'Appointment cancelled successfully', recommendedSlot });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel appointment' });
  }
});

// Patient notification history.
app.get('/api/notifications', protect, async (req, res) => {
  try { res.json(await Notification.find({ patientEmail: req.user.email }).sort({ createdAt: -1 }).limit(100)); }
  catch (error) { console.error(error); res.status(500).json({ error: 'Failed to load notifications' }); }
});

// Staff ticket lookup/scan endpoint. QR should contain only the opaque ticketId.
app.get('/api/admin/tickets/:ticketId', adminProtect, async (req, res) => {
  try {
    // Accept: full ticket UUID, Mongo _id (older QR codes), 8-char SMS code, or 6-char profile ID.
    const raw = String(req.params.ticketId || '').trim().replace(/^#/, '').replace(/^.*\/verify\//, '').split('?')[0];
    const input = raw.toLowerCase();
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let matches = [];
    if (/^[0-9a-f-]{36}$/.test(input)) {
      matches = await Appointment.find({ ticketId: input }).limit(2);
    } else if (/^[0-9a-f]{24}$/.test(input)) {
      matches = await Appointment.find({ _id: input }).limit(2);
    } else if (/^[0-9a-f]{6,8}$/.test(input)) {
      matches = await Appointment.find({ $or: [
        { ticketId: { $regex: '^' + esc(input) } },
        { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: esc(input) + '$' } } }
      ] }).limit(2);
    }
    if (matches.length > 1) return res.status(409).json({ error: 'Short code matches more than one ticket. Please scan the QR or paste the full ticket ID.' });
    const appointment = matches[0];
    if (!appointment) return res.status(404).json({ error: 'Ticket not found' });
    if (appointment.status === 'Cancelled') return res.status(409).json({ error: 'This ticket has been cancelled.', appointment });
    res.json({ appointment });
  } catch (error) { res.status(500).json({ error: 'Could not verify ticket' }); }
});

// --- DOCTOR AVAILABILITY (In-memory for hackathon) ---
const doctorAvailability = {};
// Format: { "Cardiology": { available: true, breakSince: null } }

app.get('/api/admin/doctor-status', adminProtect, (req, res) => {
  res.json(doctorAvailability);
});

app.put('/api/admin/doctor-status/:department', adminProtect, (req, res) => {
  const { department } = req.params;
  const { available } = req.body;
  
  doctorAvailability[department] = {
    available: available,
    breakSince: available ? null : new Date().toISOString()
  };
  
  console.log(`[Doctor Toggle] ${department}: ${available ? 'AVAILABLE' : 'ON BREAK'}`);
  res.json({ department, ...doctorAvailability[department] });
});

// Patient-side: check doctor status
app.get('/api/doctor-status', protect, (req, res) => {
  res.json(doctorAvailability);
});

// --- ADMIN: Queue Transfer ---
app.put('/api/admin/appointments/:id/transfer', adminProtect, async (req, res) => {
  const { newDepartment } = req.body;
  if (!newDepartment) return res.status(400).json({ error: 'New department is required' });
  
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    
    const oldDept = appointment.department;
    appointment.department = newDepartment;
    appointment.status = 'Scheduled'; // Reset to scheduled in new dept
    await appointment.save();
    
    console.log(`[Queue Transfer] ${oldDept} → ${newDepartment} for ${appointment._id}`);
    res.json({ message: `Transferred from ${oldDept} to ${newDepartment}`, appointment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to transfer appointment' });
  }
});

// --- ADMIN: No-Show Auto-Skip ---
app.post('/api/admin/no-show-check', adminProtect, async (req, res) => {
  try {
    const NO_SHOW_MINUTES = 10;
    const cutoff = new Date(Date.now() - NO_SHOW_MINUTES * 60 * 1000);
    
    // Find appointments that were admitted but haven't progressed
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const noShows = await Appointment.find({
      status: 'Scheduled',
      createdAt: { $lt: cutoff },
      date: localToday
    });
    
    const skippedIds = [];
    for (const appt of noShows) {
      // Check if there are admitted patients in same dept/slot who finished,
      // meaning this patient was "next" but never showed
      const laterPatients = await Appointment.countDocuments({
        department: appt.department,
        date: appt.date,
        timeSlot: appt.timeSlot,
        status: { $in: ['In Progress', 'Completed'] },
        createdAt: { $gt: appt.createdAt }
      });
      
      if (laterPatients > 0) {
        await Appointment.findByIdAndUpdate(appt._id, { status: 'No-Show' });
        skippedIds.push(appt._id);
      }
    }
    
    res.json({ message: `Marked ${skippedIds.length} no-shows`, skippedIds });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check no-shows' });
  }
});

// --- AI helpers: features for the no-show model, built from JanCare's own history ---
const slotHour = (timeSlot) => parseInt(String(timeSlot).slice(0, 2), 10) || 9;
const leadTimeDays = (appt) => Math.max(0, (new Date(`${appt.date}T00:00:00`) - new Date(appt.createdAt)) / 86400000);

function patientHistoryIndex(appointments) {
  // patientEmail -> list of finished visits (Completed / No-Show) with their dates
  const index = new Map();
  for (const a of appointments) {
    if (!['Completed', 'No-Show'].includes(a.status)) continue;
    if (!index.has(a.patientEmail)) index.set(a.patientEmail, []);
    index.get(a.patientEmail).push({ date: a.date, noShow: a.status === 'No-Show' });
  }
  return index;
}

function noShowFeatures(appt, index) {
  const past = (index.get(appt.patientEmail) || []).filter(v => v.date < appt.date);
  return {
    id: String(appt._id), date: appt.date, hour: slotHour(appt.timeSlot), department: appt.department,
    age: appt.patientAge ?? null, lead_time_days: Math.round(leadTimeDays(appt) * 10) / 10,
    prior_appointments: past.length, prior_no_shows: past.filter(v => v.noShow).length
  };
}

// Admin Route: Get ALL appointments across the hospital (+ AI no-show risk for upcoming ones)
app.get('/api/admin/appointments', adminProtect, async (req, res) => {
  try {
    const appointments = await Appointment.find({}).sort({ createdAt: -1 }).lean();
    const today = localDateString();
    const index = patientHistoryIndex(appointments);
    const upcoming = appointments.filter(a => a.status === 'Scheduled' && a.date >= today);
    const risk = await getNoShowRisk(upcoming.map(a => noShowFeatures(a, index)));
    res.json(appointments.map(a => (risk[String(a._id)] ? { ...a, noShowRisk: risk[String(a._id)] } : a)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch all appointments' });
  }
});

// Admin Route: send an extra (simulated) reminder to a patient flagged as likely no-show
app.post('/api/admin/appointments/:id/remind', adminProtect, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment || appointment.status !== 'Scheduled') return res.status(404).json({ error: 'Scheduled appointment not found' });
    const patient = await User.findOne({ email: appointment.patientEmail });
    await notify(patient, appointment, 'reminder');
    res.json({ message: 'Reminder sent (simulated SMS)' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// Admin Route: evaluation results of all AI models
app.get('/api/admin/ai/metrics', adminProtect, async (_req, res) => {
  try { res.json(await getAiMetrics()); }
  catch (error) { res.status(503).json({ error: 'AI service unavailable' }); }
});

// Admin Route: export JanCare's real history as CSV so the models can be retrained on it.
// Save as ml_service/data/live_opd.csv / live_noshow.csv, then run train_model.py / noshow.py.
const toCsv = (header, rows) => [header.join(','), ...rows.map(r => header.map(h => r[h] ?? '').join(','))].join('\n');

app.get('/api/admin/ai/export/:kind', adminProtect, async (req, res) => {
  try {
    const appointments = await Appointment.find({}).lean();
    const today = localDateString();
    let csv;
    if (req.params.kind === 'opd') {
      // attended patients per date / hour / department
      const counts = new Map();
      for (const a of appointments) {
        if (!['Checked In', 'In Progress', 'Completed'].includes(a.status) || a.date >= today) continue;
        const key = `${a.date}|${slotHour(a.timeSlot)}|${a.department}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const rows = [...counts].map(([k, n]) => { const [date, hour, department] = k.split('|'); return { date, hour, department, patient_count: n }; });
      csv = toCsv(['date', 'hour', 'department', 'patient_count'], rows);
    } else if (req.params.kind === 'noshow') {
      const index = patientHistoryIndex(appointments);
      const rows = appointments.filter(a => ['Completed', 'No-Show'].includes(a.status))
        .map(a => ({ ...noShowFeatures(a, index), no_show: a.status === 'No-Show' ? 1 : 0, id: undefined }));
      csv = toCsv(['date', 'hour', 'department', 'age', 'lead_time_days', 'prior_appointments', 'prior_no_shows', 'no_show'], rows);
    } else if (req.params.kind === 'consults') {
      // real consultation durations for the wait-time model
      const completed = new Set();
      const rows = appointments.filter(a => a.status === 'Completed' && a.admittedAt && a.completedAt)
        .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
        .map(a => {
          const first = completed.has(a.patientEmail) ? 0 : 1;
          completed.add(a.patientEmail);
          return { department: a.department, hour: slotHour(a.timeSlot), age: a.patientAge ?? '', first_visit: first,
                   duration_min: Math.round((new Date(a.completedAt) - new Date(a.admittedAt)) / 6000) / 10 };
        }).filter(r => r.duration_min > 0 && r.duration_min < 120);
      csv = toCsv(['department', 'hour', 'age', 'first_visit', 'duration_min'], rows);
    } else {
      return res.status(400).json({ error: 'Unknown export. Use opd, noshow or consults.' });
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="live_${req.params.kind}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// Admin Route: Update appointment status (Advance Queue)
// Shared by staff and doctor dashboards: validates and applies a queue status change
const ALLOWED_STATUSES = ['Checked In', 'In Progress', 'Completed', 'Cancelled', 'No-Show', 'Scheduled'];
const STATUS_TRANSITIONS = {
  'Scheduled': ['Checked In', 'Cancelled', 'No-Show'],
  'Checked In': ['In Progress', 'Cancelled', 'No-Show'],
  'In Progress': ['Completed'],
  'Completed': [], 'Cancelled': [], 'No-Show': []
};
// Daily token per department, handed out at check-in (shown on the waiting-hall screen)
async function nextToken(department, date) {
  const last = await Appointment.findOne({ department, date, tokenNumber: { $ne: null } }).sort({ tokenNumber: -1 }).select('tokenNumber').lean();
  return (last?.tokenNumber || 0) + 1;
}

async function changeAppointmentStatus(appointment, status) {
  if (!ALLOWED_STATUSES.includes(status)) return { error: 'Invalid appointment status.', code: 400 };
  if (status !== appointment.status && !STATUS_TRANSITIONS[appointment.status]?.includes(status)) {
    return { error: `Invalid status change: ${appointment.status} → ${status}.`, code: 409 };
  }
  if (['Checked In', 'In Progress'].includes(status)) {
    if (appointment.date !== localDateString()) return { error: 'Patients can only be checked in on the appointment date.', code: 400 };
    if (status === 'Checked In' && !appointment.checkedInAt) appointment.checkedInAt = new Date();
    if (status === 'Checked In' && !appointment.tokenNumber) appointment.tokenNumber = await nextToken(appointment.department, appointment.date);
    if (status === 'In Progress' && !appointment.admittedAt) appointment.admittedAt = new Date();
  }
  if (status === 'Completed') appointment.completedAt = new Date();
  if (status === 'Cancelled') appointment.cancelledAt = new Date();
  appointment.status = status;
  await appointment.save();
  const patient = await User.findOne({ email: appointment.patientEmail });
  if (status === 'Checked In') await notify(patient, appointment, 'checkin');
  else if (status === 'In Progress') await notify(patient, appointment, 'turn', { doctor: appointment.doctorName, room: appointment.room });
  else await notify(patient, appointment, 'status', { status });
  return { appointment };
}

// Admin Route: Update appointment status (Advance Queue)
app.put('/api/admin/appointments/:id/status', adminProtect, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    const r = await changeAppointmentStatus(appointment, req.body.status);
    if (r.error) return res.status(r.code).json({ error: r.error });
    res.json(r.appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ===================== DOCTORS =====================
const DOCTOR_FIELDS = ['name', 'department', 'qualification', 'specialization', 'experienceYears', 'room', 'opdDays', 'opdTimings', 'languages', 'about', 'active'];
const pickDoctorFields = (body) => Object.fromEntries(DOCTOR_FIELDS.filter(k => body[k] !== undefined).map(k => [k, body[k]]));

app.post('/api/auth/doctor/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid credentials' });
  try {
    const doctor = await Doctor.findOne({ email: email.trim().toLowerCase() });
    if (!doctor || !doctor.active || !(await doctor.matchPassword(password))) return res.status(401).json({ error: 'Invalid doctor credentials' });
    res.json({ token: generateToken(doctor._id, 'doctor'), doctor: { ...doctor.publicProfile(), email: doctor.email } });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Patients: doctor details (optionally for one department)
app.get('/api/doctors', protect, async (req, res) => {
  const filter = { active: true };
  if (DEPARTMENTS.includes(req.query.department)) filter.department = req.query.department;
  const doctors = await Doctor.find(filter).sort({ department: 1, name: 1 });
  res.json(doctors.map(d => ({ ...d.publicProfile(), onBreak: doctorAvailability[d.department]?.available === false })));
});

// Staff: manage doctors
app.get('/api/admin/doctors', adminProtect, async (_req, res) => {
  const doctors = await Doctor.find({}).select('-password').sort({ department: 1, name: 1 });
  res.json(doctors);
});

app.post('/api/admin/doctors', adminProtect, async (req, res) => {
  const { email, password } = req.body;
  if (!DEPARTMENTS.includes(req.body.department)) return res.status(400).json({ error: 'Choose a valid department.' });
  if (!req.body.name?.trim() || typeof email !== 'string' || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Name, email and a password of at least 8 characters are required.' });
  }
  try {
    if (await Doctor.findOne({ email: email.trim().toLowerCase() })) return res.status(409).json({ error: 'A doctor with this email already exists.' });
    const doctor = await Doctor.create({ ...pickDoctorFields(req.body), email, password });
    res.status(201).json({ ...doctor.toObject(), password: undefined });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/doctors/:id', adminProtect, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    if (req.body.department && !DEPARTMENTS.includes(req.body.department)) return res.status(400).json({ error: 'Choose a valid department.' });
    Object.assign(doctor, pickDoctorFields(req.body));
    if (typeof req.body.password === 'string' && req.body.password.length >= 8) doctor.password = req.body.password;
    await doctor.save();
    res.json({ ...doctor.toObject(), password: undefined });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Allergies / conditions / ABHA of the person the visit is for (account holder or family member)
function healthFor(user, familyMemberId) {
  if (!user) return { allergies: [], conditions: [], abhaId: '', bloodGroup: '' };
  const m = familyMemberId ? (user.familyMembers || []).find(f => String(f._id) === String(familyMemberId)) : null;
  if (m) return { allergies: m.allergies || [], conditions: m.conditions || [], abhaId: m.abhaId || '', bloodGroup: '', relation: m.relation };
  return { allergies: user.healthProfile?.allergies || [], conditions: user.healthProfile?.conditions || [], abhaId: user.healthProfile?.abhaId || '', bloodGroup: user.healthProfile?.bloodGroup || '' };
}

// Doctor: own profile
app.get('/api/doctor/me', doctorProtect, (req, res) => {
  res.json({ ...req.doctor.publicProfile(), email: req.doctor.email, onBreak: doctorAvailability[req.doctor.department]?.available === false });
});

// Doctor: today's queue for their department, with patient history + AI summary
app.get('/api/doctor/queue', doctorProtect, async (req, res) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : localDateString();
    const dept = req.doctor.department;
    const todays = await Appointment.find({ department: dept, date }).lean();
    const emails = [...new Set(todays.map(a => a.patientEmail))];
    const [history, users] = await Promise.all([
      Appointment.find({ patientEmail: { $in: emails }, date: { $lt: date }, status: { $in: ['Completed', 'No-Show'] } })
        .sort({ date: -1 }).select('patientEmail date department status doctorNotes doctorName').lean(),
      User.find({ email: { $in: emails } }).select('email phone username age gender healthProfile familyMembers').lean()
    ]);
    const userBy = Object.fromEntries(users.map(u => [u.email, u]));
    const urgencyRank = { Emergency: 0, Urgent: 1, Routine: 2 };
    const statusRank = { 'In Progress': 0, 'Checked In': 1, 'Scheduled': 2, 'Completed': 3, 'No-Show': 4, 'Cancelled': 5 };
    // Queue order: status, then time slot, then AI urgency (urgent patients first within a slot), then check-in time
    const queue = todays.map(a => {
      const past = history.filter(h => h.patientEmail === a.patientEmail);
      return {
        ...a,
        patientPhone: userBy[a.patientEmail]?.phone || '',
        health: healthFor(userBy[a.patientEmail], a.familyMemberId),
        history: { visits: past.filter(h => h.status === 'Completed').length, noShows: past.filter(h => h.status === 'No-Show').length, recent: past.slice(0, 3) },
      };
    }).sort((x, y) => (statusRank[x.status] - statusRank[y.status]) || x.timeSlot.localeCompare(y.timeSlot)
      || ((urgencyRank[x.aiTriage?.urgency] ?? 2) - (urgencyRank[y.aiTriage?.urgency] ?? 2))
      || (new Date(x.checkedInAt || x.createdAt) - new Date(y.checkedInAt || y.createdAt)));

    // AI: no-show risk for patients not yet arrived
    const index = patientHistoryIndex(await Appointment.find({ patientEmail: { $in: emails } }).select('patientEmail date status').lean());
    const risk = await getNoShowRisk(queue.filter(a => a.status === 'Scheduled').map(a => noShowFeatures(a, index)));
    queue.forEach(a => { if (risk[String(a._id)]) a.noShowRisk = risk[String(a._id)]; });

    // stats + AI crowd forecast for the day
    const done = todays.filter(a => a.status === 'Completed' && a.admittedAt && a.completedAt);
    const avgConsult = done.length ? Math.round(done.reduce((s, a) => s + (new Date(a.completedAt) - new Date(a.admittedAt)), 0) / done.length / 60000) : null;
    let forecast = [];
    try { forecast = (await getCrowdPredictions(date, dept)).map(p => ({ time_slot: p.time_slot, predicted_patients: p.predicted_patients })); } catch { /* optional */ }
    res.json({
      date, department: dept, queue, forecast,
      stats: {
        total: todays.filter(a => a.status !== 'Cancelled').length,
        waiting: todays.filter(a => a.status === 'Checked In').length,
        notArrived: todays.filter(a => a.status === 'Scheduled').length,
        seen: todays.filter(a => a.status === 'Completed').length,
        noShows: todays.filter(a => a.status === 'No-Show').length,
        urgent: todays.filter(a => ['Urgent', 'Emergency'].includes(a.aiTriage?.urgency) && !['Completed', 'Cancelled', 'No-Show'].includes(a.status)).length,
        avgConsultMinutes: avgConsult
      }
    });
  } catch (error) {
    console.error('Doctor queue error:', error);
    res.status(500).json({ error: 'Failed to load queue' });
  }
});

// Doctor: move a patient through the queue (call in, complete, no-show)
app.put('/api/doctor/appointments/:id/status', doctorProtect, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment || appointment.department !== req.doctor.department) return res.status(404).json({ error: 'Appointment not found in your department' });
    if (!['In Progress', 'Completed', 'No-Show', 'Checked In'].includes(req.body.status)) return res.status(400).json({ error: 'Doctors can check in, start, complete or mark no-show.' });
    if (req.body.status === 'In Progress') {
      const busy = await Appointment.findOne({ department: appointment.department, date: appointment.date, status: 'In Progress', doctorId: req.doctor._id });
      if (busy && String(busy._id) !== String(appointment._id)) return res.status(409).json({ error: `Finish ${busy.patientName} before calling the next patient.` });
      appointment.doctorId = req.doctor._id;
      appointment.doctorName = req.doctor.name;
      appointment.room = req.doctor.room;
    }
    if (req.body.status === 'Completed' && typeof req.body.notes === 'string') appointment.doctorNotes = req.body.notes.slice(0, 2000);
    if (req.body.status === 'Completed' && typeof req.body.advice === 'string') appointment.advice = req.body.advice.slice(0, 1000);
    if (req.body.status === 'Completed' && req.body.prescription) appointment.prescription = cleanPrescription(req.body.prescription);
    const r = await changeAppointmentStatus(appointment, req.body.status);
    if (r.error) return res.status(r.code).json({ error: r.error });
    if (req.body.status === 'Completed') await syncLabOrders(r.appointment);
    res.json(r.appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Doctor: save consultation notes without completing
app.put('/api/doctor/appointments/:id/notes', doctorProtect, async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment || appointment.department !== req.doctor.department) return res.status(404).json({ error: 'Appointment not found in your department' });
  if (typeof req.body.notes === 'string') appointment.doctorNotes = req.body.notes.slice(0, 2000);
  if (typeof req.body.advice === 'string') appointment.advice = req.body.advice.slice(0, 1000);
  if (req.body.prescription) appointment.prescription = cleanPrescription(req.body.prescription);
  try { await appointment.save(); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (appointment.status === 'Completed') await syncLabOrders(appointment);
  res.json({ message: 'Notes saved' });
});

// ===================== PRESCRIPTIONS & LAB REPORTS =====================
function cleanPrescription(p) {
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const medicines = (Array.isArray(p.medicines) ? p.medicines : []).slice(0, 20)
    .map(m => ({ name: str(m.name, 120), dose: str(m.dose, 20) || '1-0-1', timing: str(m.timing, 40) || 'After food',
                 days: Math.max(0, Math.min(365, parseInt(m.days, 10) || 0)), notes: str(m.notes, 200) }))
    .filter(m => m.name);
  const labTests = (Array.isArray(p.labTests) ? p.labTests : []).map(t => str(t, 80)).filter(Boolean).slice(0, 20);
  const fu = parseInt(p.followUpDays, 10);
  return { diagnosis: str(p.diagnosis, 300), medicines, labTests, followUpDays: Number.isFinite(fu) && fu > 0 ? Math.min(fu, 365) : null, writtenAt: new Date() };
}

const REPORT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
// After a report is stored: AI reading of the values, lab order -> Completed, patient message
async function afterReportSaved(report, appointment, body, data) {
  try {
    const analysis = await mlPost('/lab/analyze', {
      text: report.resultSummary || '', mimeType: report.mimeType, dataBase64: data.toString('base64'),
      sex: appointment.patientGender || '', age: appointment.patientAge ?? null
    }, 30000);
    report.analysis = analysis;
  } catch (e) {
    console.error('Lab report analysis unavailable:', e.message);
  }
  const sameTest = (o) => o.testName.trim().toLowerCase() === report.testName.trim().toLowerCase();
  const order = (body.labOrderId ? await LabOrder.findById(body.labOrderId) : null)
    || (await LabOrder.find({ appointmentId: appointment._id, status: { $ne: 'Cancelled' } })).find(sameTest);
  if (order) {
    order.status = 'Completed'; order.completedAt = new Date(); order.reportId = report._id;
    await order.save();
    report.labOrderId = order._id;
  }
  report.isDemo = Boolean(appointment.isDemo);
  await report.save();
  const patient = await User.findOne({ email: appointment.patientEmail });
  await notify(patient, appointment, 'report', { test: report.testName, summary: report.analysis?.summary_en, summaryHi: report.analysis?.summary_hi });
}

// Keep one lab order per test in the prescription (new tests -> Ordered; removed tests -> Cancelled if not started)
async function syncLabOrders(appointment) {
  const tests = appointment.prescription?.labTests || [];
  for (const testName of tests) {
    await LabOrder.updateOne(
      { appointmentId: appointment._id, testName },
      { $setOnInsert: { patientEmail: appointment.patientEmail, patientName: appointment.patientName, patientAge: appointment.patientAge,
        patientGender: appointment.patientGender, department: appointment.department, doctorName: appointment.doctorName,
        status: 'Ordered', isDemo: Boolean(appointment.isDemo) } },
      { upsert: true }
    );
  }
  await LabOrder.updateMany({ appointmentId: appointment._id, testName: { $nin: tests }, status: 'Ordered' }, { $set: { status: 'Cancelled' } });
}

async function saveLabReport(appointment, body, uploadedBy) {
  const { testName, fileName, mimeType, dataBase64, resultSummary } = body;
  if (typeof testName !== 'string' || !testName.trim()) return { error: 'Choose the test this report is for.', code: 400 };
  if (!REPORT_TYPES.includes(mimeType)) return { error: 'Upload a PDF or an image (PNG, JPG, WEBP).', code: 400 };
  if (typeof dataBase64 !== 'string' || !dataBase64) return { error: 'File is missing.', code: 400 };
  const data = Buffer.from(dataBase64.replace(/^data:[^,]+,/, ''), 'base64');
  if (data.length === 0 || data.length > 5 * 1024 * 1024) return { error: 'File must be smaller than 5 MB.', code: 400 };
  const report = await LabReport.create({
    appointmentId: appointment._id, patientEmail: appointment.patientEmail, testName: testName.trim().slice(0, 80),
    resultSummary: typeof resultSummary === 'string' ? resultSummary.slice(0, 500) : '',
    fileName: String(fileName || 'report').slice(0, 150), mimeType, size: data.length, data, uploadedBy
  });
  await afterReportSaved(report, appointment, body, data);
  const { data: _omit, ...meta } = report.toObject();
  return { report: meta };
}

const reportMeta = '-data';

// Doctor: list / upload / delete lab reports for a visit in their department
app.get('/api/doctor/appointments/:id/reports', doctorProtect, async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment || appointment.department !== req.doctor.department) return res.status(404).json({ error: 'Appointment not found in your department' });
  res.json(await LabReport.find({ appointmentId: appointment._id }).select(reportMeta).sort({ createdAt: -1 }));
});

app.post('/api/doctor/appointments/:id/reports', doctorProtect, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment || appointment.department !== req.doctor.department) return res.status(404).json({ error: 'Appointment not found in your department' });
    const r = await saveLabReport(appointment, req.body, req.doctor.name);
    if (r.error) return res.status(r.code).json({ error: r.error });
    res.status(201).json(r.report);
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.delete('/api/doctor/reports/:id', doctorProtect, async (req, res) => {
  const report = await LabReport.findById(req.params.id);
  const appointment = report && await Appointment.findById(report.appointmentId);
  if (!report || appointment?.department !== req.doctor.department) return res.status(404).json({ error: 'Report not found' });
  await report.deleteOne();
  res.json({ message: 'Report deleted' });
});

// Lab / front-desk staff can also upload reports
app.post('/api/admin/appointments/:id/reports', adminProtect, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
    const r = await saveLabReport(appointment, req.body, `Staff ${req.admin.employeeId}`);
    if (r.error) return res.status(r.code).json({ error: r.error });
    res.status(201).json(r.report);
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Patient: medical records = completed visits with prescription, advice and lab reports
app.get('/api/records', protect, async (req, res) => {
  try {
    const visits = await Appointment.find({ patientEmail: req.user.email, status: 'Completed' })
      .select('-doctorNotes').sort({ completedAt: -1, date: -1 }).lean();
    const reports = await LabReport.find({ patientEmail: req.user.email }).select(reportMeta).sort({ createdAt: -1 }).lean();
    const orders = await LabOrder.find({ patientEmail: req.user.email }).select('appointmentId testName status sampleCollectedAt completedAt').lean();
    const doctors = await Doctor.find({ _id: { $in: visits.map(v => v.doctorId).filter(Boolean) } }).select('name qualification department room').lean();
    const docBy = Object.fromEntries(doctors.map(d => [String(d._id), d]));
    res.json(visits.map(v => ({
      _id: v._id, date: v.date, timeSlot: v.timeSlot, department: v.department, completedAt: v.completedAt,
      ticketId: v.ticketId, patientName: v.patientName, patientAge: v.patientAge, patientGender: v.patientGender,
      doctor: v.doctorId ? docBy[String(v.doctorId)] || { name: v.doctorName } : (v.doctorName ? { name: v.doctorName } : null),
      symptoms: v.symptoms, advice: v.advice, prescription: v.prescription,
      followUpDate: v.prescription?.followUpDays ? localDateString(new Date(new Date(`${v.date}T00:00:00`).getTime() + v.prescription.followUpDays * 86400000)) : null,
      reports: reports.filter(r => String(r.appointmentId) === String(v._id)),
      labOrders: orders.filter(o => String(o.appointmentId) === String(v._id)),
      feedback: v.feedback || null, familyMemberId: v.familyMemberId || null,
      abhaId: healthFor(req.user, v.familyMemberId).abhaId
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to load records' });
  }
});

// Patient (own reports only) or doctor of that department: download the file
app.get('/api/records/reports/:id/file', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const decoded = jwt.verify(header.split(' ')[1] || '', JWT_SECRET);
    const report = await LabReport.findById(req.params.id).select('+data');
    if (!report) return res.status(404).json({ error: 'Report not found' });
    let allowed = false;
    if (decoded.role === 'doctor') {
      const [doctor, appt] = await Promise.all([Doctor.findById(decoded.id), Appointment.findById(report.appointmentId)]);
      allowed = Boolean(doctor && appt && doctor.department === appt.department);
    } else if (decoded.role === 'admin') {
      allowed = Boolean(await Admin.findById(decoded.id));
    } else if (decoded.role === 'lab') {
      const { default: LabStaff } = await import('./models/LabStaff.js');
      allowed = Boolean(await LabStaff.findById(decoded.id));
    } else {
      const user = await User.findById(decoded.id);
      allowed = Boolean(user && user.email === report.patientEmail);
    }
    if (!allowed) return res.status(403).json({ error: 'Not allowed' });
    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${report.fileName.replace(/[^\w.\- ]/g, '_')}"`);
    res.send(report.data);
  } catch {
    res.status(401).json({ error: 'Not authorized' });
  }
});

// Doctor: go on / return from break (pauses the department queue for patients)
app.put('/api/doctor/break', doctorProtect, (req, res) => {
  const available = Boolean(req.body.available);
  doctorAvailability[req.doctor.department] = { available, breakSince: available ? null : new Date().toISOString() };
  res.json({ department: req.doctor.department, ...doctorAvailability[req.doctor.department] });
});

// --- AI patient assistant (multilingual; answers from the patient's own data) ---
const ASSIST_TEXT = {
  en: {
    greeting: 'Namaste! I can tell you your appointment, queue position, waiting time, best time to visit, or which department to choose. Ask me anything about your OPD visit.',
    none: "You don't have any upcoming appointment. Use the Book Appointment tab to book one.",
    appt: (a) => `Your ${a.department} appointment is on ${a.date}, ${a.timeSlot}. Ticket: ${String(a.ticketId).slice(0, 8).toUpperCase()}.`,
    queue: (a) => a.peopleAhead > 0 ? `${a.peopleAhead} patient(s) are ahead of you in ${a.department}.` : `You are next in the ${a.department} queue!`,
    wait: (a) => a.peopleAhead > 0 ? `Estimated wait: ${a.estimatedWaitRange ? `${a.estimatedWaitRange.low}-${a.estimatedWaitRange.high}` : `about ${a.estimatedWaitMinutes}`} minutes (${a.peopleAhead} ahead).` : 'No one is ahead of you. Please be ready.',
    cancel: 'Open the My Profile tab and press Cancel on the appointment. Cancelling early frees the slot for another patient.',
    book: 'Open the Book Appointment tab, describe your symptoms to the AI helper, then pick a green slot.',
    best: (s) => s ? `Least crowded slot in ${s.dept} on ${s.date}: ${s.slot} (about ${s.n} patients expected).` : 'Afternoon slots (2-5 PM) are usually the least crowded. Mondays and 9-11 AM are the busiest.',
    timings: 'OPD runs 8 AM - 5 PM (lunch 1-2 PM), Monday to Saturday. Sundays and public holidays have reduced OPD. Emergency is open 24x7.',
    documents: 'Bring your JanCare QR ticket (on your phone is fine), any old prescriptions and test reports, and a list of your current medicines. Aadhaar is not required.',
    symptoms: (t) => `Based on what you described, ${t.department} looks right${t.low_confidence ? ' (I am not very sure, so General Medicine can also help)' : ''}. ${t.urgency === 'Urgent' ? 'Please book the earliest slot.' : 'You can book from the Book Appointment tab.'} This is not a diagnosis.`,
    emergency: '⚠️ This sounds like an emergency. Go to the Emergency Ward now or call 112 / 108. Do not wait for an OPD appointment.',
    thanks: "You're welcome! Get well soon.",
    unknown: 'Sorry, I can only help with JanCare appointments, queue, waiting time, timings and choosing a department.'
  },
  hi: {
    greeting: 'नमस्ते! मैं आपकी अपॉइंटमेंट, कतार में स्थान, इंतजार का समय, कम भीड़ का समय या सही विभाग बता सकता हूँ।',
    none: 'आपकी कोई आगामी अपॉइंटमेंट नहीं है। बुकिंग टैब से अपॉइंटमेंट बुक करें।',
    appt: (a) => `आपकी ${a.department} अपॉइंटमेंट ${a.date} को ${a.timeSlot} पर है। टिकट: ${String(a.ticketId).slice(0, 8).toUpperCase()}।`,
    queue: (a) => a.peopleAhead > 0 ? `${a.department} में आपसे पहले ${a.peopleAhead} मरीज़ हैं।` : 'आप कतार में अगले हैं!',
    wait: (a) => a.peopleAhead > 0 ? `अनुमानित इंतजार: ${a.estimatedWaitRange ? `${a.estimatedWaitRange.low}-${a.estimatedWaitRange.high}` : a.estimatedWaitMinutes} मिनट (${a.peopleAhead} आगे)।` : 'आपसे पहले कोई नहीं है, कृपया तैयार रहें।',
    cancel: 'मेरी प्रोफ़ाइल टैब खोलें और अपॉइंटमेंट पर रद्द करें दबाएं। जल्दी रद्द करने से स्लॉट दूसरे मरीज़ को मिल जाता है।',
    book: 'बुकिंग टैब खोलें, AI हेल्पर को अपने लक्षण बताएं, फिर हरा स्लॉट चुनें।',
    best: (s) => s ? `${s.date} को ${s.dept} में सबसे कम भीड़: ${s.slot} (लगभग ${s.n} मरीज़)।` : 'दोपहर 2-5 बजे आमतौर पर सबसे कम भीड़ होती है। सोमवार और सुबह 9-11 सबसे व्यस्त हैं।',
    timings: 'ओपीडी सुबह 8 से शाम 5 बजे (लंच 1-2), सोमवार से शनिवार। रविवार और छुट्टियों पर सीमित ओपीडी। इमरजेंसी 24x7 खुली है।',
    documents: 'अपना JanCare QR टिकट, पुराने पर्चे और जांच रिपोर्ट, और चल रही दवाइयों की सूची लाएं। आधार ज़रूरी नहीं है।',
    symptoms: (t) => `आपके बताए लक्षणों के अनुसार ${t.department} विभाग सही लगता है${t.low_confidence ? ' (पक्का नहीं, जनरल मेडिसिन भी देख सकते हैं)' : ''}। ${t.urgency === 'Urgent' ? 'कृपया सबसे पहला स्लॉट बुक करें।' : 'बुकिंग टैब से बुक करें।'} यह निदान नहीं है।`,
    emergency: '⚠️ यह इमरजेंसी लगती है। तुरंत इमरजेंसी वार्ड जाएं या 112 / 108 पर कॉल करें। ओपीडी का इंतजार न करें।',
    thanks: 'आपका स्वागत है! जल्दी ठीक हो जाइए।',
    unknown: 'माफ़ कीजिए, मैं केवल JanCare अपॉइंटमेंट, कतार, इंतजार, समय और विभाग चुनने में मदद कर सकता हूँ।'
  }
};

// Fallback intent detection (used only if the ML service is unreachable)
function keywordIntent(text) {
  const t = text.toLowerCase();
  const rules = [
    ['emergency', /(behosh|बेहोश|unconscious|can.?t breathe|saans nahi|सांस नहीं|heavy bleeding|bahut khoon|बहुत खून|stroke|poison|जहर|suicid)/],
    ['queue', /(ahead|aage|आगे|queue|line|kataar|कतार|baari|बारी|number)/],
    ['wait_time', /(wait|intez|इंतज|der|देर|how long|minute)/],
    ['cancel', /(cancel|radd|रद्द|nahi aa|नहीं आ)/],
    ['my_appointment', /(appointment|booking|ticket|अपॉइंटमेंट|टिकट|बुकिंग)/],
    ['best_time', /(crowd|bheed|भीड़|best time|kam bheed)/],
    ['timings', /(timing|open|khul|खुल|samay|समय|hours)/],
    ['documents', /(document|kagaz|कागज|aadhaar|bring|laana|लाना)/],
    ['book', /(book|doctor se milna)/],
    ['thanks', /(thank|dhanyavad|धन्यवाद|shukriya|शुक्रिया)/],
    ['greeting', /^(hi+|hello|hey|namaste|नमस्ते)\b/],
  ];
  const hit = rules.find(([, re]) => re.test(t));
  return { intent: hit ? hit[0] : 'unknown', confidence: hit ? 0.5 : 0, fallback: true };
}

app.post('/api/assistant', protect, async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 500) : '';
  const L = ASSIST_TEXT[req.body.language === 'hi' ? 'hi' : 'en'];
  try {
    let nlu;
    try { nlu = await mlPost('/assistant', { text }); }
    catch (e) {
      console.error('AI assistant endpoint failed (is ml_service running the latest code?):', e.response?.status || e.message);
      nlu = keywordIntent(text); // simple fallback so patients still get an answer
    }
    const { intent } = nlu;
    const needsAppt = ['my_appointment', 'queue', 'wait_time'].includes(intent);
    let reply;
    if (intent === 'emergency') reply = L.emergency;
    else if (intent === 'symptoms') reply = nlu.triage?.emergency ? L.emergency : L.symptoms(nlu.triage);
    else if (needsAppt) {
      // reuse the queue + AI wait-time logic of GET /api/appointments
      const r = await appointmentsWithQueueFor(req.user.email);
      const upcoming = r.filter(a => ['Scheduled', 'Checked In', 'In Progress'].includes(a.status) && a.date >= localDateString())
        .sort((a, b) => (a.date + a.timeSlot).localeCompare(b.date + b.timeSlot))[0];
      reply = !upcoming ? L.none : intent === 'my_appointment' ? L.appt(upcoming) : intent === 'queue' ? L.queue(upcoming) : L.wait(upcoming);
    } else if (intent === 'best_time') {
      let best = null;
      const upcoming = await Appointment.findOne({ patientEmail: req.user.email, status: 'Scheduled', date: { $gte: localDateString() } }).sort({ date: 1 });
      const dept = upcoming?.department || nlu.triage?.department;
      if (dept) {
        const date = upcoming?.date || localDateString(new Date(Date.now() + 86400000));
        try {
          const preds = await getCrowdPredictions(date, dept);
          const p = preds.slice().sort((a, b) => a.predicted_patients - b.predicted_patients)[0];
          best = { dept, date, slot: p.time_slot, n: p.predicted_patients };
        } catch { /* generic answer */ }
      }
      reply = L.best(best);
    } else {
      const map = { greeting: L.greeting, cancel: L.cancel, book: L.book, timings: L.timings, documents: L.documents, thanks: L.thanks };
      reply = map[intent] || L.unknown;
    }
    res.json({ reply, intent, confidence: nlu.confidence, suggestedDepartment: nlu.triage?.department || null });
  } catch (error) {
    console.error('Assistant error:', error.message);
    res.status(503).json({ error: 'Assistant unavailable' });
  }
});

// --- AI surge / outbreak alerts for staff ---
app.get('/api/admin/ai/alerts', adminProtect, async (_req, res) => {
  try {
    const since = localDateString(new Date(Date.now() - 30 * 86400000));
    const today = localDateString();
    const series = {};
    const bookings = await Appointment.aggregate([
      { $match: { date: { $gte: since, $lte: today }, status: { $ne: 'Cancelled' } } },
      { $group: { _id: { d: '$date', dept: '$department' }, n: { $sum: 1 } } }
    ]);
    for (const b of bookings) (series[`${b._id.dept} bookings`] ||= []).push({ date: b._id.d, count: b.n });
    const logs = await TriageLog.aggregate([
      { $match: { date: { $gte: since }, symptomGroup: { $ne: null } } },
      { $group: { _id: { d: '$date', g: '$symptomGroup' }, n: { $sum: 1 } } }
    ]);
    for (const l of logs) (series[`${l._id.g} complaints`] ||= []).push({ date: l._id.d, count: l.n });
    const emergencies = await TriageLog.countDocuments({ date: today, emergency: true });
    const { alerts } = await mlPost('/surge', { series });
    res.json({ alerts: alerts.filter(a => a.date >= localDateString(new Date(Date.now() - 2 * 86400000))), emergenciesToday: emergencies, seriesChecked: Object.keys(series).length });
  } catch (error) {
    res.status(503).json({ error: 'AI alerts unavailable' });
  }
});

// Safety net: a failed database call inside an older route must not crash the whole server
process.on('unhandledRejection', (err) => console.error('Unhandled error:', err?.message || err));

registerExtras(app, {
  protect, adminProtect, doctorProtect, DEPARTMENTS, VALID_SLOTS, localDateString, notify, nextToken,
  changeAppointmentStatus, saveLabReport, syncLabOrders, healthFor, getCrowdPredictions, getTriage, mlPost,
  generateToken, doctorAvailability, triageForBooking
});

// Keep listen() for local dev — Vercel ignores it and uses the export below
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;

