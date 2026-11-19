import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  department: { type: String, required: true, index: true },
  qualification: { type: String, default: 'MBBS' },
  specialization: { type: String, default: '' },
  experienceYears: { type: Number, default: 0, min: 0, max: 60 },
  room: { type: String, default: '' },
  opdDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], validate: v => v.every(d => DAYS.includes(d)) },
  opdTimings: { type: String, default: '08:00 - 17:00' },
  languages: { type: [String], default: ['Hindi', 'English'] },
  about: { type: String, default: '', maxlength: 500 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

doctorSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, await bcrypt.genSalt(10));
});
doctorSchema.methods.matchPassword = function (p) { return bcrypt.compare(p, this.password); };

// What patients may see (no email / password)
doctorSchema.methods.publicProfile = function () {
  const { _id, name, department, qualification, specialization, experienceYears, room, opdDays, opdTimings, languages, about } = this;
  return { _id, name, department, qualification, specialization, experienceYears, room, opdDays, opdTimings, languages, about };
};

export default mongoose.model('Doctor', doctorSchema);
