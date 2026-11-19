import mongoose from 'mongoose';

// One lab test ordered by a doctor in a prescription. Lab staff move it through
// Ordered -> Sample collected -> Completed (report uploaded).
const labOrderSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
  patientEmail: { type: String, required: true, index: true },
  patientName: { type: String, default: '' },
  patientAge: { type: Number, default: null },
  patientGender: { type: String, default: '' },
  department: { type: String, default: '' },
  doctorName: { type: String, default: '' },
  testName: { type: String, required: true, maxlength: 80 },
  status: { type: String, enum: ['Ordered', 'Sample collected', 'Completed', 'Cancelled'], default: 'Ordered', index: true },
  sampleCollectedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabReport', default: null },
  collectedBy: { type: String, default: '' },
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

labOrderSchema.index({ appointmentId: 1, testName: 1 }, { unique: true });
export default mongoose.model('LabOrder', labOrderSchema);
