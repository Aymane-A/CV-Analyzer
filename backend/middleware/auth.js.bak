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

module.exports = { requireAuth, optionalAuth };