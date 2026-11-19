import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

export const adminProtect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Hospital staff access required' });
      req.admin = await Admin.findById(decoded.id).select('-password');
      if (!req.admin) {
        return res.status(401).json({ error: 'Not authorized as admin' });
      }
      return next();
    } catch (error) {
      if (error.name !== 'TokenExpiredError') console.error(error); else console.log('Staff login expired - asking user to sign in again');
      res.status(401).json({ error: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ error: 'Not authorized, no token' });
  }
};
