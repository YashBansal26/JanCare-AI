import jwt from 'jsonwebtoken';
import LabStaff from '../models/LabStaff.js';

export const labProtect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authorized, no token' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'lab') return res.status(403).json({ error: 'Lab staff access required' });
    req.lab = await LabStaff.findById(decoded.id).select('-password');
    if (!req.lab || !req.lab.active) return res.status(401).json({ error: 'Lab account not found or inactive' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Not authorized, token failed' });
  }
};
