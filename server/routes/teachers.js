const router = require('express').Router();
const { v4: uuid } = require('uuid');
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware');

// Public: list all unique classes (used by register form)
router.get('/classes', async (req, res) => {
  try {
    const rows = await db.all2('SELECT classes FROM teachers');
    const classes = [...new Set(rows.flatMap(r => r.classes.split(',').map(c => c.trim()).filter(Boolean)))].sort();
    res.json(classes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { schoolId } = req.query;
    let sql = `SELECT t.*, s.name as school_name FROM teachers t LEFT JOIN schools s ON s.id = t.school_id`;
    const params = [];
    if (schoolId) { sql += ' WHERE t.school_id = ?'; params.push(schoolId); }
    sql += ' ORDER BY t.name';
    const rows = await db.all2(sql, params);
    res.json(rows.map(toTeacher));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, subject, email, classes, schoolId } = req.body;
  if (!name || !subject || !email || !classes?.length)
    return res.status(400).json({ error: 'Name, subject, email and classes are required' });
  try {
    const exists = await db.get2('SELECT id FROM teachers WHERE email = ?', [email]);
    if (exists) return res.status(409).json({ error: 'A teacher with this email already exists' });
    const id = uuid();
    const classStr = Array.isArray(classes) ? classes.join(',') : classes;
    await db.run2('INSERT INTO teachers (id,name,subject,email,classes,school_id) VALUES (?,?,?,?,?,?)',
      [id, name, subject, email, classStr, schoolId || null]);
    const t = await db.get2(`SELECT t.*, s.name as school_name FROM teachers t LEFT JOIN schools s ON s.id = t.school_id WHERE t.id = ?`, [id]);
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
  return {
    id: t.id, name: t.name, subject: t.subject, email: t.email,
    school_id: t.school_id, school_name: t.school_name || null,
    classes: t.classes.split(',').map(c => c.trim()).filter(Boolean),
  };
}

module.exports = router;
