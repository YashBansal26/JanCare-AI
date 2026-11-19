import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'patient') return res.status(403).json({ error: 'Patient access required' });
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) return res.status(401).json({ error: 'Account no longer exists' });
      return next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ error: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ error: 'Not authorized, no token' });
  }
};
