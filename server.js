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
// Datos añadidos después del primer despliegue: se crean vacíos si no existen.
db.santa ||= { enabled: false, budget: '', date: '', joined: [], exclusions: [], assignments: null };
db.polls ||= [];

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
}
save();

function validDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= START && d <= END;
}

function label(code) {
  return db.people[code]?.name || `Sin nombre (${code})`;
}

function orderedCodes() {
  return Object.keys(db.people).sort((a, b) => db.people[a].created - db.people[b].created);
}

// ---------- Amigo invisible ----------

function excluded(a, b) {
  return db.santa.exclusions.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

// Busca una asignación en la que nadie se regala a sí mismo ni a alguien excluido.
function drawSanta() {
  const givers = [...db.santa.joined];
  for (let attempt = 0; attempt < 200; attempt++) {
    const order = [...givers];
    for (let i = order.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const result = {};
    const used = new Set();
    const solve = (i) => {
      if (i === order.length) return true;
      const giver = order[i];
      const options = order.filter((r) => r !== giver && !used.has(r) && !excluded(giver, r));
      for (const r of options) {
        used.add(r); result[giver] = r;
        if (solve(i + 1)) return true;
        used.delete(r); delete result[giver];
      }
      return false;
    };
    if (solve(0)) return result;
  }
  return null;
}

function santaFor(code) {
  const s = db.santa;
  return {
    enabled: s.enabled,
    budget: s.budget,
    date: s.date,
    drawn: !!s.assignments,
    joined: s.joined.includes(code),
    participants: s.joined.map(label),
    gift: s.assignments?.[code] ? label(s.assignments[code]) : null,
  };
}

// El admin nunca recibe las asignaciones, solo si el sorteo está hecho.
function santaAdmin() {
  const s = db.santa;
  return {
    enabled: s.enabled, budget: s.budget, date: s.date, drawn: !!s.assignments,
    joined: s.joined.map((c) => ({ code: c, name: label(c) })),
    exclusions: s.exclusions.map(([a, b]) => ({ a, b, aName: label(a), bName: label(b) })),
  };
}

// ---------- Votaciones ----------

function pollClosed(p) {
  return !!p.closesAt && Date.now() >= Date.parse(p.closesAt);
}

// Una línea de opción puede llevar un enlace http(s): "Casa Pepe https://maps.app.goo.gl/...".
function parseOption(line) {
  const raw = String(line ?? '').slice(0, 1000).trim();
  let url = '';
  let rest = raw;
  const m = raw.match(/https?:\/\/\S+/i);
  if (m) {
    try {
      const u = new URL(m[0]);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.href.length <= 1000) url = u.href;
    } catch {}
    rest = raw.replace(m[0], ' ');
  }
  let t = text(rest.replace(/^[\s\-–—|:,]+|[\s\-–—|:,]+$/g, ''), 100);
  if (!t && url) t = new URL(url).hostname.replace(/^www\./, '');
  return t ? { text: t, url } : null;
}

function pollView(p, me) {
  return {
    id: p.id,
    question: p.question,
    multiple: p.multiple,
    anonymous: p.anonymous,
    closesAt: p.closesAt,
    closed: pollClosed(p),
    voters: Object.keys(p.votes).length,
    mine: me ? p.votes[me] || [] : [],
    options: p.options.map((o) => {
      const codes = Object.keys(p.votes).filter((c) => p.votes[c].includes(o.id));
      return { id: o.id, text: o.text, url: o.url || '', count: codes.length, names: p.anonymous ? null : codes.map(label) };
    }),
  };
}

// ---------- Estado ----------

function publicState(me) {
  const people = orderedCodes().map((code) => ({ name: label(code), me: code === me, votes: db.people[code].votes }));
  return {
    start: START, end: END, me: { code: me, name: label(me) }, people,
    santa: santaFor(me),
    polls: db.polls.map((p) => pollView(p, me)),
  };
}

function adminState() {
  return {
    people: orderedCodes().map((code) => {
      const p = db.people[code];
      return { code, name: p.name, answered: Object.keys(p.votes).length };
    }),
    santa: santaAdmin(),
    polls: db.polls.map((p) => pollView(p, null)),
  };
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
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

const text = (v, max) => String(v ?? '').trim().slice(0, max);

const PAGES = {
  '/': 'index.html',
  '/admin': 'admin.html',
};

async function handleAdmin(req, res, p, body) {
  const ok = () => { save(); send(res, 200, adminState()); };
  const fail = (msg, status = 400) => send(res, status, { error: msg });

  if (req.method === 'GET' && p === '/api/admin') return send(res, 200, adminState());
  if (req.method !== 'POST') return fail('No encontrado', 404);

  switch (p) {
    case '/api/admin/name': {
      const code = normCode(body.code);
      if (!db.people[code]) return fail('Código no válido', 404);
      db.people[code].name = text(body.name, 40);
      return ok();
    }
    case '/api/admin/add':
      addPerson();
      return ok();
    case '/api/admin/delete': {
      const code = normCode(body.code);
      if (!db.people[code]) return fail('Código no válido', 404);
      if (db.santa.assignments && db.santa.joined.includes(code)) {
        return fail('Esta persona está en el sorteo del amigo invisible. Reinicia el sorteo antes de borrarla.');
      }
      delete db.people[code];
      db.santa.joined = db.santa.joined.filter((c) => c !== code);
      db.santa.exclusions = db.santa.exclusions.filter(([a, b]) => a !== code && b !== code);
      for (const poll of db.polls) delete poll.votes[code];
      return ok();
    }
    case '/api/admin/santa': {
      if ('enabled' in body) db.santa.enabled = !!body.enabled;
      if ('budget' in body) db.santa.budget = text(body.budget, 60);
      if ('date' in body) db.santa.date = text(body.date, 60);
      return ok();
    }
    case '/api/admin/santa/exclusion': {
      const a = normCode(body.a), b = normCode(body.b);
      if (body.remove) {
        db.santa.exclusions = db.santa.exclusions.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
        return ok();
      }
      if (!db.people[a] || !db.people[b] || a === b) return fail('Elige dos personas distintas');
      if (!excluded(a, b)) db.santa.exclusions.push([a, b]);
      return ok();
    }
    case '/api/admin/santa/draw': {
      if (db.santa.assignments) return fail('El sorteo ya está hecho');
      if (db.santa.joined.length < 3) return fail('Hacen falta al menos 3 personas apuntadas');
      const result = drawSanta();
      if (!result) return fail('No hay forma de sortear con estas exclusiones. Quita alguna y vuelve a intentarlo.');
      db.santa.assignments = result;
      return ok();
    }
    case '/api/admin/santa/reset':
      db.santa.assignments = null;
      return ok();
    case '/api/admin/poll': {
      const question = text(body.question, 200);
      const options = (Array.isArray(body.options) ? body.options : [])
        .map(parseOption).filter(Boolean).slice(0, 20);
      if (!question) return fail('Escribe la pregunta');
      if (options.length < 2) return fail('Pon al menos dos opciones');
      const closesAt = body.closesAt && !Number.isNaN(Date.parse(body.closesAt)) ? new Date(body.closesAt).toISOString() : '';
      db.polls.push({
        id: crypto.randomUUID(),
        question,
        multiple: !!body.multiple,
        anonymous: !!body.anonymous,
        closesAt,
        options: options.map((o) => ({ id: crypto.randomUUID().slice(0, 8), ...o })),
        votes: {},
        created: Date.now(),
      });
      return ok();
    }
    case '/api/admin/poll/edit': {
      const poll = db.polls.find((x) => x.id === body.id);
      if (!poll) return fail('Esa votación ya no existe', 404);
      const question = text(body.question, 200);
      const parsed = (Array.isArray(body.options) ? body.options : [])
        .map(parseOption).filter(Boolean).slice(0, 20);
      if (!question) return fail('Escribe la pregunta');
      if (parsed.length < 2) return fail('Pon al menos dos opciones');
      // Conserva el id (y por tanto los votos) de cada opción que sigue: primero por
      // nombre igual, y si no, la que estaba en la misma posición (para corregir erratas).
      const norm = (t) => t.trim().toLowerCase();
      const used = new Set();
      const ids = parsed.map((o) => {
        const same = poll.options.find((old) => !used.has(old.id) && norm(old.text) === norm(o.text));
        if (same) { used.add(same.id); return same.id; }
        return null;
      });
      parsed.forEach((o, i) => {
        const old = poll.options[i];
        if (!ids[i] && old && !used.has(old.id)) { used.add(old.id); ids[i] = old.id; }
      });
      const options = parsed.map((o, i) => ({ id: ids[i] || crypto.randomUUID().slice(0, 8), ...o }));
      const valid = new Set(options.map((o) => o.id));
      const multiple = !!body.multiple;
      for (const c of Object.keys(poll.votes)) {
        let v = poll.votes[c].filter((id) => valid.has(id));
        if (!multiple) v = v.slice(0, 1);
        if (v.length) poll.votes[c] = v; else delete poll.votes[c];
      }
      poll.question = question;
      poll.options = options;
      poll.multiple = multiple;
      poll.anonymous = !!body.anonymous;
      poll.closesAt = body.closesAt && !Number.isNaN(Date.parse(body.closesAt)) ? new Date(body.closesAt).toISOString() : '';
      return ok();
    }
    case '/api/admin/poll/delete':
      db.polls = db.polls.filter((poll) => poll.id !== body.id);
      return ok();
  }
  return fail('No encontrado', 404);
}

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

  if (req.method === 'POST' && ['/api/vote', '/api/santa/join', '/api/poll/vote'].includes(p)) {
    const body = await readBody(req);
    const code = normCode(body.code);
    if (!db.people[code]) return send(res, 404, { error: 'Código no válido' });

    if (p === '/api/vote') {
      const { date, value } = body;
      if (!validDate(date)) return send(res, 400, { error: 'Fecha no válida' });
      if (value === null || value === '') delete db.people[code].votes[date];
      else if (VALUES.has(value)) db.people[code].votes[date] = value;
      else return send(res, 400, { error: 'Valor no válido' });
    }

    if (p === '/api/santa/join') {
      if (!db.santa.enabled) return send(res, 400, { error: 'El amigo invisible no está activado' });
      if (db.santa.assignments) return send(res, 400, { error: 'El sorteo ya está hecho' });
      db.santa.joined = db.santa.joined.filter((c) => c !== code);
      if (body.join) db.santa.joined.push(code);
    }

    if (p === '/api/poll/vote') {
      const poll = db.polls.find((x) => x.id === body.pollId);
      if (!poll) return send(res, 404, { error: 'Votación no encontrada' });
      if (pollClosed(poll)) return send(res, 400, { error: 'La votación está cerrada' });
      const valid = new Set(poll.options.map((o) => o.id));
      const chosen = [...new Set(Array.isArray(body.optionIds) ? body.optionIds : [])].filter((id) => valid.has(id));
      if (!poll.multiple && chosen.length > 1) return send(res, 400, { error: 'Solo puedes elegir una opción' });
      if (chosen.length) poll.votes[code] = chosen; else delete poll.votes[code];
    }

    save();
    return send(res, 200, publicState(code));
  }

  if (p.startsWith('/api/admin')) {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const key = body.key || url.searchParams.get('key');
    if (!isAdmin(key)) return send(res, 401, { error: 'Clave incorrecta' });
    return handleAdmin(req, res, p, body);
  }

  send(res, 404, { error: 'No encontrado' });
});

server.listen(PORT, () => console.log(`Escuchando en el puerto ${PORT}`));
