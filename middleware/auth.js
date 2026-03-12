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
