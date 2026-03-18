const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Simple in-process session store ──────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sessions = new Map();

app.use(cookieParser(SESSION_SECRET));

// Attach session to request
app.use((req, _res, next) => {
  const sid = req.signedCookies.sid;
  req.session = (sid && sessions.get(sid)) || {};
  req.session.destroy = (cb) => { if (sid) sessions.delete(sid); cb && cb(); };
  next();
});

// Persist session on response
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (!req.signedCookies.sid && req.session.userId) {
      const sid = crypto.randomBytes(16).toString('hex');
      sessions.set(sid, req.session);
      res.cookie('sid', sid, {
        signed: true, httpOnly: true, sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    return origJson(body);
  };
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/slots',    require('./routes/slots'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/schools',  require('./routes/schools'));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
init().then(() => {
  app.listen(PORT, () => console.log(`PT Scheduler running on port ${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
