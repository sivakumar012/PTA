// ─── API client – replaces localStorage with real backend calls ──────────────
const API = '/api';

// In-memory cache so pages don't re-fetch on every render
let _teachers = null;
let _slots    = null;
let _user     = null;

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
async function login(email, password) {
  try {
    _user = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    return _user;
  } catch (e) { return null; }
}

async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  _user = null; _teachers = null; _slots = null;
  window.location.href = 'index.html';
}

async function getCurrentUser() {
  if (_user) return _user;
  try { _user = await apiFetch('/auth/me'); return _user; } catch { return null; }
}

async function requireAuth(role) {
  const user = await getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  if (role && user.role !== role) { window.location.href = 'index.html'; return null; }
  return user;
}

async function registerParent(name, email, password, childName, childClass) {
  try {
    await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, childName, childClass }) });
    return { ok: true };
  } catch (e) { return { ok: false, msg: e.message }; }
}

// ─── Teachers ────────────────────────────────────────────────────────────────
async function getTeachers() {
  if (_teachers) return _teachers;
  _teachers = await apiFetch('/teachers');
  return _teachers;
}

function invalidateTeachers() { _teachers = null; }

async function getTeacherById(id) {
  const list = await getTeachers();
  return list.find(t => t.id === id) || null;
}

async function addTeacher(name, subject, email, classes) {
  const t = await apiFetch('/teachers', { method: 'POST', body: JSON.stringify({ name, subject, email, classes }) });
  invalidateTeachers();
  return t;
}

async function removeTeacher(id) {
  await apiFetch('/teachers/' + id, { method: 'DELETE' });
  invalidateTeachers();
  invalidateSlots();
}

// ─── Slots ───────────────────────────────────────────────────────────────────
async function getSlots(teacherId, date) {
  const params = new URLSearchParams();
  if (teacherId) params.set('teacherId', teacherId);
  if (date)      params.set('date', date);
  const qs = params.toString();
  return apiFetch('/slots' + (qs ? '?' + qs : ''));
}

function invalidateSlots() { _slots = null; }

async function addSlot(teacherId, date, time) {
  const s = await apiFetch('/slots', { method: 'POST', body: JSON.stringify({ teacherId, date, time }) });
  return s.id;
}

async function removeSlot(id) {
  await apiFetch('/slots/' + id, { method: 'DELETE' });
}

// ─── Bookings ────────────────────────────────────────────────────────────────
async function bookSlot(slotId, childName, childClass, notes) {
  try {
    await apiFetch('/bookings', { method: 'POST', body: JSON.stringify({ slotId, childName, childClass, notes }) });
    return true;
  } catch { return false; }
}

async function cancelSlot(slotId) {
  await apiFetch('/bookings/' + slotId, { method: 'DELETE' });
}

async function getMyBookings() {
  return apiFetch('/bookings/mine');
}

async function getAllBookings(teacherId, date) {
  const params = new URLSearchParams();
  if (teacherId) params.set('teacherId', teacherId);
  if (date)      params.set('date', date);
  const qs = params.toString();
  return apiFetch('/bookings' + (qs ? '?' + qs : ''));
}

async function getBookingStats() {
  return apiFetch('/bookings/stats');
}

// ─── Formatting (pure, no API needed) ────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ─── Expose globally ─────────────────────────────────────────────────────────
window.App = {
  login, logout, getCurrentUser, requireAuth, registerParent,
  getTeachers, getTeacherById, addTeacher, removeTeacher, invalidateTeachers,
  getSlots, addSlot, removeSlot, invalidateSlots,
  bookSlot, cancelSlot, getMyBookings, getAllBookings, getBookingStats,
  formatDate, formatTime,
};
