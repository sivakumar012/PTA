const { db } = require('./db');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await db.get2('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { requireAuth, requireAdmin };
