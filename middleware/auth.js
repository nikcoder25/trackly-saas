/**
 * JWT authentication middleware
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'trackly-dev-secret-change-me';
if (!process.env.JWT_SECRET) console.warn('[WARN] JWT_SECRET not set in environment! Tokens will not survive redeploy.');

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { auth, JWT_SECRET };
