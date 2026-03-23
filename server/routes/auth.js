const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db } = require('../db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const email    = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const user = await db.get2('SELECT * FROM users WHERE email = ?', [email]);

    // Constant-time comparison even on miss (prevents timing attacks)
    const hash = user ? user.password : '$2a$10$invalidhashfortimingprotection000000000000';
    const match = bcrypt.compareSync(password, hash);

    if (!user || !match)
      return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user.id;
    const safe = safeUser(user);
    safe.mustChangePassword = !!user.must_change_password;
    res.json(safe);
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await db.get2('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const safe = safeUser(user);
    safe.mustChangePassword = !!user.must_change_password;
    res.json(safe);
  } catch (e) {
    console.error('Me error:', e);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const name       = String(req.body.name       || '').trim();
  const email      = String(req.body.email      || '').trim().toLowerCase();
  const password   = String(req.body.password   || '');
  const childName  = String(req.body.childName  || '').trim();
  const childClass = String(req.body.childClass || '').trim();

  if (!name || !email || !password || !childName || !childClass)
    return res.status(400).json({ error: 'All fields are required' });
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ error: 'Invalid email address' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (name.length > 100 || childName.length > 100)
    return res.status(400).json({ error: 'Name too long' });

  try {
    const exists = await db.get2('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    await db.run2(
      'INSERT INTO users (id,name,email,password,role,child_name,child_class) VALUES (?,?,?,?,?,?,?)',
      [uuid(), name, email, bcrypt.hashSync(password, 12), 'parent', childName, childClass]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── Change password ───────────────────────────────────────────────────────────
router.post('/change-password', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const current  = String(req.body.current  || '');
  const newPass  = String(req.body.newPass  || '');

  if (!current || !newPass)
    return res.status(400).json({ error: 'Current and new password are required' });
  if (newPass.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (current === newPass)
    return res.status(400).json({ error: 'New password must differ from current password' });

  try {
    const user = await db.get2('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user || !bcrypt.compareSync(current, user.password))
      return res.status(401).json({ error: 'Current password is incorrect' });

    await db.run2(
      'UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?',
      [bcrypt.hashSync(newPass, 12), req.session.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Change password error:', e);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, childName: u.child_name, childClass: u.child_class };
}

module.exports = router;
