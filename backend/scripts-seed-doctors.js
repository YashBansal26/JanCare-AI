// Demo data: one doctor per OPD department. Password for all: Doctor@123
// Usage: npm run seed-doctors
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Doctor from './models/Doctor.js';

dotenv.config();
const DOCTORS = [
  { name: 'Dr. Ananya Sharma', email: 'cardio@jancare.demo', department: 'Cardiology', qualification: 'MBBS, MD, DM (Cardiology)', specialization: 'Interventional cardiology', experienceYears: 14, room: 'OPD-101' },
  { name: 'Dr. Rajesh Verma', email: 'ortho@jancare.demo', department: 'Orthopedics', qualification: 'MBBS, MS (Ortho)', specialization: 'Joint replacement & sports injuries', experienceYears: 11, room: 'OPD-104' },
  { name: 'Dr. Meera Iyer', email: 'neuro@jancare.demo', department: 'Neurology', qualification: 'MBBS, MD, DM (Neurology)', specialization: 'Epilepsy & headache', experienceYears: 9, room: 'OPD-201' },
  { name: 'Dr. Sameer Khan', email: 'derma@jancare.demo', department: 'Dermatology', qualification: 'MBBS, MD (Dermatology)', specialization: 'Skin infections & allergy', experienceYears: 7, room: 'OPD-203', languages: ['Hindi', 'English', 'Urdu'] },
  { name: 'Dr. Priya Nair', email: 'peds@jancare.demo', department: 'Pediatrics', qualification: 'MBBS, MD (Pediatrics)', specialization: 'Child health & vaccination', experienceYears: 12, room: 'OPD-105' },
  { name: 'Dr. Arvind Gupta', email: 'gm@jancare.demo', department: 'General Medicine', qualification: 'MBBS, MD (Medicine)', specialization: 'Fever, diabetes & hypertension', experienceYears: 18, room: 'OPD-102' },
];
try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hackathon_opd');
  for (const d of DOCTORS) {
    if (await Doctor.findOne({ email: d.email })) { console.log(`exists: ${d.email}`); continue; }
    await Doctor.create({ ...d, password: 'Doctor@123' });
    console.log(`created: ${d.name} (${d.email} / Doctor@123)`);
  }
} catch (e) {
  console.error('Seeding failed:', e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
