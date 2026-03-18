const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { teacherId, date } = req.query;
    let sql = 'SELECT * FROM slots WHERE 1=1';
    const params = [];
    if (teacherId) { sql += ' AND teacher_id = ?'; params.push(teacherId); }
    if (date)      { sql += ' AND date = ?';       params.push(date); }
    sql += ' ORDER BY date, time';
    res.json(await db.all2(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const { teacherId, date, time } = req.body;
  if (!teacherId || !date || !time)
    return res.status(400).json({ error: 'teacherId, date and time are required' });
  try {
    const id = uuid();
    await db.run2('INSERT INTO slots (id,teacher_id,date,time) VALUES (?,?,?,?)', [id, teacherId, date, time]);
    res.status(201).json(await db.get2('SELECT * FROM slots WHERE id = ?', [id]));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Slot already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.run2('DELETE FROM slots WHERE id = ? AND booked_by IS NULL', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
