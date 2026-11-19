import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const appointmentSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true, sparse: true, default: () => randomUUID() },
  patientEmail: { type: String, required: true, index: true, lowercase: true, trim: true },
  patientName: { type: String, required: true, default: 'Patient' },
  patientAge: { type: Number, default: null },
  patientGender: { type: String, default: null },
  department: { type: String, required: true, trim: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  timeSlot: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Scheduled', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No-Show'], default: 'Scheduled', index: true },
  checkedInAt: { type: Date, default: null },
  admittedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '' },
  tokenNumber: { type: Number, default: null },          // daily per-department token, given at check-in
  source: { type: String, enum: ['online', 'walk-in'], default: 'online' },
  familyMemberId: { type: mongoose.Schema.Types.ObjectId, default: null },
  feedback: { type: new mongoose.Schema({ rating: { type: Number, min: 1, max: 5 }, comment: { type: String, maxlength: 500 }, at: Date }, { _id: false }), default: null },
  isDemo: { type: Boolean, default: false },
  // AI pre-visit summary (from the symptom helper at booking time)
  symptoms: { type: String, default: '', maxlength: 500 },
  aiTriage: { type: new mongoose.Schema({ department: String, confidence: Number, urgency: String, emergency: Boolean }, { _id: false }), default: null },
  // Consultation
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  doctorName: { type: String, default: '' },
  room: { type: String, default: '' },
  doctorNotes: { type: String, default: '', maxlength: 2000 },
  advice: { type: String, default: '', maxlength: 1000 },
  // Prescription written by the doctor at the end of the visit
  prescription: {
    type: new mongoose.Schema({
      diagnosis: { type: String, default: '', maxlength: 300 },
      medicines: [new mongoose.Schema({
        name: { type: String, required: true, maxlength: 120 },
        dose: { type: String, default: '1-0-1', maxlength: 20 },      // morning-afternoon-night, or SOS
        timing: { type: String, default: 'After food', maxlength: 40 },
        days: { type: Number, default: 5, min: 0, max: 365 },
        notes: { type: String, default: '', maxlength: 200 }
      }, { _id: false })],
      labTests: [{ type: String, maxlength: 80 }],
      followUpDays: { type: Number, default: null, min: 0, max: 365 },
      writtenAt: { type: Date, default: null }
    }, { _id: false }),
    default: null
  }
}, { timestamps: true });

appointmentSchema.index({ department: 1, date: 1, timeSlot: 1, status: 1 });
export default mongoose.model('Appointment', appointmentSchema);
