const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Warn loudly if SESSION_SECRET is not set in production ────────────────────
if (isProd && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET env var is not set. Refusing to start in production.');
  process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // inline scripts in HTML pages
      styleSrc:  ["'self'", "'unsafe-inline'"],
      imgSrc:    ["'self'", 'data:'],
    },
  },
}));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // max 20 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 120,                   // 120 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ── Body parsing (with size limit) ────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

// ── Cookie parser ─────────────────────────────────────────────────────────────
app.use(cookieParser(SESSION_SECRET));

// ── Session store (in-process Map) ───────────────────────────────────────────
const sessions = new Map();

// Prune expired sessions every 30 minutes
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of sessions) {
    if (sess._expires && sess._expires < now) sessions.delete(sid);
  }
}, 30 * 60 * 1000);

app.use((req, _res, next) => {
  const sid = req.signedCookies.sid;
  const sess = sid && sessions.get(sid);
  // Invalidate expired session
  if (sess && sess._expires && sess._expires < Date.now()) {
    sessions.delete(sid);
    req.session = {};
  } else {
    req.session = sess || {};
  }
  req.session.destroy = (cb) => { if (sid) sessions.delete(sid); cb && cb(); };
  next();
});

app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (!req.signedCookies.sid && req.session.userId) {
      const sid = crypto.randomBytes(32).toString('hex'); // 32 bytes = 256-bit token
      req.session._expires = Date.now() + SESSION_TTL;
      sessions.set(sid, req.session);
      res.cookie('sid', sid, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: SESSION_TTL,
      });
    }
    return origJson(body);
  };
  next();
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..'), {
  index: false, // don't auto-serve index.html for /
}));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/slots',    require('./routes/slots'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/schools',  require('./routes/schools'));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

// ── Global error handler (no stack traces in production) ──────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
init().then(() => {
  app.listen(PORT, () => console.log(`PT Scheduler running on port ${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
