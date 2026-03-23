const nodemailer = require('nodemailer');

// ── Transport ─────────────────────────────────────────────────────────────────
// Set these env vars to enable email:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//
// Gmail example:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587
//   SMTP_USER=you@gmail.com   SMTP_PASS=<app-password>
//
// If env vars are missing, emails are logged to console only (dev mode).

const enabled = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transport = enabled
  ? nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'PT Scheduler <noreply@ptscheduler.app>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Helper ────────────────────────────────────────────────────────────────────
async function send({ to, subject, html }) {
  if (!enabled) {
    console.log(`[MAIL] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, html });
  } catch (e) {
    // Never crash the app over a failed email
    console.error('[MAIL] Failed to send email:', e.message);
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────
function base(content) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
  body{font-family:Segoe UI,system-ui,sans-serif;background:#f0f4f8;margin:0;padding:24px}
  .card{background:#fff;border-radius:10px;padding:28px 32px;max-width:520px;margin:0 auto;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .brand{font-size:1.2rem;font-weight:700;color:#2b6cb0;margin-bottom:20px}
  .detail{background:#f7fafc;border-radius:6px;padding:14px 18px;margin:16px 0;font-size:.9rem;line-height:1.7}
  .detail b{color:#2d3748}
  .btn{display:inline-block;background:#2b6cb0;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:18px}
  .footer{text-align:center;color:#a0aec0;font-size:.78rem;margin-top:24px}
  .badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.78rem;font-weight:600}
  .green{background:#c6f6d5;color:#276749} .red{background:#fed7d7;color:#c53030}
</style></head>
<body><div class="card">
  <div class="brand">📅 PT Scheduler</div>
  ${content}
  <div class="footer">This is an automated message — please do not reply.</div>
</div></body></html>`;
}

// ── Booking confirmed (to parent) ─────────────────────────────────────────────
async function sendBookingConfirmation({ parentEmail, parentName, teacherName, teacherSubject, date, time, duration, childName, childClass, notes }) {
  const subject = `Booking Confirmed – ${teacherName} on ${formatDate(date)}`;
  const html = base(`
    <p>Hi <b>${parentName}</b>,</p>
    <p>Your meeting has been confirmed. <span class="badge green">Confirmed</span></p>
    <div class="detail">
      <b>Teacher:</b> ${teacherName} (${teacherSubject})<br/>
      <b>Date:</b> ${formatDate(date)}<br/>
      <b>Time:</b> ${formatTime(time)} &nbsp;·&nbsp; ${duration || 10} minutes<br/>
      <b>Child:</b> ${childName} &nbsp;·&nbsp; ${childClass}<br/>
      ${notes ? `<b>Notes:</b> ${notes}<br/>` : ''}
    </div>
    <p style="font-size:.88rem;color:#718096">Please arrive a few minutes early. If you need to cancel, log in and cancel before the meeting time.</p>
    <a class="btn" href="${APP_URL}">View My Bookings</a>
  `);
  await send({ to: parentEmail, subject, html });
}

// ── Booking notification (to teacher) ────────────────────────────────────────
async function sendTeacherBookingNotice({ teacherEmail, teacherName, parentName, date, time, duration, childName, childClass, notes }) {
  const subject = `New Booking – ${childName} on ${formatDate(date)}`;
  const html = base(`
    <p>Hi <b>${teacherName}</b>,</p>
    <p>A parent has booked a meeting with you.</p>
    <div class="detail">
      <b>Parent:</b> ${parentName}<br/>
      <b>Child:</b> ${childName} &nbsp;·&nbsp; ${childClass}<br/>
      <b>Date:</b> ${formatDate(date)}<br/>
      <b>Time:</b> ${formatTime(time)} &nbsp;·&nbsp; ${duration || 10} minutes<br/>
      ${notes ? `<b>Notes:</b> ${notes}<br/>` : ''}
    </div>
  `);
  await send({ to: teacherEmail, subject, html });
}

// ── Cancellation (to parent) ──────────────────────────────────────────────────
async function sendCancellationNotice({ parentEmail, parentName, teacherName, date, time, cancelledByAdmin }) {
  const subject = `Booking Cancelled – ${teacherName} on ${formatDate(date)}`;
  const html = base(`
    <p>Hi <b>${parentName}</b>,</p>
    <p>Your booking has been cancelled. <span class="badge red">Cancelled</span></p>
    <div class="detail">
      <b>Teacher:</b> ${teacherName}<br/>
      <b>Date:</b> ${formatDate(date)}<br/>
      <b>Time:</b> ${formatTime(time)}<br/>
    </div>
    ${cancelledByAdmin
      ? `<p style="font-size:.88rem;color:#718096">This booking was cancelled by the school administrator. Please log in to book another slot.</p>`
      : `<p style="font-size:.88rem;color:#718096">You cancelled this booking. Log in to book another slot if needed.</p>`
    }
    <a class="btn" href="${APP_URL}">Book Another Slot</a>
  `);
  await send({ to: parentEmail, subject, html });
}

// ── Cancellation notice (to teacher) ─────────────────────────────────────────
async function sendTeacherCancellationNotice({ teacherEmail, teacherName, parentName, childName, date, time }) {
  const subject = `Booking Cancelled – ${childName} on ${formatDate(date)}`;
  const html = base(`
    <p>Hi <b>${teacherName}</b>,</p>
    <p>A booking has been cancelled.</p>
    <div class="detail">
      <b>Parent:</b> ${parentName}<br/>
      <b>Child:</b> ${childName}<br/>
      <b>Date:</b> ${formatDate(date)}<br/>
      <b>Time:</b> ${formatTime(time)}<br/>
    </div>
    <p style="font-size:.88rem;color:#718096">This slot is now available for other parents.</p>
  `);
  await send({ to: teacherEmail, subject, html });
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

module.exports = {
  sendBookingConfirmation,
  sendTeacherBookingNotice,
  sendCancellationNotice,
  sendTeacherCancellationNotice,
};
