import jwt from 'jsonwebtoken';
import Doctor from '../models/Doctor.js';

export const doctorProtect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authorized, no token' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'doctor') return res.status(403).json({ error: 'Doctor access required' });
    req.doctor = await Doctor.findById(decoded.id).select('-password');
    if (!req.doctor || !req.doctor.active) return res.status(401).json({ error: 'Doctor account not found or inactive' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
