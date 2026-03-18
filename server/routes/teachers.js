const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware');

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await db.all2('SELECT * FROM teachers ORDER BY name');
    res.json(rows.map(toTeacher));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, subject, email, classes } = req.body;
  if (!name || !subject || !email || !classes?.length)
    return res.status(400).json({ error: 'All fields are required' });
  try {
    const id = uuid();
    const classStr = Array.isArray(classes) ? classes.join(',') : classes;
    await db.run2('INSERT INTO teachers (id,name,subject,email,classes) VALUES (?,?,?,?,?)',
      [id, name, subject, email, classStr]);
    const t = await db.get2('SELECT * FROM teachers WHERE id = ?', [id]);
    res.status(201).json(toTeacher(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.run2('DELETE FROM teachers WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function toTeacher(t) {
  return { ...t, classes: t.classes.split(',').map(c => c.trim()).filter(Boolean) };
}

module.exports = router;
