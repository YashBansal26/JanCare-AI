import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 10
  },
  // Aadhaar is intentionally not collected by this demo.
  adhhar: { type: String, select: false },
  age: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  // Health profile (used by the prescription safety check)
  healthProfile: {
    allergies: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
    bloodGroup: { type: String, default: '' },
    abhaId: { type: String, default: '' }       // Ayushman Bharat Health Account no. (stored only, not verified)
  },
  // Family members booked from this account (common in India: one phone for the family)
  familyMembers: [new mongoose.Schema({
    name: { type: String, required: true, maxlength: 80 },
    relation: { type: String, default: 'Family', maxlength: 30 },
    age: { type: Number, min: 0, max: 120, required: true },
    gender: { type: String, enum: ['Male', 'Female', 'Other'], required: true },
    allergies: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
    abhaId: { type: String, default: '' }
  })],
  preferredLanguage: { type: String, enum: ['en', 'hi'], default: 'en' },
  notifyChannel: { type: String, enum: ['SMS', 'WhatsApp'], default: 'SMS' },
  walkIn: { type: Boolean, default: false },      // registered at the front desk, no app login yet
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
