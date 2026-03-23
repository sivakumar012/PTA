const router = require('express').Router();
const { db } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware');
const mailer = require('../mailer');

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const booked    = (await db.get2("SELECT COUNT(*) as n FROM slots WHERE booked_by IS NOT NULL AND cancelled_by_admin = 0")).n;
    const available = (await db.get2("SELECT COUNT(*) as n FROM slots WHERE booked_by IS NULL AND cancelled_by_admin = 0")).n;
    const cancelled = (await db.get2("SELECT COUNT(*) as n FROM slots WHERE cancelled_by_admin = 1")).n;
    res.json({ booked, available, cancelled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const rows = await db.all2(
      'SELECT * FROM slots WHERE booked_by = ? AND cancelled_by_admin = 0 ORDER BY date, time',
      [req.session.userId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { teacherId, date } = req.query;
    let sql = `SELECT s.*, u.name as parent_name
               FROM slots s JOIN users u ON u.id = s.booked_by
               WHERE s.booked_by IS NOT NULL AND s.cancelled_by_admin = 0`;
    const params = [];
    if (teacherId) { sql += ' AND s.teacher_id = ?'; params.push(teacherId); }
    if (date)      { sql += ' AND s.date = ?';       params.push(date); }
    sql += ' ORDER BY s.date, s.time';
    res.json(await db.all2(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Book a slot ───────────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { slotId, childName, childClass, notes } = req.body;
    const slot = await db.get2('SELECT * FROM slots WHERE id = ?', [slotId]);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (slot.booked_by || slot.cancelled_by_admin)
      return res.status(409).json({ error: 'Slot is no longer available' });

    await db.run2(
      'UPDATE slots SET booked_by=?, child_name=?, child_class=?, notes=? WHERE id=?',
      [req.session.userId, childName, childClass, notes || null, slotId]
    );

    // Send emails async — don't block the response
    sendBookingEmails(slotId, req.session.userId, childName, childClass, notes).catch(console.error);

    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Cancel a booking ──────────────────────────────────────────────────────────
router.delete('/:slotId', requireAuth, async (req, res) => {
  try {
    const slot = await db.get2('SELECT * FROM slots WHERE id = ?', [req.params.slotId]);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });

    const user = await db.get2('SELECT role FROM users WHERE id = ?', [req.session.userId]);
    const isAdmin = user.role === 'admin';

    if (!isAdmin && slot.booked_by !== req.session.userId)
      return res.status(403).json({ error: 'Not your booking' });

    if (isAdmin) {
      await db.run2(
        'UPDATE slots SET booked_by=NULL,child_name=NULL,child_class=NULL,notes=NULL,cancelled_by_admin=1 WHERE id=?',
        [req.params.slotId]
      );
    } else {
      await db.run2(
        'UPDATE slots SET booked_by=NULL,child_name=NULL,child_class=NULL,notes=NULL WHERE id=?',
        [req.params.slotId]
      );
    }

    // Send cancellation emails async
    sendCancellationEmails(slot, isAdmin).catch(console.error);

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Email helpers (fire-and-forget) ───────────────────────────────────────────
async function sendBookingEmails(slotId, userId, childName, childClass, notes) {
  const [slot, parent, teacher] = await Promise.all([
    db.get2('SELECT * FROM slots WHERE id = ?', [slotId]),
    db.get2('SELECT * FROM users WHERE id = ?', [userId]),
    db.get2(`SELECT t.* FROM slots s JOIN teachers t ON t.id = s.teacher_id WHERE s.id = ?`, [slotId]),
  ]);
  if (!slot || !parent || !teacher) return;

  await Promise.all([
    mailer.sendBookingConfirmation({
      parentEmail:    parent.email,
      parentName:     parent.name,
      teacherName:    teacher.name,
      teacherSubject: teacher.subject,
      date:           slot.date,
      time:           slot.time,
      duration:       slot.duration_minutes,
      childName, childClass, notes,
    }),
    mailer.sendTeacherBookingNotice({
      teacherEmail: teacher.email,
      teacherName:  teacher.name,
      parentName:   parent.name,
      date:         slot.date,
      time:         slot.time,
      duration:     slot.duration_minutes,
      childName, childClass, notes,
    }),
  ]);
}

async function sendCancellationEmails(slot, cancelledByAdmin) {
  if (!slot.booked_by) return;
  const [parent, teacher] = await Promise.all([
    db.get2('SELECT * FROM users WHERE id = ?', [slot.booked_by]),
    db.get2('SELECT * FROM teachers WHERE id = ?', [slot.teacher_id]),
  ]);
  if (!parent || !teacher) return;

  await Promise.all([
    mailer.sendCancellationNotice({
      parentEmail:      parent.email,
      parentName:       parent.name,
      teacherName:      teacher.name,
      date:             slot.date,
      time:             slot.time,
      cancelledByAdmin,
    }),
    mailer.sendTeacherCancellationNotice({
      teacherEmail: teacher.email,
      teacherName:  teacher.name,
      parentName:   parent.name,
      childName:    slot.child_name,
      date:         slot.date,
      time:         slot.time,
    }),
  ]);
}

module.exports = router;
