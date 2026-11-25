// Servidor sin dependencias: sirve la web y guarda los datos en un JSON.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const START = process.env.START_DATE || '2026-11-25';
const END = process.env.END_DATE || '2026-12-31';
const INITIAL_CODES = Number(process.env.INITIAL_CODES || 12);
const VALUES = new Set(['si', 'regular', 'no']);

const WORDS = ['reno', 'turron', 'belen', 'nieve', 'abeto', 'vela', 'regalo', 'campana',
  'estrella', 'mazapan', 'polvoron', 'angel', 'cometa', 'pastor', 'bola', 'lazo'];

fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { people: {} };
if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function newCode() {
  for (;;) {
    const word = WORDS[crypto.randomInt(WORDS.length)];
    const code = `${word}-${crypto.randomInt(10, 100)}`;
    if (!db.people[code]) return code;
  }
}

function addPerson() {
  const code = newCode();
  db.people[code] = { name: '', votes: {}, created: Date.now() };
  return code;
}

if (Object.keys(db.people).length === 0) {
  for (let i = 0; i < INITIAL_CODES; i++) addPerson();
  save();
}

function validDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= START && d <= END;
}

function label(code) {
  return db.people[code].name || `Sin nombre (${code})`;
}

function publicState(me) {
  const people = Object.entries(db.people)
    .sort((a, b) => a[1].created - b[1].created)
    .map(([code, p]) => ({ name: label(code), me: code === me, votes: p.votes }));
  return { start: START, end: END, me: { code: me, name: label(me) }, people };
}

function adminState() {
  return Object.entries(db.people)
    .sort((a, b) => a[1].created - b[1].created)
    .map(([code, p]) => ({ code, name: p.name, answered: Object.keys(p.votes).length }));
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

function isAdmin(key) {
  if (!ADMIN_KEY || typeof key !== 'string') return false;
  const a = Buffer.from(key), b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normCode(c) {
  return typeof c === 'string' ? c.trim().toLowerCase().replace(/\s+/g, '-') : '';
}

const PAGES = {
  '/': 'index.html',
  '/admin': 'admin.html',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (req.method === 'GET' && PAGES[p]) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', PAGES[p])), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true });

  if (req.method === 'GET' && p === '/api/state') {
    const code = normCode(url.searchParams.get('code'));
    if (!db.people[code]) return send(res, 404, { error: 'Código no válido' });
    return send(res, 200, publicState(code));
  }

  if (req.method === 'POST' && p === '/api/vote') {
    const { code: rawCode, date, value } = await readBody(req);
    const code = normCode(rawCode);
    if (!db.people[code]) return send(res, 404, { error: 'Código no válido' });
    if (!validDate(date)) return send(res, 400, { error: 'Fecha no válida' });
    if (value === null || value === '') delete db.people[code].votes[date];
    else if (VALUES.has(value)) db.people[code].votes[date] = value;
    else return send(res, 400, { error: 'Valor no válido' });
    save();
    return send(res, 200, publicState(code));
  }

  if (p.startsWith('/api/admin')) {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const key = body.key || url.searchParams.get('key');
    if (!isAdmin(key)) return send(res, 401, { error: 'Clave incorrecta' });

    if (req.method === 'GET' && p === '/api/admin') return send(res, 200, adminState());
    if (req.method === 'POST' && p === '/api/admin/name') {
      const code = normCode(body.code);
      if (!db.people[code]) return send(res, 404, { error: 'Código no válido' });
      db.people[code].name = String(body.name || '').trim().slice(0, 40);
      save();
      return send(res, 200, adminState());
    }
    if (req.method === 'POST' && p === '/api/admin/add') {
      addPerson();
      save();
      return send(res, 200, adminState());
    }
    if (req.method === 'POST' && p === '/api/admin/delete') {
      const code = normCode(body.code);
      if (!db.people[code]) return send(res, 404, { error: 'Código no válido' });
      delete db.people[code];
      save();
      return send(res, 200, adminState());
    }
  }

  send(res, 404, { error: 'No encontrado' });
});

server.listen(PORT, () => console.log(`Escuchando en el puerto ${PORT}`));
