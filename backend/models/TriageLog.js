import mongoose from 'mongoose';

// Anonymous AI triage log used for outbreak / surge detection.
// Stores NO free text and no patient identity: only the outcome and a coarse symptom group.
const triageLogSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  department: { type: String, default: '' },
  urgency: { type: String, default: 'Routine' },
  emergency: { type: Boolean, default: false },
  symptomGroup: { type: String, default: null, index: true },
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('TriageLog', triageLogSchema);
