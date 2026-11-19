import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from './models/Admin.js';

dotenv.config();
const [emailArg, passwordArg, employeeIdArg] = process.argv.slice(2);
const email = (emailArg || '').trim().toLowerCase();
const password = passwordArg || '';
const employeeId = (employeeIdArg || '').trim();
if (!email || !password || !employeeId || password.length < 8) {
  console.error('Usage: npm run create-admin -- admin@example.com StrongPassword123 STAFF-001');
  process.exit(1);
}
if (!process.env.MONGO_URI) {
  console.error('Set MONGO_URI in backend/.env before creating a staff account.');
  process.exit(1);
}
try {
  await mongoose.connect(process.env.MONGO_URI);
  const exists = await Admin.findOne({ $or: [{ email }, { employeeId }] });
  if (exists) throw new Error('An admin with this email or employee ID already exists.');
  await Admin.create({ email, password, employeeId });
  console.log(`Staff account created for ${email}. You can now sign in at /admin.`);
} catch (error) {
  console.error(`Could not create staff account: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
