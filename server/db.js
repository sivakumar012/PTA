const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'scheduler.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH);

// Promisified helpers
db.run2 = (sql, params = []) => new Promise((res, rej) =>
  db.run(sql, params, function (err) { err ? rej(err) : res(this); })
);
db.get2 = (sql, params = []) => new Promise((res, rej) =>
  db.get(sql, params, (err, row) => err ? rej(err) : res(row))
);
db.all2 = (sql, params = []) => new Promise((res, rej) =>
  db.all(sql, params, (err, rows) => err ? rej(err) : res(rows))
);

async function init() {
  await db.run2('PRAGMA journal_mode = WAL');
  await db.run2('PRAGMA foreign_keys = ON');

  await db.run2(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'parent',
    child_name TEXT,
    child_class TEXT
  )`);

  await db.run2(`CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT
  )`);

  await db.run2(`CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    classes TEXT NOT NULL,
    school_id TEXT REFERENCES schools(id) ON DELETE SET NULL
  )`);

  await db.run2(`CREATE TABLE IF NOT EXISTS slots (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    booked_by TEXT REFERENCES users(id),
    child_name TEXT,
    child_class TEXT,
    notes TEXT,
    cancelled_by_admin INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER NOT NULL DEFAULT 10,
    UNIQUE(teacher_id, date, time)
  )`);

  await seed();
}

async function seed() {
  const bcrypt = require('bcryptjs');
  const { v4: uuid } = require('uuid');

  const adminExists = await db.get2('SELECT id FROM users WHERE email = ?', ['admin@school.edu']);
  if (adminExists) return;

  await db.run2('INSERT INTO users (id,name,email,password,role) VALUES (?,?,?,?,?)',
    [uuid(), 'Admin', 'admin@school.edu', bcrypt.hashSync('admin123', 10), 'admin']);

  const parentId = uuid();
  await db.run2('INSERT INTO users (id,name,email,password,role,child_name,child_class) VALUES (?,?,?,?,?,?,?)',
    [parentId, 'Alice Parent', 'alice@parent.com', bcrypt.hashSync('parent123', 10), 'parent', 'Emma', 'Grade 3A']);

  const schoolId = uuid();
  await db.run2('INSERT INTO schools (id,name,address) VALUES (?,?,?)',
    [schoolId, 'Springfield Elementary', '123 Main St']);

  const teachers = [
    { id: uuid(), name: 'Mr. Johnson',  subject: 'Mathematics', email: 'johnson@school.edu',  classes: 'Grade 3A,Grade 4B', school_id: schoolId },
    { id: uuid(), name: 'Ms. Williams', subject: 'English',     email: 'williams@school.edu', classes: 'Grade 4B,Grade 5C', school_id: schoolId },
    { id: uuid(), name: 'Mrs. Davis',   subject: 'Science',     email: 'davis@school.edu',    classes: 'Grade 3A,Grade 5C', school_id: schoolId },
  ];
  for (const t of teachers) {
    await db.run2('INSERT INTO teachers (id,name,subject,email,classes,school_id) VALUES (?,?,?,?,?,?)',
      [t.id, t.name, t.subject, t.email, t.classes, t.school_id]);
  }

  const times = ['09:00','09:10','09:20','15:30','15:40','15:50'];
  for (let d = 1; d <= 3; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    for (const t of teachers) {
      for (const time of times) {
        await db.run2('INSERT OR IGNORE INTO slots (id,teacher_id,date,time) VALUES (?,?,?,?)',
          [uuid(), t.id, dateStr, time]);
      }
    }
  }
}

module.exports = { db, init };
