const jwt = require('jsonwebtoken');

function getUserId(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).id;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const id = getUserId(req);
  if (!id) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = id;
  next();
}

function optionalAuth(req, res, next) {
  req.userId = getUserId(req);
  next();
}

const User = require('../models/User');

// The role is read from the database (not from the token), so it cannot be forged or go stale
async function requireRecruiter(req, res, next) {
  try {
    const u = await User.findById(req.userId).select('role').lean();
    if (!u || u.role !== 'recruiter') return res.status(403).json({ error: 'Recruiter account required' });
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Could not verify account' });
  }
}

module.exports = { requireAuth, optionalAuth, requireRecruiter };