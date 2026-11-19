import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  patientEmail: { type: String, required: true, index: true },
  phone: { type: String, default: '' },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  type: { type: String, enum: ['booking_confirmation', 'cancellation', 'check_in', 'status_update', 'reminder'], required: true },
  message: { type: String, required: true },
  channel: { type: String, default: 'SMS (simulated)' },
  status: { type: String, enum: ['Simulated', 'Sent', 'Failed'], default: 'Simulated' }
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);
