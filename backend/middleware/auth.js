const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// Returns the user id if the token is valid AND the account still exists
// AND the password was not changed after the token was issued. Otherwise null.
async function getUserId(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  if (!payload || typeof payload.id !== 'string' || !mongoose.isValidObjectId(payload.id)) return null;

  const user = await User.findById(payload.id).select('_id passwordChangedAt').lean();
  if (!user) return null; // account deleted

  if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.iat) {
    return null; // token is older than the last password change
  }
  return String(user._id);
}

async function requireAuth(req, res, next) {
  try {
    const id = await getUserId(req);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = id;
    next();
  } catch (err) {
    console.error('Auth check failed:', err.message);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    req.userId = await getUserId(req);
  } catch (err) {
    console.error('Auth check failed:', err.message);
    req.userId = null;
  }
  next();
}

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