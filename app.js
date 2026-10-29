'use strict';
/* Hantelbuch – Trainings-App für Manu & Rob.
   Alles, was passiert (Training, Skip, Planänderung, Entscheidung), wird als Eintrag in einem Log gespeichert:
   zuerst auf dem Handy, beim Sync in der Google-Tabelle. Der aktuelle Stand wird immer aus dem Log berechnet. */

const APP_VERSION = '1.0.0';
const PEOPLE = ['Manu', 'Rob'];
const DAYS = ['A', 'B', 'C'];
const TYPE_LABEL = { kg: 'Gewicht', bw: 'Körpergewicht', time: 'Zeit' };

function ex(id, name, type, sets, min, max, step, cue) {
  return { id, name, type, sets, min, max, step, cue, video: '', image: '' };
}
const DEFAULT_PLAN = {
  A: { title: 'Brust & Trizeps', exercises: [
    ex('bankdruecken', 'Bankdrücken (Langhantel)', 'kg', 4, 6, 8, 2.5, 'Schulterblätter zusammen, Füße fest am Boden, Stange zur unteren Brust führen, Ellbogen ca. 45° vom Körper.'),
    ex('schraegbank', 'Schrägbankdrücken (Kurzhantel, 30°)', 'kg', 3, 8, 12, 2, 'Hanteln tief absenken, oben nicht zusammenschlagen.'),
    ex('dips', 'Dips (Brust-Fokus)', 'bw', 3, 8, 12, 0, 'Oberkörper leicht nach vorn, absenken bis der Oberarm parallel zum Boden ist.'),
    ex('kabelflys', 'Kabelzug-Flys', 'kg', 3, 12, 15, 1.25, 'Leicht gebeugte Arme, Hände vor der Brust zusammenführen, 1 Sek. halten.'),
    ex('ueberkopf-trizeps', 'Überkopf-Trizepsstrecken am Kabel', 'kg', 3, 10, 12, 1.25, 'Ellbogen eng und fix, volle Dehnung hinter dem Kopf.'),
    ex('trizeps-seil', 'Trizepsdrücken am Kabel (Seil)', 'kg', 3, 12, 15, 1.25, 'Oberarme am Körper, unten das Seil auseinanderziehen.')
  ] },
  B: { title: 'Rücken & Bizeps', exercises: [
    ex('klimmzuege', 'Klimmzüge', 'bw', 4, 6, 10, 0, 'Schulterblätter zuerst nach unten ziehen, Brust zur Stange, unten ganz ausstrecken. Alternative: Latzug.'),
    ex('lh-rudern', 'Langhantelrudern vorgebeugt', 'kg', 4, 6, 8, 2.5, 'Rücken gerade, Oberkörper ca. 45°, Stange zum Bauchnabel ziehen.'),
    ex('kabelrudern', 'Kabelrudern sitzend (enger Griff)', 'kg', 3, 10, 12, 2.5, 'Brust raus, Ellbogen eng nach hinten, vorne kontrolliert dehnen.'),
    ex('facepulls', 'Face Pulls am Kabel', 'kg', 3, 12, 15, 1.25, 'Seil auf Augenhöhe, Hände neben die Ohren ziehen, Schultern nach außen drehen.'),
    ex('sz-curls', 'Langhantel-Curls (SZ-Stange)', 'kg', 3, 8, 12, 2.5, 'Ellbogen am Körper, kein Schwung aus dem Rücken.'),
    ex('hammer-curls', 'Hammer-Curls (Kurzhantel)', 'kg', 3, 10, 12, 2, 'Neutraler Griff, langsam absenken.')
  ] },
  C: { title: 'Beine & Bauch', exercises: [
    ex('kniebeugen', 'Kniebeugen (Langhantel)', 'kg', 4, 6, 8, 2.5, 'Füße schulterbreit, Knie über den Zehen, mindestens bis Oberschenkel parallel, Rücken neutral.'),
    ex('rdl', 'Rumänisches Kreuzheben', 'kg', 3, 8, 10, 2.5, 'Knie leicht gebeugt, Hüfte nach hinten schieben, Stange nah am Bein, Dehnung im Beinbizeps.'),
    ex('beinpresse', 'Beinpresse', 'kg', 3, 10, 12, 5, 'Unterer Rücken bleibt am Polster, Knie oben nicht ganz durchstrecken.'),
    ex('beinbeuger', 'Beinbeuger', 'kg', 3, 10, 12, 2.5, 'Hüfte fest aufs Polster, langsam zurückführen.'),
    ex('wadenheben', 'Wadenheben stehend', 'kg', 3, 12, 15, 2.5, 'Unten voll dehnen, oben 1 Sek. halten.'),
    ex('beinheben', 'Hängendes Beinheben', 'bw', 3, 10, 15, 0, 'Becken einrollen statt nur die Beine zu schwingen. Alternative: Kabel-Crunch.'),
    ex('plank', 'Plank', 'time', 3, 30, 60, 0, 'Körper in einer Linie, Bauch und Po anspannen.')
  ] }
};

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => (self.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const int = v => { const n = parseInt(String(v ?? ''), 10); return isFinite(n) && n > 0 ? n : 0; };
const fmtN = n => (Math.round(n * 100) / 100).toLocaleString('de-DE');
const fmtDate = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtTime = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gen = p => (/s$/.test(p) ? p + "'" : p + 's');
const cls = p => (p === 'Rob' ? 'rob' : 'manu');
const partner = () => PEOPLE.find(p => p !== cfg.me);
const videoUrl = x => x.video || 'https://www.youtube.com/results?search_query=' + encodeURIComponent(x.name + ' richtige Ausführung');
function relDay(iso) {
  const d = new Date(iso), t = new Date();
  const n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return n <= 0 ? 'heute' : n === 1 ? 'gestern' : n < 7 ? `vor ${n} Tagen` : fmtDate(iso);
}
function duration(a, b) { const m = Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }
function weekStart() { const d = new Date(); const day = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day); }

const ICON = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  sync: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/></svg>'
};

/* ---------- Lokaler Speicher ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('hb.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('hb.' + k, JSON.stringify(v)); } catch (e) { toast('Speichern auf dem Handy fehlgeschlagen. Ist der Speicher voll?'); } }
};
let cfg = LS.get('cfg', { me: null, url: '', key: '' });
let events = LS.get('events', []);     // aus der Tabelle, mit laufender Nummer (seq)
let pending = LS.get('pending', []);   // auf diesem Handy erstellt, noch nicht zurückgelesen
let lastSeq = LS.get('lastSeq', 0);
let lastSync = LS.get('lastSync', null);
let draft = LS.get('draft', null);     // laufendes Training
let seenIds = new Set(events.map(e => e.id));

function saveLog() { LS.set('events', events); LS.set('pending', pending); LS.set('lastSeq', lastSeq); }
function saveDraft() { LS.set('draft', draft); }

function addEvent(type, data, summary) {
  const e = { id: uid(), ts: new Date().toISOString(), person: cfg.me, type, data, summary };
  pending.push(e); saveLog(); invalidate();
  sync({ quiet: true });
  return e;
}

/* ---------- Zustand aus dem Log berechnen ---------- */
let _st = null;
function invalidate() { _st = null; }
function st() { return _st || (_st = buildState()); }

/* Daten aus der Tabelle immer bereinigen, bevor sie angezeigt werden */
const safeUrl = v => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim() : '');
const str = (v, n = 500) => String(v ?? '').slice(0, n);
function cleanEx(x) {
  const type = TYPE_LABEL[x && x.type] ? x.type : 'kg';
  const min = int(x && x.min) || 1;
  const o = { id: str(x && x.id, 64) || 'x-' + uid().slice(0, 8), name: str(x && x.name, 80) || 'Übung', type, sets: Math.min(10, int(x && x.sets) || 3), min, max: Math.max(min, int(x && x.max) || min), step: type === 'kg' ? Math.max(0, num(x && x.step)) : 0, cue: str(x && x.cue), video: safeUrl(x && x.video), image: safeUrl(x && x.image) };
  if (x && x.replaces) o.replaces = str(x.replaces, 64);
  return o;
}
function cleanEntry(en) {
  const type = TYPE_LABEL[en && en.type] ? en.type : 'kg';
  return { exId: str(en && en.exId, 64), name: str(en && en.name, 80), type, note: str(en && en.note, 1000),
    sets: (Array.isArray(en && en.sets) ? en.sets : []).slice(0, 20).map(s => type === 'kg' ? { w: num(s && s.w), r: int(s && s.r) } : { r: int(s && s.r) }) };
}

function buildState() {
  const all = events.slice().sort((a, b) => a.seq - b.seq)
    .concat(pending.filter(p => !seenIds.has(p.id)).sort((a, b) => a.ts.localeCompare(b.ts)));
  const s = { plans: {}, last: {}, workouts: [], feed: [], changes: {}, decisions: {}, hist: {}, exInfo: {} };
  PEOPLE.forEach(p => { s.plans[p] = clone(DEFAULT_PLAN); s.hist[p] = {}; s.last[p] = null; });
  DAYS.forEach(d => DEFAULT_PLAN[d].exercises.forEach(x => { s.exInfo[x.id] = { name: x.name, type: x.type }; }));
  for (const e of all) {
    if (!PEOPLE.includes(e.person) || !e.id || !e.ts) continue;
    const d = e.data || {};
    if (e.type === 'workout') {
      if (!DAYS.includes(d.day)) continue;
      d.title = str(d.title, 40); d.entries = (Array.isArray(d.entries) ? d.entries : []).map(cleanEntry);
      if (isNaN(new Date(d.start))) d.start = e.ts;
      if (isNaN(new Date(d.end))) d.end = e.ts;
      s.workouts.push(e); s.last[e.person] = { day: d.day, ts: e.ts, kind: 'workout' };
      (d.entries || []).forEach(en => {
        (s.hist[e.person][en.exId] = s.hist[e.person][en.exId] || []).push({ ts: e.ts, wid: e.id, sets: en.sets || [], note: en.note || '', type: en.type, name: en.name, day: d.day, person: e.person });
        s.exInfo[en.exId] = { name: en.name, type: en.type };
      });
      s.feed.push(e);
    } else if (e.type === 'skip') {
      if (!DAYS.includes(d.day)) continue;
      s.last[e.person] = { day: d.day, ts: e.ts, kind: 'skip' }; s.feed.push(e);
    } else if (e.type === 'plan_change') {
      if (!DAYS.includes(d.day) || !Array.isArray(d.exercises)) continue;
      d.title = str(d.title, 40) || DEFAULT_PLAN[d.day].title; d.exercises = d.exercises.slice(0, 20).map(cleanEx);
      d.changes = (Array.isArray(d.changes) ? d.changes : []).slice(0, 30).map(c => ({ k: str(c && c.k, 10), a: str(c && c.a, 80), b: str(c && c.b, 80), ch: (Array.isArray(c && c.ch) ? c.ch : []).map(v => str(v, 80)) }));
      s.plans[e.person][d.day] = { title: d.title, exercises: clone(d.exercises) };
      d.exercises.forEach(x => { s.exInfo[x.id] = { name: x.name, type: x.type }; });
      s.changes[e.id] = e; s.feed.push(e);
    } else if (e.type === 'plan_decision') {
      const ch = s.changes[d.changeId];
      s.decisions[e.person + '|' + d.changeId] = { decision: d.decision, ts: e.ts };
      if (ch && d.decision === 'accepted') s.plans[e.person][ch.data.day] = { title: ch.data.title, exercises: clone(ch.data.exercises) };
      s.feed.push(e);
    }
  }
  s.feed.reverse();
  return s;
}

function nextDay(p) { const l = st().last[p]; return l ? DAYS[(DAYS.indexOf(l.day) + 1) % 3] : 'A'; }
function isPending(id) { return !seenIds.has(id) && pending.some(p => p.id === id && !p.pushed); }

/* Kennzahl je Sitzung: Gewicht = schwerster Satz, Körpergewicht = Wdh. gesamt, Zeit = längster Satz */
function metric(type, sets) {
  if (!sets || !sets.length) return null;
  if (type === 'kg') { const v = sets.filter(s => s.r > 0).map(s => num(s.w)); return v.length ? Math.max(...v) : null; }
  if (type === 'bw') return sets.reduce((a, s) => a + (s.r || 0), 0);
  return Math.max(...sets.map(s => s.r || 0));
}
const metricLabel = (type, v) => v == null ? '–' : type === 'kg' ? fmtN(v) + ' kg' : type === 'bw' ? v + ' Wdh.' : v + ' s';
const metricName = type => type === 'kg' ? 'Schwerster Satz' : type === 'bw' ? 'Wiederholungen gesamt' : 'Längster Satz';
function fmtSets(type, sets) {
  if (!sets || !sets.length) return '–';
  if (type === 'kg') return sets.map(s => `${fmtN(num(s.w))}×${int(s.r)}`).join(' · ');
  return sets.map(s => int(s.r)).join(' · ') + (type === 'bw' ? ' Wdh.' : ' s');
}
const lastSession = (p, exId) => { const h = st().hist[p][exId]; return h && h.length ? h[h.length - 1] : null; };

function improvements(e) {
  const s = st(), out = [];
  (e.data.entries || []).forEach(en => {
    const h = s.hist[e.person][en.exId] || [];
    const i = h.findIndex(x => x.wid === e.id);
    if (i <= 0) return;
    const cur = metric(en.type, en.sets); if (cur == null) return;
    const prev = h.slice(0, i).filter(x => x.type === en.type).map(x => metric(x.type, x.sets)).filter(v => v != null);
    if (!prev.length) return;
    const last = prev[prev.length - 1], best = Math.max(...prev);
    if (cur > last) out.push({ name: en.name, exId: en.exId, delta: cur - last, type: en.type, pr: cur > best });
  });
  return out;
}
const deltaLabel = i => '+' + (i.type === 'kg' ? fmtN(i.delta) + ' kg' : i.type === 'bw' ? i.delta + ' Wdh.' : i.delta + ' s');

function suggestion(x) {
  const l = lastSession(cfg.me, x.id);
  if (!l || l.type !== x.type) return { w: '', up: false };
  if (x.type !== 'kg') return { w: '', up: false, target: metric(x.type, l.sets) };
  const w = metric('kg', l.sets) || 0;
  const topped = l.sets.length >= x.sets && l.sets.every(s => s.r >= x.max);
  return topped && x.step ? { w: +(w + x.step).toFixed(2), up: true } : { w, up: false };
}

/* ---------- Planvergleich ---------- */
function fieldChanges(a, b) {
  const c = [];
  if (a.name !== b.name) c.push('Name');
  if (a.type !== b.type) c.push(`Art ${TYPE_LABEL[a.type]} → ${TYPE_LABEL[b.type]}`);
  if (a.sets !== b.sets) c.push(`Sätze ${a.sets} → ${b.sets}`);
  if (a.min !== b.min || a.max !== b.max) c.push(`${b.type === 'time' ? 'Sek.' : 'Wdh.'} ${a.min}–${a.max} → ${b.min}–${b.max}`);
  if (b.type === 'kg' && a.step !== b.step) c.push(`Steigerung ${fmtN(a.step || 0)} → ${fmtN(b.step || 0)} kg`);
  if ((a.cue || '') !== (b.cue || '')) c.push('Ausführung');
  if ((a.video || '') !== (b.video || '')) c.push('Video');
  if ((a.image || '') !== (b.image || '')) c.push('Bild');
  return c;
}
function diffPlan(from, to) {
  const out = [];
  if ((from.title || '') !== (to.title || '')) out.push({ k: 'title', a: from.title, b: to.title });
  const fm = new Map(from.exercises.map(x => [x.id, x])), tm = new Map(to.exercises.map(x => [x.id, x]));
  to.exercises.forEach(x => {
    if (!fm.has(x.id)) {
      if (x.replaces && fm.has(x.replaces) && !tm.has(x.replaces)) out.push({ k: 'replace', a: fm.get(x.replaces).name, b: x.name });
      else out.push({ k: 'add', b: x.name });
    } else {
      const ch = fieldChanges(fm.get(x.id), x);
      if (ch.length) out.push({ k: 'edit', b: x.name, ch });
    }
  });
  from.exercises.forEach(x => { if (!tm.has(x.id) && !to.exercises.some(y => y.replaces === x.id && !fm.has(y.id))) out.push({ k: 'remove', a: x.name }); });
  const common = to.exercises.filter(x => fm.has(x.id)).map(x => x.id).join();
  const commonFrom = from.exercises.filter(x => tm.has(x.id)).map(x => x.id).join();
  if (common !== commonFrom) out.push({ k: 'order' });
  return out;
}
const DIFF_SIGN = { add: '+', remove: '−', replace: '⇄', edit: '~', order: '↕', title: '~' };
function diffText(d) {
  switch (d.k) {
    case 'add': return `Neu: ${d.b}`;
    case 'remove': return `Entfernt: ${d.a}`;
    case 'replace': return `${d.a} ersetzt durch ${d.b}`;
    case 'edit': return `${d.b}: ${d.ch.join(', ')}`;
    case 'order': return 'Reihenfolge geändert';
    case 'title': return `Name des Tages: ${d.a} → ${d.b}`;
  }
  return '';
}
const diffList = list => `<ul class="diff">${list.map(d => `<li class="${d.k}"><span class="s">${DIFF_SIGN[d.k]}</span><span>${esc(diffText(d))}</span></li>`).join('')}</ul>`;

function partnerChanges() {
  const s = st(), other = partner();
  const list = Object.values(s.changes).filter(c => c.person === other);
  const latest = {}; list.forEach(c => { latest[c.data.day] = c.id; });
  return list.slice().reverse().map(c => {
    const dec = s.decisions[cfg.me + '|' + c.id];
    const superseded = latest[c.data.day] !== c.id;
    const diff = diffPlan(s.plans[cfg.me][c.data.day], c.data);
    const status = dec ? dec.decision : superseded ? 'superseded' : 'open';
    return { c, dec, superseded, diff, status };
  });
}
const openChanges = () => partnerChanges().filter(x => x.status === 'open' && x.diff.length);

/* ---------- Synchronisation mit der Google-Tabelle ---------- */
const loader = {
  el: () => $('#loader'),
  show() { const l = this.el(); l.hidden = false; l.className = 'loader busy'; this.set(0, 'Verbinde …', ''); },
  set(p, text, sub) {
    p = Math.max(0, Math.min(100, Math.round(p)));
    $('#ld-bar').style.strokeDashoffset = String(326.73 * (1 - p / 100));
    $('#ld-pct').textContent = p + ' %';
    if (text != null) $('#ld-text').textContent = text;
    if (sub != null) $('#ld-sub').textContent = sub;
  },
  async error(text, sub) { this.el().className = 'loader error'; $('#ld-text').textContent = text; $('#ld-sub').textContent = sub || ''; await sleep(2200); },
  hide() { this.el().hidden = true; }
};
const mini = {
  show() { $('#topbar').hidden = false; this.set(4); },
  set(p) { $('#topbar i').style.width = Math.max(0, Math.min(100, p)) + '%'; },
  async error() {},
  hide() { setTimeout(() => { $('#topbar').hidden = true; this.set(0); }, 300); }
};

let syncing = null, syncError = null;
async function call(body) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key: cfg.key }), signal: ctrl.signal, redirect: 'follow' });
    let json; try { json = await res.json(); } catch (e) { throw { code: 'bad_response' }; }
    if (!json.ok) throw { code: json.error || 'server' };
    return json;
  } catch (e) {
    if (e && e.code) throw e;
    throw { code: 'network' };
  } finally { clearTimeout(t); }
}
const SYNC_ERR = {
  unauthorized: ['Sync-Schlüssel stimmt nicht', 'Prüfe den Schlüssel unter Einstellungen.'],
  network: ['Keine Verbindung zur Tabelle', 'Deine Einträge bleiben gespeichert und werden beim nächsten Öffnen gesendet.'],
  offline: ['Offline', 'Deine Einträge bleiben gespeichert und werden beim nächsten Öffnen gesendet.'],
  bad_response: ['Unerwartete Antwort', 'Prüfe die Sync-Adresse unter Einstellungen (endet auf /exec).']
};
function addSynced(ev) {
  if (!ev || !ev.id || seenIds.has(ev.id)) { if (ev && ev.seq > lastSeq) lastSeq = ev.seq; return; }
  if (typeof ev.data === 'string') { try { ev.data = JSON.parse(ev.data); } catch (e) { ev.data = {}; } }
  events.push({ seq: ev.seq, id: ev.id, ts: ev.ts, person: ev.person, type: ev.type, summary: ev.summary, data: ev.data });
  seenIds.add(ev.id);
  if (ev.seq > lastSeq) lastSeq = ev.seq;
}

function sync({ overlay = false, quiet = false } = {}) {
  if (!cfg.url || !cfg.key) return Promise.resolve({ ok: false, code: 'nocfg' });
  if (syncing) return syncing;
  const ui = overlay ? loader : mini;
  syncing = (async () => {
    await Promise.resolve(); // erst nach der Zuweisung oben weiterlaufen, sonst bleibt "syncing" hängen
    ui.show();
    try {
      if (navigator.onLine === false) throw { code: 'offline' };
      const toPush = pending.filter(p => !seenIds.has(p.id));
      const batches = []; for (let i = 0; i < toPush.length; i += 25) batches.push(toPush.slice(i, i + 25));
      const pushShare = batches.length ? 0.4 : 0;
      ui.set(4, toPush.length ? `Sende ${toPush.length} ${toPush.length === 1 ? 'Eintrag' : 'Einträge'} …` : 'Prüfe auf Neuigkeiten …', '');
      for (let i = 0; i < batches.length; i++) {
        await call({ action: 'push', events: batches[i].map(e => ({ id: e.id, ts: e.ts, person: e.person, type: e.type, summary: e.summary || '', data: e.data })) });
        batches[i].forEach(e => { e.pushed = true; });
        LS.set('pending', pending);
        ui.set(4 + 92 * pushShare * ((i + 1) / batches.length), null, `${Math.min((i + 1) * 25, toPush.length)} von ${toPush.length} gesendet`);
      }
      const start = lastSeq; let guard = 0;
      while (guard++ < 400) {
        const r = await call({ action: 'pull', since: lastSeq, limit: 200 });
        (r.events || []).forEach(addSynced);
        const total = r.total || lastSeq;
        const frac = total > start ? (lastSeq - start) / (total - start) : 1;
        ui.set(4 + 92 * pushShare + 92 * (1 - pushShare) * frac, 'Lade Verlauf …', total > start ? `${lastSeq - start} von ${total - start} neuen Einträgen` : 'Alles aktuell');
        if (!r.more || !(r.events || []).length) break;
      }
      pending = pending.filter(p => !seenIds.has(p.id));
      saveLog();
      lastSync = new Date().toISOString(); LS.set('lastSync', lastSync); syncError = null;
      ui.set(100, 'Fertig', '');
      if (overlay) await sleep(400);
      return { ok: true };
    } catch (err) {
      const code = (err && err.code) || 'server';
      syncError = code;
      const [t, s] = SYNC_ERR[code] || ['Sync fehlgeschlagen', `Fehler: ${code}`];
      if (overlay) await ui.error(t, s);
      else if (!quiet) toast(t);
      return { ok: false, code };
    } finally {
      ui.hide(); syncing = null; invalidate(); render();
    }
  })();
  return syncing;
}

/* ---------- Oberfläche ---------- */
let view = '', verlaufTab = 'aktiv', notesFilter = 'Alle', skipAsk = false, finishAsk = false, discardAsk = false, builder = null, resetAsk = false;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

function head(title) {
  const n = cfg.me ? openChanges().length : 0;
  return `<header class="head" id="head">
    <div class="brand">${title}</div>
    <a class="iconbtn" href="#glocke" aria-label="Benachrichtigungen${n ? ', ' + n + ' neu' : ''}">${ICON.bell}${n ? `<span class="badge">${n}</span>` : ''}</a>
    <a class="iconbtn" href="#einstellungen" aria-label="Einstellungen">${ICON.gear}</a>
  </header>`;
}
function tabbar(active) {
  const t = (id, label, icon) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar">${t('start', 'Start', ICON.home)}${t('verlauf', 'Verlauf', ICON.chart)}${t('plan', 'Plan', ICON.list)}${t('notizen', 'Notizen', ICON.note)}</nav>`;
}
const subhead = (title, backTo = 'start') => `<header class="head" id="head"><a class="back" href="#${backTo}">${ICON.back} Zurück</a><div class="brand" style="text-align:right">${title}</div></header>`;

function render() {
  const app = $('#app');
  if (!cfg.me) { app.innerHTML = viewSetup(); return; }
  const h = decodeURIComponent(location.hash.slice(1)) || 'start';
  const [name, arg] = h.includes(':') ? [h.slice(0, h.indexOf(':')), h.slice(h.indexOf(':') + 1)] : [h, ''];
  if (name !== view) { skipAsk = finishAsk = discardAsk = resetAsk = false; }
  let html;
  switch (name) {
    case 'training': html = draft ? viewTraining() : (location.hash = '#start', ''); break;
    case 'verlauf': html = head('Verlauf') + `<main class="view">${viewVerlauf()}</main>` + tabbar('verlauf'); break;
    case 'plan': html = head('Plan') + `<main class="view">${viewPlan()}</main>` + tabbar('plan'); break;
    case 'notizen': html = head('Notizen') + `<main class="view">${viewNotes()}</main>` + tabbar('notizen'); break;
    case 'glocke': html = subhead('Planänderungen') + `<main class="view">${viewBell()}</main>` + tabbar(''); break;
    case 'einstellungen': html = subhead('Einstellungen') + `<main class="view">${viewSettings()}</main>` + tabbar(''); break;
    case 'uebung': html = subhead('Übung', 'verlauf') + `<main class="view">${viewExercise(arg)}</main>` + tabbar('verlauf'); break;
    case 'training-log': html = subhead('Training', 'verlauf') + `<main class="view">${viewWorkout(arg)}</main>` + tabbar('verlauf'); break;
    default: html = head(`Hantelbuch<small>${esc(cfg.me)}</small>`) + `<main class="view">${viewStart()}</main>` + tabbar('start');
  }
  if (html === undefined || html === '') return;
  app.innerHTML = html;
  if (name !== view) { window.scrollTo(0, 0); view = name; }
  onScroll();
}
function onScroll() { const h = $('#head'); if (h) h.classList.toggle('scrolled', window.scrollY > 4); }
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- Start ---------- */
function syncLine() {
  const waiting = pending.filter(p => !seenIds.has(p.id) && !p.pushed).length;
  if (!cfg.url) return `<div class="syncline"><i class="dot off"></i><span>Ohne Sync – Einträge bleiben nur auf diesem Handy.</span><a class="linkbtn" href="#einstellungen">Einrichten</a></div>`;
  const txt = syncError && waiting ? `${waiting} ${waiting === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Sync` :
    waiting ? `${waiting} ${waiting === 1 ? 'Eintrag wird' : 'Einträge werden'} gesendet …` :
    lastSync ? `Synchronisiert ${relDay(lastSync)}, ${fmtTime(lastSync)}` : 'Noch nicht synchronisiert';
  return `<div class="syncline"><i class="dot ${waiting ? 'wait' : ''}"></i><span>${txt}</span><button class="linkbtn" data-act="sync">${ICON.sync} Sync</button></div>`;
}

function viewStart() {
  const s = st(), me = cfg.me, other = partner();
  const nd = nextDay(me), plan = s.plans[me][nd];
  const nSets = plan.exercises.reduce((a, x) => a + (+x.sets || 0), 0);
  const lastDone = s.workouts.filter(w => w.person === me && w.data.day === nd).pop();
  const lastAny = s.last[me];
  const rot = DAYS.map(d => `<div class="rot ${d === nd && !draft ? 'next' : ''}"><b>${d}</b><span>${esc(s.plans[me][d].title)}</span></div>`).join('');
  const opn = openChanges().find(x => x.c.data.day === nd);
  let main;
  if (draft) {
    main = `<div class="eyebrow">Training läuft · Tag ${draft.day}</div>
      <h2 class="display">${esc(draft.title)}</h2>
      <div class="muted">Begonnen ${relDay(draft.start)} um ${fmtTime(draft.start)}</div>
      <a class="btn primary" href="#training">Training fortsetzen</a>`;
  } else {
    main = `<div class="eyebrow">Als Nächstes · Tag ${nd}</div>
      <h2 class="display">${esc(plan.title)}</h2>
      <div class="muted">${plan.exercises.length} Übungen · ${nSets} Sätze${lastDone ? ` · zuletzt ${relDay(lastDone.ts)}` : ''}</div>
      ${opn ? `<a class="banner" href="#glocke"><span><b>${esc(other)}</b> hat Tag ${nd} geändert. Ansehen</span></a>` : ''}
      <button class="btn primary" data-act="start">Training starten</button>
      ${skipAsk ? `<div class="confirm"><div><b>Tag ${nd} überspringen?</b><br><span class="small">Danach ist bei dir Tag ${DAYS[(DAYS.indexOf(nd) + 1) % 3]} dran. ${esc(other)}s Rotation bleibt unverändert.</span></div>
        <div class="btnrow"><button class="btn small" data-act="skip-yes">Überspringen</button><button class="btn small ghost" data-act="skip-no">Abbrechen</button></div></div>`
        : `<button class="btn ghost" data-act="skip-ask">Tag ${nd} überspringen</button>`}`;
  }
  const wk = weekStart();
  const weekCount = p => s.workouts.filter(w => w.person === p && new Date(w.ts) >= wk).length;
  const ol = s.last[other];
  const install = !(navigator.standalone || matchMedia('(display-mode: standalone)').matches) && /iPhone|iPad/.test(navigator.userAgent)
    ? `<div class="install"><span>Tipp: Tippe in Safari auf <b>Teilen</b> und dann <b>Zum Home-Bildschirm</b>. Dann läuft die App wie eine normale App und auch offline.</span></div>` : '';
  const feed = s.feed.slice(0, 5);
  return `${install}
    <section class="hero">${main}<div class="rotation" aria-label="Deine Rotation">${rot}</div></section>
    ${syncLine()}
    <div class="duo">
      <section class="card"><span class="who ${cls(me)}">Du</span><span class="big">${weekCount(me)}</span><span class="small muted">Trainings diese Woche${lastAny ? `<br>zuletzt ${relDay(lastAny.ts)}` : ''}</span></section>
      <section class="card"><span class="who ${cls(other)}">${esc(other)}</span><span class="big">${weekCount(other)}</span><span class="small muted">Trainings diese Woche<br>${ol ? `${ol.kind === 'skip' ? 'übersprungen' : 'zuletzt'} ${relDay(ol.ts)} · als Nächstes Tag ${nextDay(other)}` : 'noch kein Eintrag'}</span></section>
    </div>
    <div class="sec-title"><h2>Neuigkeiten</h2>${s.feed.length > 5 ? '<a href="#verlauf">Alle anzeigen</a>' : ''}</div>
    <section class="card">${feed.length ? `<div class="feed">${feed.map(feedItem).join('')}</div>` : '<div class="empty">Hier erscheinen eure Trainings, Steigerungen und Planänderungen.</div>'}</section>`;
}

function feedItem(e) {
  const d = e.data || {}, p = e.person;
  const wait = isPending(e.id) ? '<span class="chip wait">noch nicht synchronisiert</span>' : '';
  let t = '', m = fmtDate(e.ts) + ', ' + fmtTime(e.ts), extra = '', href = '';
  if (e.type === 'workout') {
    const n = (d.entries || []).reduce((a, en) => a + en.sets.length, 0);
    const imp = improvements(e);
    t = `<b>${esc(p)}</b> hat Tag ${d.day} · ${esc(d.title)} abgeschlossen`;
    m += ` · ${duration(d.start, d.end)} · ${n} ${n === 1 ? 'Satz' : 'Sätze'}`;
    const notes = (d.entries || []).filter(en => en.note).length;
    extra = imp.map(i => `<span class="chip ${i.pr ? 'pr' : 'up'}">${esc(i.name.replace(/\s*\(.*\)$/, ''))} ${deltaLabel(i)}${i.pr ? ' · Rekord' : ''}</span>`).join('')
      + (notes ? `<span class="chip">${notes} ${notes === 1 ? 'Notiz' : 'Notizen'}</span>` : '');
    href = '#training-log:' + encodeURIComponent(e.id);
  } else if (e.type === 'skip') {
    t = `<b>${esc(p)}</b> hat Tag ${d.day} übersprungen`;
  } else if (e.type === 'plan_change') {
    t = `<b>${esc(p)}</b> hat Tag ${d.day} · ${esc(d.title)} geändert`;
    extra = (d.changes || []).slice(0, 3).map(c => `<span class="chip">${esc(diffText(c))}</span>`).join('');
    if (p !== cfg.me) href = '#glocke';
  } else if (e.type === 'plan_decision') {
    const ch = st().changes[d.changeId]; const author = ch ? ch.person : '';
    const whose = author === cfg.me ? 'deine' : gen(author);
    t = `<b>${esc(p)}</b> hat ${esc(whose)} Änderung an Tag ${ch ? ch.data.day : '?'} ${d.decision === 'accepted' ? 'übernommen' : 'abgelehnt'}`;
  }
  const inner = `<div class="av ${cls(p)}">${esc(p[0])}</div><div><div class="t">${t}</div><div class="m">${m}</div>${extra || wait ? `<div class="chips">${extra}${wait}</div>` : ''}</div>`;
  return href ? `<a class="fi" href="${href}">${inner}</a>` : `<div class="fi">${inner}</div>`;
}

/* ---------- Training ---------- */
function startTraining() {
  const day = nextDay(cfg.me), plan = st().plans[cfg.me][day];
  draft = {
    day, title: plan.title, start: new Date().toISOString(),
    items: plan.exercises.map(x => {
      const sg = suggestion(x);
      return { ex: clone(x), note: '', sets: Array.from({ length: Math.max(1, +x.sets || 1) }, () => ({ w: x.type === 'kg' ? (sg.w === '' ? '' : String(sg.w).replace('.', ',')) : '', r: '', done: false })) };
    })
  };
  saveDraft(); location.hash = '#training';
}
function draftProgress() {
  let done = 0, tot = 0;
  draft.items.forEach(it => it.sets.forEach(s => { tot++; if (s.done) done++; }));
  return { done, tot };
}
function viewTraining() {
  const { done, tot } = draftProgress();
  const opn = openChanges().find(x => x.c.data.day === draft.day);
  return `<header class="trainhead" id="head">
      <div class="row"><a class="back" href="#start">${ICON.back} Start</a><span class="mono small muted" id="tp-count">${done}/${tot} Sätze</span></div>
      <div class="row"><h1 class="display">Tag ${draft.day} · ${esc(draft.title)}</h1></div>
      <div class="bar"><i id="tp-bar" style="width:${tot ? done / tot * 100 : 0}%"></i></div>
    </header>
    <main class="view notab">
      ${opn ? `<a class="banner" href="#glocke"><span><b>${esc(partner())}</b> hat Tag ${draft.day} geändert. Du trainierst gerade nach deinem bisherigen Plan.</span></a>` : ''}
      ${draft.items.map((it, i) => exCard(it, i)).join('')}
      <div class="finishbar">${finishAsk ? finishPanel() : `<button class="btn accent" data-act="finish-ask">Training abschließen</button>`}
        ${discardAsk ? `<div class="confirm"><b>Training verwerfen?</b><span class="small">Alle Einträge dieses Trainings gehen verloren. Deine Rotation bleibt unverändert.</span>
          <div class="btnrow"><button class="btn small danger" data-act="discard-yes">Verwerfen</button><button class="btn small ghost" data-act="discard-no">Abbrechen</button></div></div>`
          : `<button class="btn ghost danger" data-act="discard-ask">Training verwerfen</button>`}</div>
    </main>`;
}
function exCard(it, i) {
  const x = it.ex, other = partner();
  const mine = lastSession(cfg.me, x.id), theirs = lastSession(other, x.id);
  const sg = suggestion(x);
  const unit = x.type === 'time' ? ' s' : '';
  const allDone = it.sets.length && it.sets.every(s => s.done);
  let hint = '';
  if (sg.up) hint = `Letztes Mal alle Sätze mit ${x.max} Wdh. geschafft. Heute +${fmtN(x.step)} kg.`;
  else if (x.type === 'bw' && sg.target) hint = `Ziel: mehr als ${sg.target} Wdh. insgesamt`;
  else if (x.type === 'time' && sg.target) hint = `Ziel: länger als ${sg.target} s`;
  const lastReps = j => (mine && mine.sets[j] && mine.type === x.type ? mine.sets[j].r : x.max);
  const rows = it.sets.map((s, j) => `<div class="set ${s.done ? 'ok' : ''}">
      <span class="n">${j + 1}</span>
      ${x.type === 'kg' ? `<label class="field"><input id="w-${i}-${j}" data-i="${i}" data-j="${j}" data-f="w" inputmode="decimal" autocomplete="off" aria-label="Gewicht Satz ${j + 1}" value="${esc(s.w)}" placeholder="–"><span>kg</span></label>` : ''}
      <label class="field"><input id="r-${i}-${j}" data-i="${i}" data-j="${j}" data-f="r" inputmode="numeric" autocomplete="off" aria-label="${x.type === 'time' ? 'Sekunden' : 'Wiederholungen'} Satz ${j + 1}" value="${esc(s.r)}" placeholder="${lastReps(j)}"><span>${x.type === 'time' ? 's' : '×'}</span></label>
      <button class="check" data-act="check" data-i="${i}" data-j="${j}" aria-label="Satz ${j + 1} erledigt" aria-pressed="${s.done}">${ICON.check}</button>
    </div>`).join('');
  const cols = x.type === 'kg' ? '<div class="cols"><span>Satz</span><span class="r">kg</span><span class="r">Wdh.</span><span></span></div>'
    : `<div class="cols"><span>Satz</span><span class="r">${x.type === 'time' ? 'Sekunden' : 'Wdh.'}</span><span></span></div>`;
  return `<article class="ex ${allDone ? 'done' : ''}" data-card="${i}">
    <div class="ex-head"><h3>${esc(x.name)}</h3><span class="tgt">${x.sets}×${x.min}–${x.max}${unit}</span></div>
    <div class="lastline"><span class="who ${cls(cfg.me)}">Du</span><span class="v">${mine && mine.type === x.type ? fmtSets(x.type, mine.sets) : 'noch kein Eintrag'}</span>${mine ? `<span>${relDay(mine.ts)}</span>` : ''}</div>
    ${theirs ? `<div class="lastline"><span class="who ${cls(other)}">${esc(other)}</span><span class="v">${fmtSets(theirs.type, theirs.sets)}</span><span>${relDay(theirs.ts)}</span></div>` : ''}
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
    ${mine && mine.note ? `<div class="quote ${cls(cfg.me)} small">Deine Notiz vom letzten Mal: ${esc(mine.note)}</div>` : ''}
    <details class="how"><summary>Ausführung & Video</summary><div class="body">
      ${x.cue ? `<p>${esc(x.cue)}</p>` : ''}
      ${x.image ? `<img src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy">` : ''}
      <a class="vlink" href="${esc(videoUrl(x))}" target="_blank" rel="noopener">▶ ${x.video ? 'Video ansehen' : 'Videos auf YouTube suchen'}</a>
    </div></details>
    <div class="sets ${x.type}">${cols}${rows}</div>
    <button class="addset" data-act="addset" data-i="${i}">+ Satz hinzufügen</button>
    <label class="note"><span>Notiz</span><textarea id="note-${i}" data-note="${i}" rows="2" placeholder="z. B. Schulter zwickt, nächstes Mal enger greifen">${esc(it.note)}</textarea></label>
  </article>`;
}
function rerenderCard(i) {
  const el = document.querySelector(`[data-card="${i}"]`);
  if (el) { const d = el.querySelector('details.how'); const open = d && d.open; el.outerHTML = exCard(draft.items[i], i); if (open) document.querySelector(`[data-card="${i}"] details.how`).open = true; }
  updateTrainHead();
}
function updateTrainHead() {
  const { done, tot } = draftProgress();
  const c = $('#tp-count'), b = $('#tp-bar');
  if (c) c.textContent = `${done}/${tot} Sätze`;
  if (b) b.style.width = (tot ? done / tot * 100 : 0) + '%';
}
function collectEntries() {
  return draft.items.map(it => {
    const x = it.ex;
    const sets = it.sets.filter(s => s.done || int(s.r) > 0).map(s => x.type === 'kg' ? { w: num(s.w), r: int(s.r) } : { r: int(s.r) }).filter(s => s.r > 0);
    return { exId: x.id, name: x.name, type: x.type, sets, note: (it.note || '').trim() };
  }).filter(en => en.sets.length || en.note);
}
function finishPanel() {
  const entries = collectEntries();
  const sets = entries.reduce((a, en) => a + en.sets.length, 0);
  const vol = entries.filter(en => en.type === 'kg').reduce((a, en) => a + en.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
  const empty = draft.items.filter(it => !entries.some(en => en.exId === it.ex.id)).map(it => it.ex.name);
  return `<div class="card">
    <b>Training abschließen?</b>
    <dl class="kv"><dt>Sätze</dt><dd>${sets}</dd><dt>Volumen</dt><dd>${fmtN(Math.round(vol))} kg</dd><dt>Dauer</dt><dd>${duration(draft.start, new Date().toISOString())}</dd></dl>
    ${empty.length ? `<div class="small muted">Ohne Eintrag: ${esc(empty.join(', '))}</div>` : ''}
    ${sets ? '' : '<div class="err">Trage mindestens einen Satz ein.</div>'}
    <div class="btnrow"><button class="btn accent" data-act="finish-yes" ${sets ? '' : 'disabled'}>Speichern</button><button class="btn ghost" data-act="finish-no">Weiter trainieren</button></div>
  </div>`;
}
function finishTraining() {
  const entries = collectEntries();
  if (!entries.some(en => en.sets.length)) return;
  const end = new Date().toISOString();
  const n = entries.reduce((a, en) => a + en.sets.length, 0);
  const summary = `Tag ${draft.day} ${draft.title} · ${n} Sätze · ` + entries.map(en => `${en.name}: ${fmtSets(en.type, en.sets)}${en.note ? ` (Notiz: ${en.note})` : ''}`).join(' | ');
  const e = addEvent('workout', { day: draft.day, title: draft.title, start: draft.start, end, entries }, summary);
  draft = null; saveDraft(); finishAsk = false;
  const imp = improvements(e);
  toast(imp.length ? `Training gespeichert · ${imp.length} ${imp.length === 1 ? 'Steigerung' : 'Steigerungen'}` : 'Training gespeichert');
  location.hash = '#start';
}

/* ---------- Verlauf ---------- */
function viewVerlauf() {
  const s = st(), me = cfg.me, other = partner();
  const seg = `<div class="seg" role="group" aria-label="Ansicht"><button data-act="vtab" data-v="aktiv" aria-pressed="${verlaufTab === 'aktiv'}">Aktivität</button><button data-act="vtab" data-v="uebungen" aria-pressed="${verlaufTab === 'uebungen'}">Übungen</button></div>`;
  if (verlaufTab === 'aktiv') {
    return seg + `<section class="card">${s.feed.length ? `<div class="feed">${s.feed.map(feedItem).join('')}</div>` : '<div class="empty">Noch keine Einträge. Starte dein erstes Training auf der Startseite.</div>'}</section>`;
  }
  const inPlan = new Set();
  const row = x => {
    inPlan.add(x.id);
    const a = lastSession(me, x.id), b = lastSession(other, x.id);
    return `<a class="exrow" href="#uebung:${encodeURIComponent(x.id)}"><div class="n"><b>${esc(x.name)}</b><span class="small muted">${TYPE_LABEL[x.type]}</span></div>
      <div class="vals"><span class="m">${a ? metricLabel(a.type, metric(a.type, a.sets)) : '–'}</span><span class="r">${b ? metricLabel(b.type, metric(b.type, b.sets)) : '–'}</span></div><span class="chev">›</span></a>`;
  };
  const days = DAYS.map(d => `<div class="sec-title"><h2>Tag ${d} · ${esc(s.plans[me][d].title)}</h2></div><section class="card">${s.plans[me][d].exercises.map(row).join('') || '<div class="empty">Keine Übungen</div>'}</section>`).join('');
  const archived = Object.keys(s.exInfo).filter(id => !inPlan.has(id) && (s.hist[me][id] || s.hist[other][id]));
  const legend = `<div class="legend small"><span class="who ${cls(me)}">Du</span><span class="who ${cls(other)}">${esc(other)}</span><span class="muted">letzte Einheit</span></div>`;
  return seg + legend + days + (archived.length ? `<div class="sec-title"><h2>Archiv</h2></div><div class="small muted" style="margin:0 2px">Ausgetauschte oder entfernte Übungen. Ihr Verlauf bleibt erhalten.</div><section class="card">${archived.map(id => row({ id, ...s.exInfo[id] })).join('')}</section>` : '');
}

function chartSvg(series, type) {
  const pts = series.flatMap(sr => sr.points);
  if (!pts.length) return '<div class="empty">Noch keine Daten für diese Übung.</div>';
  const W = 340, H = 170, L = 38, R = 14, T = 16, B = 26;
  const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t));
  let v0 = Math.min(...pts.map(p => p.v)), v1 = Math.max(...pts.map(p => p.v));
  if (v0 === v1) { v0 -= type === 'kg' ? 5 : 2; v1 += type === 'kg' ? 5 : 2; }
  // gut lesbare Achsenschritte (1, 2, 2,5, 5, 10, …)
  const raw = (v1 - v0) / 3, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const stepV = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) || 10 * mag;
  v0 = Math.max(0, Math.floor(v0 / stepV) * stepV); v1 = Math.ceil(v1 / stepV) * stepV;
  if (v1 === v0) v1 = v0 + stepV;
  const ticks = Math.round((v1 - v0) / stepV);
  const X = t => t1 === t0 ? (L + W - R) / 2 : L + (t - t0) / (t1 - t0) * (W - L - R);
  const Y = v => T + (1 - (v - v0) / (v1 - v0)) * (H - T - B);
  let g = '';
  for (let k = 0; k <= ticks; k++) {
    const v = v0 + stepV * k;
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${fmtN(v)}</text>`;
  }
  const dl = t => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  g += `<text x="${L}" y="${H - 6}">${dl(t0)}</text>${t1 !== t0 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end">${dl(t1)}</text>` : ''}`;
  series.forEach(sr => {
    if (!sr.points.length) return;
    const d = sr.points.map(p => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
    g += `<polyline fill="none" stroke="${sr.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${d}"/>`;
    sr.points.forEach((p, i) => { const last = i === sr.points.length - 1; g += `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${last ? 4.5 : 3}" fill="${last ? sr.color : 'var(--surface)'}" stroke="${sr.color}" stroke-width="2"/>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf ${metricName(type)}">${g}</svg>`;
}

function viewExercise(id) {
  const s = st(), me = cfg.me, other = partner();
  const info = s.exInfo[id];
  if (!info) return '<div class="empty">Diese Übung gibt es nicht.</div>';
  const def = DAYS.map(d => s.plans[me][d].exercises.find(x => x.id === id)).find(Boolean) || DAYS.map(d => s.plans[other][d].exercises.find(x => x.id === id)).find(Boolean);
  const type = (def && def.type) || info.type;
  const series = [me, other].map(p => ({ p, color: p === 'Rob' ? 'var(--rob)' : 'var(--accent)', points: (s.hist[p][id] || []).filter(h => h.type === type).map(h => ({ t: +new Date(h.ts), v: metric(h.type, h.sets) })).filter(x => x.v != null) }));
  const best = p => { const v = series.find(x => x.p === p).points.map(x => x.v); return v.length ? metricLabel(type, Math.max(...v)) : '–'; };
  const sessions = [...(s.hist[me][id] || []), ...(s.hist[other][id] || [])].sort((a, b) => b.ts.localeCompare(a.ts));
  return `<section class="card">
      <h1 class="display" style="font-size:34px">${esc((def && def.name) || info.name)}</h1>
      <div class="small muted">${TYPE_LABEL[type]}${def ? ` · ${def.sets}×${def.min}–${def.max}${type === 'time' ? ' s' : ''}` : ' · im Archiv'}</div>
      ${def && def.cue ? `<p style="margin:0">${esc(def.cue)}</p>` : ''}
      ${def && def.image ? `<img src="${esc(def.image)}" alt="${esc(def.name)}" loading="lazy" style="border-radius:10px">` : ''}
      <a class="vlink" href="${esc(videoUrl(def || { name: info.name }))}" target="_blank" rel="noopener">▶ ${def && def.video ? 'Video ansehen' : 'Videos auf YouTube suchen'}</a>
    </section>
    <div class="duo">
      <section class="card"><span class="who ${cls(me)}">Du</span><span class="big">${best(me)}</span><span class="small muted">Bestwert</span></section>
      <section class="card"><span class="who ${cls(other)}">${esc(other)}</span><span class="big">${best(other)}</span><span class="small muted">Bestwert</span></section>
    </div>
    <section class="card chart"><b>${metricName(type)}</b>
      <div class="legend"><span class="who ${cls(me)}">Du</span><span class="who ${cls(other)}">${esc(other)}</span></div>
      ${chartSvg(series, type)}</section>
    <div class="sec-title"><h2>Alle Einheiten</h2></div>
    <section class="card">${sessions.length ? sessions.map(h => `<div class="sess"><div class="top"><span class="who ${cls(h.person)}">${h.person === me ? 'Du' : esc(h.person)}</span><span>${fmtDate(h.ts)} · Tag ${h.day}</span></div>
      <div class="v">${fmtSets(h.type, h.sets)}</div>${h.note ? `<div class="quote ${cls(h.person)}">${esc(h.note)}</div>` : ''}</div>`).join('') : '<div class="empty">Noch nicht trainiert.</div>'}</section>`;
}

function viewWorkout(id) {
  const e = st().workouts.find(w => w.id === id);
  if (!e) return '<div class="empty">Training nicht gefunden.</div>';
  const d = e.data, imp = improvements(e);
  return `<section class="card"><span class="who ${cls(e.person)}">${esc(e.person)}</span>
      <h1 class="display" style="font-size:34px">Tag ${d.day} · ${esc(d.title)}</h1>
      <div class="small muted">${fmtDate(e.ts)}, ${fmtTime(d.start)}–${fmtTime(d.end)} · ${duration(d.start, d.end)}</div>
      ${imp.length ? `<div class="chips">${imp.map(i => `<span class="chip ${i.pr ? 'pr' : 'up'}">${esc(i.name)} ${deltaLabel(i)}${i.pr ? ' · Rekord' : ''}</span>`).join('')}</div>` : ''}</section>
    <section class="card">${d.entries.map(en => `<a class="sess" href="#uebung:${encodeURIComponent(en.exId)}" style="text-decoration:none;color:inherit"><div class="top"><b style="color:var(--fg)">${esc(en.name)}</b><span>${en.sets.length} ${en.sets.length === 1 ? 'Satz' : 'Sätze'}</span></div>
      <div class="v">${fmtSets(en.type, en.sets)}</div>${en.note ? `<div class="quote ${cls(e.person)}">${esc(en.note)}</div>` : ''}</a>`).join('')}</section>`;
}

/* ---------- Notizen ---------- */
function viewNotes() {
  const s = st();
  const items = [];
  s.workouts.forEach(w => (w.data.entries || []).forEach(en => { if (en.note) items.push({ w, en }); }));
  items.reverse();
  const shown = items.filter(x => notesFilter === 'Alle' || x.w.person === notesFilter);
  const seg = `<div class="seg" role="group" aria-label="Filter">${['Alle', ...PEOPLE].map(f => `<button data-act="nfilter" data-v="${f}" aria-pressed="${notesFilter === f}">${f === cfg.me ? 'Meine' : f}</button>`).join('')}</div>`;
  return seg + `<section class="card">${shown.length ? shown.map(({ w, en }) => `<a class="sess" href="#uebung:${encodeURIComponent(en.exId)}" style="text-decoration:none;color:inherit">
      <div class="top"><b style="color:var(--fg)">${esc(en.name)}</b><span>${fmtDate(w.ts)}</span></div>
      <div class="small"><span class="who ${cls(w.person)}">${esc(w.person)}</span> <span class="muted">· Tag ${w.data.day} · ${fmtSets(en.type, en.sets)}</span></div>
      <div class="quote ${cls(w.person)}">${esc(en.note)}</div></a>`).join('')
    : '<div class="empty">Noch keine kommentierten Übungen. Im Training kannst du zu jeder Übung eine Notiz schreiben.</div>'}</section>`;
}

/* ---------- Planänderungen (Glocke) ---------- */
function viewBell() {
  const list = partnerChanges(), other = partner(), s = st();
  const label = { open: 'Offen', accepted: 'Übernommen', rejected: 'Abgelehnt', superseded: 'Überholt' };
  const items = list.map(x => {
    const c = x.c, d = c.data;
    const actionable = !x.superseded && x.diff.length;
    const btns = actionable ? `<div class="btnrow"><button class="btn small accent" data-act="decide" data-id="${esc(c.id)}" data-v="accepted">${x.status === 'rejected' ? 'Doch übernehmen' : 'Übernehmen'}</button>
      ${x.status === 'open' ? `<button class="btn small ghost" data-act="decide" data-id="${esc(c.id)}" data-v="rejected">Ablehnen</button>` : ''}</div>` : '';
    return `<section class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="who ${cls(c.person)}">${esc(c.person)}</span><span class="pill ${x.status}">${label[x.status]}</span></div>
      <b>Tag ${d.day} · ${esc(d.title)}</b>
      <div class="small muted">${fmtDate(c.ts)}, ${fmtTime(c.ts)}</div>
      ${x.diff.length ? `<div class="small muted">Unterschied zu deinem Plan:</div>${diffList(x.diff)}` : '<div class="small muted">Dein Plan für diesen Tag entspricht bereits dieser Version.</div>'}
      ${x.superseded && x.diff.length ? `<div class="small muted">${esc(other)} hat Tag ${d.day} danach noch einmal geändert.</div>` : ''}
      ${btns}</section>`;
  });
  const mine = Object.values(s.changes).filter(c => c.person === cfg.me).reverse().slice(0, 10);
  const mineHtml = mine.map(c => { const dec = s.decisions[other + '|' + c.id];
    return `<div class="sess"><div class="top"><b style="color:var(--fg)">Tag ${c.data.day} · ${esc(c.data.title)}</b><span class="pill ${dec ? dec.decision : 'open'}">${dec ? label[dec.decision] : 'Noch offen'}</span></div><div class="small muted">${fmtDate(c.ts)} · ${esc((c.data.changes || []).map(diffText).join(', ') || 'Plan gespeichert')}</div></div>`; }).join('');
  return `<p class="muted small" style="margin:0 2px">Hier siehst du, wenn ${esc(other)} einen Trainingstag geändert hat. Du entscheidest, ob du die Änderung für deinen Plan übernimmst. Abgelehnte Änderungen kannst du später noch übernehmen.</p>
    ${items.join('') || `<section class="card"><div class="empty">${esc(other)} hat noch nichts am Plan geändert.</div></section>`}
    ${mine.length ? `<div class="sec-title"><h2>Deine Änderungen</h2></div><section class="card">${mineHtml}</section>` : ''}`;
}
function decide(changeId, decision) {
  const c = st().changes[changeId]; if (!c) return;
  addEvent('plan_decision', { changeId, decision }, `Änderung von ${c.person} an Tag ${c.data.day} ${decision === 'accepted' ? 'übernommen' : 'abgelehnt'}`);
  if (builder && !Object.values(builder.dirty).some(Boolean)) builder = null;
  toast(decision === 'accepted' ? `Tag ${c.data.day} übernommen` : 'Änderung abgelehnt');
  render();
}

/* ---------- Plan-Builder ---------- */
function ensureBuilder() {
  if (builder && Object.values(builder.dirty).some(Boolean)) return;
  const cur = builder ? builder.day : nextDay(cfg.me);
  builder = { day: cur, work: clone(st().plans[cfg.me]), dirty: {} };
}
function viewPlan() {
  ensureBuilder();
  const b = builder, d = b.day, w = b.work[d], other = partner();
  const seg = `<div class="seg" role="group" aria-label="Trainingstag">${DAYS.map(k => `<button data-act="bday" data-v="${k}" aria-pressed="${k === d}">Tag ${k}${b.dirty[k] ? '<i class="mark"></i>' : ''}</button>`).join('')}</div>`;
  const rows = w.exercises.map((x, i) => `<div class="prow">
      <div class="n"><b>${esc(x.name)}</b><span class="small muted">${TYPE_LABEL[x.type]} · ${x.sets}×${x.min}–${x.max}${x.type === 'time' ? ' s' : ''}${x.type === 'kg' && x.step ? ` · +${fmtN(x.step)} kg` : ''}</span></div>
      <div class="tools"><button class="tool" data-act="bmove" data-i="${i}" data-v="-1" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button><button class="tool" data-act="bmove" data-i="${i}" data-v="1" aria-label="Nach unten" ${i === w.exercises.length - 1 ? 'disabled' : ''}>${ICON.down}</button></div>
      <div class="acts"><button data-act="bedit" data-i="${i}">Bearbeiten</button><button data-act="breplace" data-i="${i}">Austauschen</button><button class="del" data-act="bremove" data-i="${i}">Entfernen</button></div>
    </div>`).join('');
  const changes = b.dirty[d] ? diffPlan(st().plans[cfg.me][d], w) : [];
  return `${seg}
    <section class="card form">
      <label>Name des Trainingstags<input class="inp" id="b-title" data-b="title" value="${esc(w.title)}" maxlength="40"></label>
    </section>
    <section class="card">${rows || '<div class="empty">Noch keine Übungen an diesem Tag.</div>'}
      <button class="btn ghost" data-act="badd">+ Übung hinzufügen</button></section>
    <p class="small muted" style="margin:0 2px">Austauschen legt eine neue Übung an. Der Verlauf der alten Übung bleibt im Archiv unter Verlauf → Übungen erhalten. Gespeicherte Änderungen bekommt ${esc(other)} als Hinweis und kann sie übernehmen.</p>
    ${changes.length ? `<section class="card"><b>Ungespeicherte Änderungen an Tag ${d}</b>${diffList(changes)}</section>` : ''}
    ${b.dirty[d] ? `<div style="height:56px"></div><div class="savebar"><span>Tag ${d} geändert</span><button class="btn ghost" data-act="bdiscard">Verwerfen</button><button class="btn" data-act="bsave">Speichern</button></div>` : ''}`;
}
function markDirty() { builder.dirty[builder.day] = diffPlan(st().plans[cfg.me][builder.day], builder.work[builder.day]).length > 0; }

function exerciseForm(mode, i) {
  const w = builder.work[builder.day];
  const old = mode === 'add' ? null : w.exercises[i];
  const x = mode === 'edit' ? old : { id: '', name: '', type: old ? old.type : 'kg', sets: old ? old.sets : 3, min: old ? old.min : 8, max: old ? old.max : 12, step: old ? old.step : 2.5, cue: '', video: '', image: '' };
  const title = mode === 'add' ? 'Neue Übung' : mode === 'edit' ? 'Übung bearbeiten' : 'Übung austauschen';
  $('#modal').innerHTML = `<div class="backdrop" data-act="mclose-bg"><form class="sheet form" id="exform" data-mode="${mode}" data-i="${i ?? ''}" novalidate>
    <h2>${title}</h2>
    ${mode === 'replace' ? `<p class="help" style="margin:0">Ersetzt <b>${esc(old.name)}</b>. Deren bisherige Einträge bleiben im Archiv erhalten.</p>` : ''}
    ${mode === 'edit' ? `<p class="help" style="margin:0">Änderungen hier gelten für dieselbe Übung, ihr Verlauf läuft weiter. Für eine andere Übung nutze „Austauschen“.</p>` : ''}
    <label>Name<input class="inp" id="f-name" name="name" value="${esc(x.name)}" maxlength="60" required></label>
    <label>Art<select id="f-type" name="type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}${k === 'bw' ? ' (nur Wdh.)' : k === 'time' ? ' (Sekunden)' : ' (kg + Wdh.)'}</option>`).join('')}</select></label>
    <div class="grid3"><label>Sätze<input class="inp" id="f-sets" name="sets" inputmode="numeric" value="${x.sets}"></label>
      <label><span id="f-unit-min">${x.type === 'time' ? 'Sek. von' : 'Wdh. von'}</span><input class="inp" id="f-min" name="min" inputmode="numeric" value="${x.min}"></label>
      <label>bis<input class="inp" id="f-max" name="max" inputmode="numeric" value="${x.max}"></label></div>
    <label id="f-step-l" ${x.type === 'kg' ? '' : 'hidden'}>Steigerung in kg<input class="inp" id="f-step" name="step" inputmode="decimal" value="${String(x.step || 0).replace('.', ',')}"><span class="help">Wird vorgeschlagen, wenn alle Sätze die obere Wdh.-Zahl erreichen.</span></label>
    <label>Ausführung<textarea id="f-cue" name="cue" rows="3" maxlength="500">${esc(x.cue)}</textarea></label>
    <label>Video-Link (optional)<input class="inp" id="f-video" name="video" type="url" inputmode="url" value="${esc(x.video)}" placeholder="https://www.youtube.com/watch?v=…"><span class="help">Leer lassen: Die App sucht passende Videos auf YouTube.</span></label>
    <label>Bild-Link (optional)<input class="inp" id="f-image" name="image" type="url" inputmode="url" value="${esc(x.image)}" placeholder="https://…/bild.jpg"></label>
    <div class="err" id="f-err" hidden></div>
    <div class="btnrow"><button class="btn primary" type="submit">${mode === 'replace' ? 'Austauschen' : 'Übernehmen'}</button><button class="btn ghost" type="button" data-act="mclose">Abbrechen</button></div>
  </form></div>`;
  setTimeout(() => { const n = $('#f-name'); if (n && mode !== 'edit') n.focus(); }, 50);
}
function submitExercise(form) {
  const f = new FormData(form), mode = form.dataset.mode, i = +form.dataset.i;
  const w = builder.work[builder.day];
  const name = String(f.get('name') || '').trim();
  const type = f.get('type');
  const sets = int(f.get('sets')), min = int(f.get('min')), max = int(f.get('max'));
  const err = m => { const e = $('#f-err'); e.textContent = m; e.hidden = false; };
  if (!name) return err('Bitte gib einen Namen ein.');
  if (!sets || sets > 10) return err('Sätze: bitte eine Zahl von 1 bis 10.');
  if (!min || !max || min > max) return err('Bitte gib eine gültige Spanne an, z. B. 8 bis 12.');
  const url = v => { v = String(v || '').trim(); return /^https?:\/\//i.test(v) ? v : ''; };
  const data = { name, type, sets, min, max, step: type === 'kg' ? num(f.get('step')) : 0, cue: String(f.get('cue') || '').trim(), video: url(f.get('video')), image: url(f.get('image')) };
  if (mode === 'edit') Object.assign(w.exercises[i], data);
  else if (mode === 'add') w.exercises.push({ id: 'u-' + uid().slice(0, 8), ...data });
  else { const old = w.exercises[i]; w.exercises.splice(i, 1, { id: 'u-' + uid().slice(0, 8), replaces: old.id, ...data }); }
  $('#modal').innerHTML = ''; markDirty(); render();
}
function savePlan() {
  const d = builder.day, w = builder.work[d];
  const changes = diffPlan(st().plans[cfg.me][d], w);
  if (!changes.length) { builder.dirty[d] = false; render(); return; }
  addEvent('plan_change', { day: d, title: w.title, exercises: clone(w.exercises), changes }, `Tag ${d} geändert: ${changes.map(diffText).join('; ')}`);
  builder.dirty[d] = false;
  toast(`Tag ${d} gespeichert. ${partner()} bekommt einen Hinweis.`);
  render();
}

/* ---------- Einstellungen & Einrichtung ---------- */
function viewSettings() {
  const waiting = pending.filter(p => !seenIds.has(p.id)).length;
  return `<section class="card form">
      <b>Sync mit Google-Tabelle</b>
      <label>Sync-Adresse<input class="inp" id="s-url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url" autocomplete="off"></label>
      <label>Sync-Schlüssel<input class="inp" id="s-key" value="${esc(cfg.key)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="err" id="s-err" hidden></div>
      <div class="btnrow"><button class="btn primary" data-act="s-save">Speichern & synchronisieren</button></div>
    </section>
    <section class="card"><b>Status</b>
      <dl class="kv"><dt>Ich bin</dt><dd>${esc(cfg.me)}</dd><dt>Letzter Sync</dt><dd>${lastSync ? fmtDate(lastSync) + ', ' + fmtTime(lastSync) : '–'}</dd>
      <dt>Einträge</dt><dd>${events.length} synchronisiert, ${waiting} wartend</dd><dt>Version</dt><dd>${APP_VERSION}</dd></dl>
    </section>
    <section class="card"><b>Person wechseln</b><span class="small muted">Nur nötig, wenn diese App auf dem falschen Handy eingerichtet wurde.</span>
      <div class="pick">${PEOPLE.map(p => `<button class="${cls(p)}" data-act="s-me" data-v="${p}" aria-pressed="${cfg.me === p}">${p}</button>`).join('')}</div></section>
    <section class="card"><b>Daten auf diesem Handy zurücksetzen</b>
      <span class="small muted">Löscht nur die Kopie auf diesem Handy. Beim nächsten Sync wird alles aus der Tabelle neu geladen.${waiting ? ` <b>${waiting} noch nicht gesendete Einträge gehen dabei verloren.</b>` : ''}</span>
      ${resetAsk ? `<div class="btnrow"><button class="btn small danger" data-act="reset-yes">Ja, zurücksetzen</button><button class="btn small ghost" data-act="reset-no">Abbrechen</button></div>` : `<button class="btn ghost danger" data-act="reset-ask">Zurücksetzen</button>`}
    </section>`;
}
let setupMe = null;
function viewSetup() {
  return `<div class="setup">
    <div><div class="eyebrow">Willkommen</div><h1 class="display">Hantelbuch</h1></div>
    <p style="margin:0">Dein Trainingsplan für Brust & Trizeps, Rücken & Bizeps und Beine & Bauch. Fortschritte von Manu und Rob werden über eine gemeinsame Google-Tabelle abgeglichen.</p>
    <div class="form"><label>Wer bist du?</label><div class="pick">${PEOPLE.map(p => `<button class="${cls(p)}" data-act="setup-me" data-v="${p}" aria-pressed="${setupMe === p}">${p}</button>`).join('')}</div></div>
    <div class="form">
      <label>Sync-Adresse<input class="inp" id="u-url" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url" autocomplete="off"></label>
      <label>Sync-Schlüssel<input class="inp" id="u-key" autocomplete="off" autocapitalize="off" spellcheck="false"><span class="help">Beides findest du in der Google-Tabelle auf dem Blatt „Info“.</span></label>
      <div class="err" id="u-err" hidden></div>
      <button class="btn primary" data-act="setup-go">Verbinden</button>
      <button class="btn ghost" data-act="setup-local">Erst ohne Sync ausprobieren</button>
    </div></div>`;
}
async function testAndSave(url, key, errEl) {
  url = url.trim(); key = key.trim();
  const show = m => { errEl.textContent = m; errEl.hidden = false; };
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) { show('Die Sync-Adresse muss mit https://script.google.com/ beginnen.'); return false; }
  if (!key) { show('Bitte gib den Sync-Schlüssel ein.'); return false; }
  const prev = { ...cfg }; cfg.url = url; cfg.key = key;
  try { await call({ action: 'ping' }); }
  catch (e) { cfg.url = prev.url; cfg.key = prev.key; show(e.code === 'unauthorized' ? 'Der Sync-Schlüssel stimmt nicht.' : 'Keine Verbindung zur Tabelle. Prüfe die Adresse und deine Internetverbindung.'); return false; }
  LS.set('cfg', cfg); return true;
}

/* ---------- Ereignisse ---------- */
const actions = {
  start: () => startTraining(),
  'skip-ask': () => { skipAsk = true; render(); },
  'skip-no': () => { skipAsk = false; render(); },
  'skip-yes': () => { const d = nextDay(cfg.me); addEvent('skip', { day: d }, `Tag ${d} übersprungen`); skipAsk = false; toast(`Tag ${d} übersprungen`); render(); },
  sync: () => sync({ overlay: true }),
  check: t => {
    const i = +t.dataset.i, j = +t.dataset.j, x = draft.items[i].ex, s = draft.items[i].sets[j];
    const rIn = document.getElementById(`r-${i}-${j}`), wIn = document.getElementById(`w-${i}-${j}`);
    if (wIn) s.w = wIn.value; if (rIn) s.r = rIn.value;
    if (!s.done && x.type === 'kg' && !num(s.w)) { toast('Trag zuerst das Gewicht ein.'); if (wIn) wIn.focus(); return; }
    if (!s.done && !int(s.r)) { const mine = lastSession(cfg.me, x.id); s.r = String(mine && mine.type === x.type && mine.sets[j] ? mine.sets[j].r : x.max); }
    s.done = !s.done; saveDraft(); rerenderCard(i);
  },
  addset: t => { const it = draft.items[+t.dataset.i]; const last = it.sets[it.sets.length - 1]; it.sets.push({ w: last ? last.w : '', r: '', done: false }); saveDraft(); rerenderCard(+t.dataset.i); },
  'finish-ask': () => { finishAsk = true; discardAsk = false; render(); setTimeout(() => { const f = $('.finishbar'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30); },
  'finish-no': () => { finishAsk = false; render(); },
  'finish-yes': () => finishTraining(),
  'discard-ask': () => { discardAsk = true; finishAsk = false; render(); },
  'discard-no': () => { discardAsk = false; render(); },
  'discard-yes': () => { draft = null; saveDraft(); discardAsk = false; toast('Training verworfen'); location.hash = '#start'; },
  vtab: t => { verlaufTab = t.dataset.v; render(); },
  nfilter: t => { notesFilter = t.dataset.v; render(); },
  decide: t => decide(t.dataset.id, t.dataset.v),
  bday: t => { builder.day = t.dataset.v; render(); },
  bmove: t => { const a = builder.work[builder.day].exercises, i = +t.dataset.i, j = i + +t.dataset.v; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; markDirty(); render(); },
  bedit: t => exerciseForm('edit', +t.dataset.i),
  breplace: t => exerciseForm('replace', +t.dataset.i),
  badd: () => exerciseForm('add'),
  bremove: t => { const a = builder.work[builder.day].exercises; const x = a.splice(+t.dataset.i, 1)[0]; markDirty(); render(); toast(`${x.name} entfernt. Speichern nicht vergessen.`); },
  bdiscard: () => { builder.work[builder.day] = clone(st().plans[cfg.me][builder.day]); builder.dirty[builder.day] = false; render(); },
  bsave: () => savePlan(),
  mclose: () => { $('#modal').innerHTML = ''; },
  'mclose-bg': (t, e) => { if (e.target === t) $('#modal').innerHTML = ''; },
  's-save': async () => { const ok = await testAndSave($('#s-url').value, $('#s-key').value, $('#s-err')); if (ok) { toast('Verbunden'); sync({ overlay: true }); } },
  's-me': t => { cfg.me = t.dataset.v; LS.set('cfg', cfg); builder = null; draft = null; saveDraft(); invalidate(); toast(`Du bist jetzt ${cfg.me}`); render(); },
  'reset-ask': () => { resetAsk = true; render(); },
  'reset-no': () => { resetAsk = false; render(); },
  'reset-yes': () => { events = []; pending = []; lastSeq = 0; lastSync = null; seenIds = new Set(); saveLog(); LS.set('lastSync', null); resetAsk = false; invalidate(); builder = null; sync({ overlay: true }); render(); },
  'setup-me': t => { setupMe = t.dataset.v; render(); },
  'setup-go': async () => {
    const err = $('#u-err');
    if (!setupMe) { err.textContent = 'Bitte wähle zuerst aus, wer du bist.'; err.hidden = false; return; }
    const ok = await testAndSave($('#u-url').value, $('#u-key').value, err);
    if (!ok) return;
    cfg.me = setupMe; LS.set('cfg', cfg); location.hash = '#start'; render(); sync({ overlay: true });
  },
  'setup-local': () => {
    const err = $('#u-err');
    if (!setupMe) { err.textContent = 'Bitte wähle zuerst aus, wer du bist.'; err.hidden = false; return; }
    cfg = { me: setupMe, url: '', key: '' }; LS.set('cfg', cfg); location.hash = '#start'; render();
  }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t || !actions[t.dataset.act]) return;
  if (t.tagName === 'BUTTON' && t.type !== 'submit') e.preventDefault();
  actions[t.dataset.act](t, e);
});
document.addEventListener('submit', e => { if (e.target.id === 'exform') { e.preventDefault(); submitExercise(e.target); } });
let draftTimer;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f && draft) {
    const s = draft.items[+t.dataset.i].sets[+t.dataset.j];
    s[t.dataset.f] = t.value;
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300);
  } else if (t.dataset.note != null && draft) {
    draft.items[+t.dataset.note].note = t.value;
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300);
  } else if (t.dataset.b === 'title' && builder) {
    builder.work[builder.day].title = t.value.trimStart();
    const was = builder.dirty[builder.day]; markDirty();
    if (was !== builder.dirty[builder.day]) { const pos = t.selectionStart; render(); const n = $('#b-title'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  } else if (t.id === 'f-type') {
    $('#f-step-l').hidden = t.value !== 'kg';
    $('#f-unit-min').textContent = t.value === 'time' ? 'Sek. von' : 'Wdh. von';
  }
});
document.addEventListener('change', e => { if (e.target.id === 'f-type') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
window.addEventListener('hashchange', () => { $('#modal').innerHTML = ''; render(); });

/* ---------- Start der App ---------- */
let hiddenAt = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); if (draft) saveDraft(); return; }
  const away = Date.now() - hiddenAt;
  if (cfg.me && cfg.url && away > 60000) sync({ overlay: away > 5 * 60000 });
});
window.addEventListener('online', () => { if (cfg.me && cfg.url) sync({ quiet: true }); });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; if (draft) saveDraft(); location.reload(); } });
}

render();
if (cfg.me && cfg.url) sync({ overlay: true });
