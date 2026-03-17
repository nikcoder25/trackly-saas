/**
 * JWT authentication middleware
 */
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is required. Set it in your environment variables.');
  console.error('  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

function auth(req, res, next) {
  // Check Authorization header first, fall back to httpOnly cookie
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    || req.cookies?.trackly_token || '';
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    // Explicitly specify allowed algorithms to prevent algorithm confusion attacks
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch(e) {
    if (e.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { auth, JWT_SECRET };
