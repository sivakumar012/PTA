const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { db } = require('../db');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.get2('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });
    req.session.userId = user.id;
    res.json(safeUser(user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = await db.get2('SELECT * FROM users WHERE id = ?', [req.session.userId]);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json(safeUser(user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/register', async (req, res) => {
  const { name, email, password, childName, childClass } = req.body;
  if (!name || !email || !password || !childName || !childClass)
    return res.status(400).json({ error: 'All fields are required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const exists = await db.get2('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) return res.status(409).json({ error: 'Email already registered' });
    await db.run2(
      'INSERT INTO users (id,name,email,password,role,child_name,child_class) VALUES (?,?,?,?,?,?,?)',
      [uuid(), name, email, bcrypt.hashSync(password, 10), 'parent', childName, childClass]
    );
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function safeUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, childName: u.child_name, childClass: u.child_class };
}

module.exports = router;
