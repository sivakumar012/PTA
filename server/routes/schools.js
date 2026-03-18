const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware');

router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await db.all2('SELECT * FROM schools ORDER BY name'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'School name is required' });
  try {
    const id = uuid();
    await db.run2('INSERT INTO schools (id,name,address) VALUES (?,?,?)', [id, name, address || null]);
    res.status(201).json(await db.get2('SELECT * FROM schools WHERE id = ?', [id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.run2('DELETE FROM schools WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
