import mongoose from 'mongoose';

// Lab report file attached to a completed visit. Files are stored in MongoDB
// (max 5 MB) so the app also works on hosts without a persistent disk.
const labReportSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
  patientEmail: { type: String, required: true, index: true },
  testName: { type: String, required: true, maxlength: 80 },
  resultSummary: { type: String, default: '', maxlength: 500 },
  fileName: { type: String, required: true, maxlength: 150 },
  mimeType: { type: String, required: true, enum: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
  uploadedBy: { type: String, default: '' },
  labOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LabOrder', default: null },
  // AI reading of the report: values found, reference ranges, plain-language explanation
  analysis: { type: mongoose.Schema.Types.Mixed, default: null },
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('LabReport', labReportSchema);
