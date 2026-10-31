'use strict';
/* Hantelbuch – Trainings-App für Manu & Rob.
   Alles, was passiert (Training, Skip, Planänderung, Tausch, Körpergewicht), wird als Eintrag in einem Log gespeichert:
   zuerst auf dem Handy, beim Sync in der Google-Tabelle. Der aktuelle Stand wird immer aus dem Log berechnet. */

const APP_VERSION = '1.1.0';
const SCRIPT_MIN = 2;            // benötigte Version des Google-Skripts
const PEOPLE = ['Manu', 'Rob'];
const DAYS = ['A', 'B', 'C'];
const TYPE_LABEL = { kg: 'Gewicht', bw: 'Körpergewicht', time: 'Zeit' };
const WARMUP_DEFAULT = new Set(['bankdruecken', 'lh-rudern', 'kniebeugen', 'rdl']);
const FEEL = { leicht: 'Leicht', passt: 'Passt', schwer: 'Schwer' };
const DELOAD_WEEKS = 8;          // Deload nach so vielen Trainingswochen …
const DELOAD_WEEKS_PLATEAU = 4;  // … oder früher, wenn mindestens 2 Übungen stagnieren

function ex(id, name, type, sets, min, max, step, cue) {
  return { id, name, type, sets, min, max, step, cue, video: '', image: '', warmup: WARMUP_DEFAULT.has(id), personal: false };
}
const DEFAULT_PLAN = {
  A: { title: 'Brust & Trizeps', exercises: [
    ex('bankdruecken', 'Bankdrücken (Langhantel)', 'kg', 4, 6, 8, 2.5, 'Schulterblätter zusammen, Füße fest am Boden, Stange zur unteren Brust führen, Ellbogen ca. 45° vom Körper.'),
    ex('schraegbank', 'Schrägbankdrücken (Kurzhantel, 30°)', 'kg', 3, 8, 12, 2, 'Hanteln tief absenken, oben nicht zusammenschlagen.'),
    ex('dips', 'Dips (Brust-Fokus)', 'bw', 3, 8, 12, 2.5, 'Oberkörper leicht nach vorn, absenken bis der Oberarm parallel zum Boden ist.'),
    ex('kabelflys', 'Kabelzug-Flys', 'kg', 3, 12, 15, 1.25, 'Leicht gebeugte Arme, Hände vor der Brust zusammenführen, 1 Sek. halten.'),
    ex('ueberkopf-trizeps', 'Überkopf-Trizepsstrecken am Kabel', 'kg', 3, 10, 12, 1.25, 'Ellbogen eng und fix, volle Dehnung hinter dem Kopf.'),
    ex('trizeps-seil', 'Trizepsdrücken am Kabel (Seil)', 'kg', 3, 12, 15, 1.25, 'Oberarme am Körper, unten das Seil auseinanderziehen.')
  ] },
  B: { title: 'Rücken & Bizeps', exercises: [
    ex('klimmzuege', 'Klimmzüge', 'bw', 4, 6, 10, 2.5, 'Schulterblätter zuerst nach unten ziehen, Brust zur Stange, unten ganz ausstrecken. Mit Unterstützung: Gewicht negativ eintragen.'),
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
const fmtIn = n => (n == null || n === '' ? '' : String(Math.round(Math.abs(n) * 100) / 100).replace('.', ','));
const fmtSigned = w => (w > 0 ? '+' : w < 0 ? '−' : '') + fmtN(Math.abs(w)) + ' kg';
const fmtDate = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtTime = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gen = p => (/s$/.test(p) ? p + "'" : p + 's');
const cls = p => (p === 'Rob' ? 'rob' : 'manu');
const partner = () => PEOPLE.find(p => p !== cfg.me);
const sum = a => a.reduce((x, y) => x + y, 0);
const avg = a => (a.length ? sum(a) / a.length : 0);
const roundTo = (v, step) => { const s = step > 0 ? step : 2.5; return Math.round(Math.round(v / s) * s * 100) / 100; };
const stepOf = x => (x.step > 0 ? x.step : 2.5);
const videoUrl = x => x.video || 'https://www.youtube.com/results?search_query=' + encodeURIComponent(x.name + ' richtige Ausführung');
const pad2 = n => String(n).padStart(2, '0');
const dateKey = v => { const d = new Date(v); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const todayStr = () => dateKey(new Date());
const weekKey = v => { const d = new Date(v); return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7)); };
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'uebung';
function relDay(iso) {
  const d = new Date(iso), t = new Date();
  const n = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return n <= 0 ? 'heute' : n === 1 ? 'gestern' : n < 7 ? `vor ${n} Tagen` : fmtDate(iso);
}
function duration(a, b) { const m = Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }
function weekStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7); }

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
  left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  swap: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8"/></svg>',
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
let scriptVersion = LS.get('scriptVersion', null);
let draft = LS.get('draft', null);   // laufendes Training (wird unten beim Start bereinigt)
let seenIds = new Set(events.map(e => e.id));

function saveLog() { LS.set('events', events); LS.set('pending', pending); LS.set('lastSeq', lastSeq); }
function saveDraft() { LS.set('draft', draft); }

function addEvent(type, data, summary) {
  const e = { id: uid(), ts: new Date().toISOString(), person: cfg.me, type, data, summary };
  pending.push(e); saveLog(); invalidate();
  sync({ quiet: true });
  return e;
}

/* ---------- Daten aus der Tabelle immer bereinigen ---------- */
const safeUrl = v => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim() : '');
const str = (v, n = 500) => String(v ?? '').slice(0, n);
function cleanEx(x) {
  x = x || {};
  const type = TYPE_LABEL[x.type] ? x.type : 'kg';
  const min = int(x.min) || 1;
  const id = str(x.id, 64) || 'x-' + uid().slice(0, 8);
  const o = {
    id, name: str(x.name, 80) || 'Übung', type, sets: Math.min(10, int(x.sets) || 3), min, max: Math.max(min, int(x.max) || min),
    step: type === 'time' ? 0 : Math.max(0, num(x.step)), cue: str(x.cue), video: safeUrl(x.video), image: safeUrl(x.image),
    warmup: type === 'kg' && (x.warmup === undefined ? WARMUP_DEFAULT.has(id) : !!x.warmup), personal: !!x.personal
  };
  if (x.replaces) o.replaces = str(x.replaces, 64);
  return o;
}
function cleanPlan(p, day) { return { title: str(p && p.title, 40) || DEFAULT_PLAN[day].title, exercises: (Array.isArray(p && p.exercises) ? p.exercises : []).slice(0, 25).map(cleanEx) }; }
function cleanEntry(en) {
  en = en || {};
  const type = TYPE_LABEL[en.type] ? en.type : 'kg';
  return {
    exId: str(en.exId, 64), name: str(en.name, 80), type, note: str(en.note, 1000), feel: FEEL[en.feel] ? en.feel : '',
    sets: (Array.isArray(en.sets) ? en.sets : []).slice(0, 20).map(s => type === 'time' ? { r: int(s && s.r) } : { w: num(s && s.w), r: int(s && s.r) })
  };
}

/* ---------- Zustand aus dem Log berechnen ---------- */
let _st = null;
function invalidate() { _st = null; }
function st() { return _st || (_st = buildState()); }

function buildState() {
  const all = events.slice().sort((a, b) => a.seq - b.seq)
    .concat(pending.filter(p => !seenIds.has(p.id)).sort((a, b) => a.ts.localeCompare(b.ts)));
  const s = { plans: {}, last: {}, workouts: [], skips: [], swaps: [], feed: [], changes: {}, lastChange: {}, lastShared: {}, decisions: {}, lastAction: {}, hist: {}, exInfo: {}, bw: {} };
  PEOPLE.forEach(p => { s.plans[p] = clone(DEFAULT_PLAN); s.hist[p] = {}; s.last[p] = null; s.bw[p] = []; });
  DAYS.forEach(d => DEFAULT_PLAN[d].exercises.forEach(x => { s.exInfo[x.id] = { name: x.name, type: x.type }; }));
  all.forEach((e, k) => {
    if (!PEOPLE.includes(e.person) || !e.id || !e.ts) return;
    const d = e.data || {}; e.k = k;
    if (e.type === 'workout') {
      if (!DAYS.includes(d.day)) return;
      d.title = str(d.title, 40); d.entries = (Array.isArray(d.entries) ? d.entries : []).map(cleanEntry);
      d.deload = !!d.deload; d.deloadSkipped = !!d.deloadSkipped;
      if (isNaN(new Date(d.start))) d.start = e.ts;
      if (isNaN(new Date(d.end))) d.end = e.ts;
      s.workouts.push(e); s.last[e.person] = { day: d.day, ts: e.ts, kind: 'workout' };
      d.entries.forEach(en => {
        (s.hist[e.person][en.exId] = s.hist[e.person][en.exId] || []).push({ ts: e.ts, wid: e.id, sets: en.sets, note: en.note, feel: en.feel, type: en.type, name: en.name, day: d.day, person: e.person, deload: d.deload });
        s.exInfo[en.exId] = { name: en.name, type: en.type };
      });
      s.feed.push(e);
    } else if (e.type === 'skip') {
      if (!DAYS.includes(d.day)) return;
      s.last[e.person] = { day: d.day, ts: e.ts, kind: 'skip' }; s.skips.push(e); s.feed.push(e);
    } else if (e.type === 'plan_change') {
      if (!DAYS.includes(d.day)) return;
      const p = cleanPlan(d, d.day); d.title = p.title; d.exercises = p.exercises;
      // Nur Änderungen an gemeinsamen Übungen lösen beim anderen eine Meldung aus
      if (sharedDiff(s.plans[e.person][d.day], p).length) s.lastShared[e.person + '|' + d.day] = e;
      s.plans[e.person][d.day] = clone(p);
      p.exercises.forEach(x => { s.exInfo[x.id] = s.exInfo[x.id] || { name: x.name, type: x.type }; s.exInfo[x.id].name = x.name; });
      s.changes[e.id] = e; s.lastChange[e.person + '|' + d.day] = e; s.lastAction[e.person + '|' + d.day] = k;
    } else if (e.type === 'plan_decision') {
      const ch = s.changes[d.changeId];
      const decision = d.decision === 'accepted' ? 'accepted' : 'dismissed';
      s.decisions[e.person + '|' + d.changeId] = { decision, k };
      if (ch && decision === 'accepted') {
        s.plans[e.person][ch.data.day] = d.result && Array.isArray(d.result.exercises) ? cleanPlan(d.result, ch.data.day) : cleanPlan(ch.data, ch.data.day);
        s.lastAction[e.person + '|' + ch.data.day] = k;
      }
    } else if (e.type === 'swap') {
      if (!DAYS.includes(d.day) || !d.to) return;
      d.to = cleanEx(d.to); d.fromId = str(d.fromId, 64); d.fromName = str(d.fromName, 80); d.date = str(d.date, 10);
      s.exInfo[d.to.id] = s.exInfo[d.to.id] || { name: d.to.name, type: d.to.type };
      s.swaps.push(e); s.feed.push(e);
    } else if (e.type === 'bodyweight') {
      const kg = num(d.kg); if (kg >= 30 && kg <= 300) s.bw[e.person].push({ ts: e.ts, kg });
    }
  });
  s.feed.reverse();
  return s;
}

function nextDay(p) { const l = st().last[p]; return l ? DAYS[(DAYS.indexOf(l.day) + 1) % 3] : 'A'; }
function isPending(id) { return !seenIds.has(id) && pending.some(p => p.id === id); }

/* ---------- Kennzahlen ---------- */
// Arbeitsgewicht = schwerster Satz mit Wiederholungen (bei Körpergewicht: Zusatzgewicht, negativ = Unterstützung)
function workW(sets) { const v = sets.filter(s => int(s.r) > 0).map(s => num(s.w)); return v.length ? Math.max(...v) : 0; }
function score(type, sets) {
  if (type === 'time') return Math.max(0, ...sets.map(s => int(s.r)));
  const w = workW(sets);
  return w * 1000 + sum(sets.filter(s => num(s.w) === w).map(s => int(s.r)));
}
const usesWeight = (type, sets) => type === 'kg' || (type === 'bw' && sets.some(s => num(s.w) !== 0));
function metricLabel(type, sets) {
  if (!sets || !sets.length) return '–';
  if (type === 'kg') return fmtN(workW(sets)) + ' kg';
  if (type === 'time') return Math.max(...sets.map(s => int(s.r))) + ' s';
  const reps = sum(sets.map(s => int(s.r))); const w = workW(sets);
  return reps + ' Wdh.' + (w ? ' · ' + fmtSigned(w) : '');
}
function fmtSets(type, sets) {
  if (!sets || !sets.length) return '–';
  if (type === 'kg') return sets.map(s => `${fmtN(num(s.w))}×${int(s.r)}`).join(' · ');
  if (type === 'time') return sets.map(s => int(s.r)).join(' · ') + ' s';
  if (sets.some(s => num(s.w) !== 0)) return sets.map(s => `${int(s.r)}${num(s.w) ? ` (${fmtSigned(num(s.w))})` : ''}`).join(' · ');
  return sets.map(s => int(s.r)).join(' · ') + ' Wdh.';
}
const normalSessions = (p, id, type) => (st().hist[p][id] || []).filter(h => !h.deload && (!type || h.type === type));
const lastAny = (p, id) => { const h = st().hist[p][id]; return h && h.length ? h[h.length - 1] : null; };

function improvements(e) {
  if (e.data.deload) return [];
  const out = [];
  (e.data.entries || []).forEach(en => {
    const h = normalSessions(e.person, en.exId, en.type);
    const i = h.findIndex(x => x.wid === e.id);
    if (i <= 0 || !en.sets.length) return;
    const prev = h.slice(0, i), last = prev[prev.length - 1];
    const cur = score(en.type, en.sets), best = Math.max(...prev.map(x => score(x.type, x.sets)));
    if (cur <= score(last.type, last.sets)) return;
    let label;
    if (en.type === 'time') label = `+${Math.max(...en.sets.map(s => s.r)) - Math.max(...last.sets.map(s => s.r))} s`;
    else {
      const dW = Math.round((workW(en.sets) - workW(last.sets)) * 100) / 100;
      if (dW > 0) label = `+${fmtN(dW)} kg`;
      else { const dr = sum(en.sets.map(s => s.r)) - sum(last.sets.map(s => s.r)); label = dr > 0 ? `+${dr} Wdh.` : 'mehr geschafft'; }
    }
    out.push({ name: en.name, exId: en.exId, label, pr: cur > best });
  });
  return out;
}

/* ---------- Steigerung (doppelte Progression, erweitert) ---------- */
function isPlateau(h) {
  if (h.length < 4) return false;
  const before = Math.max(...h.slice(0, -3).map(x => score(x.type, x.sets)));
  return h.slice(-3).every(x => score(x.type, x.sets) <= before);
}
function progression(x, p = cfg.me) {
  const h = normalSessions(p, x.id, x.type);
  if (!h.length) return { w: null, base: null, kind: 'new', hint: '' };
  const last = h[h.length - 1], sets = last.sets;
  if (x.type === 'time') {
    const best = Math.max(...sets.map(s => int(s.r)));
    return { w: null, base: null, kind: 'hold', hint: best >= x.max ? `Letztes Mal ${best} s. Zeit für eine schwerere Variante oder eine längere Spanne.` : `Ziel: länger als ${best} s` };
  }
  const W = workW(sets), step = x.step > 0 ? x.step : 0;
  const reps = sets.map(s => int(s.r));
  const full = sets.length >= x.sets;
  const allTop = full && reps.every(r => r >= x.max);
  const allTop2 = full && reps.every(r => r >= x.max + 2);
  const below = avg(reps) < x.min;
  const prevBelow = h.length > 1 && avg(h[h.length - 2].sets.map(s => int(s.r))) < x.min;
  const res = (w, kind, hint) => ({ w, base: W, kind, hint });
  if (below && prevBelow) {
    if (x.type === 'kg' && W > 0) return res(roundTo(W * 0.9, stepOf(x)), 'down', 'Zweimal unter der Spanne. Heute −10 % und neu aufbauen.');
    if (x.type === 'bw' && step) return res(roundTo(W - step, step), 'down', W > 0 ? `Zweimal unter der Spanne. Heute ${fmtN(step)} kg weniger Zusatzgewicht.` : `Zweimal unter der Spanne. Heute ${fmtN(step)} kg mehr Unterstützung.`);
    return res(W, 'hold', 'Zweimal unter der Spanne. Eine leichtere Variante oder eine niedrigere Spanne im Plan kann helfen.');
  }
  if (below) return res(W, 'hold', 'Letztes Mal unter der Spanne. Gewicht halten.');
  if (last.feel === 'schwer') return res(W, 'hold', allTop ? 'Geschafft, aber als schwer bewertet. Gewicht halten.' : '');
  if (step && (allTop2 || (allTop && last.feel === 'leicht'))) return res(roundTo(W + 2 * step, step), 'up', `${allTop2 ? 'Deutlich mehr geschafft' : 'Alle Sätze geschafft und als leicht bewertet'}. Heute +${fmtN(2 * step)} kg.`);
  if (step && allTop) return res(roundTo(W + step, step), 'up', `Alle Sätze mit ${x.max} Wdh. geschafft. Heute +${fmtN(step)} kg.`);
  if (allTop) return res(W, 'hold', 'Alle Sätze am oberen Ende. Zeit für Zusatzgewicht oder eine höhere Spanne im Plan.');
  if (isPlateau(h)) return res(W, 'plateau', 'Seit 3 Einheiten kein Fortschritt.');
  if (x.type === 'bw' && !W) return res(W, 'hold', `Ziel: mehr als ${sum(reps)} Wdh. insgesamt`);
  return res(W, 'hold', '');
}
function plateauCount(p) {
  return DAYS.reduce((a, d) => a + st().plans[p][d].exercises.filter(x => x.type !== 'time' && isPlateau(normalSessions(p, x.id, x.type))).length, 0);
}

/* ---------- Deload (für jede Person getrennt) ---------- */
function deloadState(p) {
  const ws = st().workouts.filter(w => w.person === p);
  let marked = 0, cycleEnd = -1;
  ws.forEach((w, i) => { if (w.data.deload || w.data.deloadSkipped) { marked++; if (marked >= 3) { marked = 0; cycleEnd = i; } } });
  if (marked > 0) return { active: true, part: marked + 1, reason: 'Deload-Woche läuft' };
  const weeks = new Set(ws.slice(cycleEnd + 1).map(w => weekKey(w.ts))).size;
  const plat = plateauCount(p);
  if (weeks >= DELOAD_WEEKS) return { active: true, part: 1, reason: `${weeks} Trainingswochen seit dem letzten Deload` };
  if (weeks >= DELOAD_WEEKS_PLATEAU && plat >= 2) return { active: true, part: 1, reason: `Kein Fortschritt bei ${plat} Übungen` };
  return { active: false, weeks };
}
const deloadW = W => (W > 0 ? W * 0.9 : W < 0 ? W * 1.1 : 0);

/* ---------- Plan-Abgleich ---------- */
const SHARED_FIELDS = ['name', 'type', 'sets', 'min', 'max', 'warmup'];
function fieldChanges(a, b, sharedOnly) {
  const c = [];
  if (a.name !== b.name) c.push('Name');
  if (a.type !== b.type) c.push(`Art ${TYPE_LABEL[a.type]} → ${TYPE_LABEL[b.type]}`);
  if (a.sets !== b.sets) c.push(`Sätze ${a.sets} → ${b.sets}`);
  if (a.min !== b.min || a.max !== b.max) c.push(`${b.type === 'time' ? 'Sek.' : 'Wdh.'} ${a.min}–${a.max} → ${b.min}–${b.max}`);
  if (!!a.warmup !== !!b.warmup) c.push(b.warmup ? 'Aufwärmsätze an' : 'Aufwärmsätze aus');
  if (sharedOnly) return c;
  if (b.type !== 'time' && (a.step || 0) !== (b.step || 0)) c.push(`Steigerung ${fmtN(a.step || 0)} → ${fmtN(b.step || 0)} kg`);
  if ((a.cue || '') !== (b.cue || '')) c.push('Ausführung');
  if ((a.video || '') !== (b.video || '')) c.push('Video');
  if ((a.image || '') !== (b.image || '')) c.push('Bild');
  if (!!a.personal !== !!b.personal) c.push(b.personal ? 'jetzt abweichend (nur ich)' : 'jetzt gemeinsam');
  return c;
}
function diffPlan(from, to, sharedOnly) {
  const out = [];
  if ((from.title || '') !== (to.title || '')) out.push({ k: 'title', a: from.title, b: to.title });
  const fm = new Map(from.exercises.map(x => [x.id, x])), tm = new Map(to.exercises.map(x => [x.id, x]));
  to.exercises.forEach(x => {
    if (!fm.has(x.id)) {
      if (x.replaces && fm.has(x.replaces) && !tm.has(x.replaces)) out.push({ k: 'replace', a: fm.get(x.replaces).name, b: x.name });
      else out.push({ k: 'add', b: x.name });
    } else {
      const ch = fieldChanges(fm.get(x.id), x, sharedOnly);
      if (ch.length) out.push({ k: 'edit', b: x.name, ch });
    }
  });
  from.exercises.forEach(x => { if (!tm.has(x.id) && !to.exercises.some(y => y.replaces === x.id && !fm.has(y.id))) out.push({ k: 'remove', a: x.name }); });
  const common = to.exercises.filter(x => fm.has(x.id)).map(x => x.id).join();
  const commonFrom = from.exercises.filter(x => tm.has(x.id)).map(x => x.id).join();
  if (common !== commonFrom) out.push({ k: 'order' });
  return out;
}
// Unterschied nur bei gemeinsamen Übungen: abweichende Übungen (bei mir oder beim anderen) zählen nie
function sharedDiff(mine, theirs) {
  const ignore = new Set([...mine.exercises, ...theirs.exercises].filter(x => x.personal).map(x => x.id));
  const f = p => ({ title: p.title, exercises: p.exercises.filter(x => !ignore.has(x.id)) });
  return diffPlan(f(mine), f(theirs), true);
}
// Plan des anderen übernehmen: gemeinsame Übungen + Reihenfolge von ihm, persönliche Werte und abweichende Übungen von mir
function mergePlan(mine, theirs) {
  const tShared = theirs.exercises.filter(x => !x.personal);
  const tSharedIds = new Set(tShared.map(x => x.id));
  const tPersonal = new Set(theirs.exercises.filter(x => x.personal).map(x => x.id));
  const own = new Map(mine.exercises.map(x => [x.id, x]));
  const result = tShared.map(x => {
    const m = own.get(x.id);
    if (!m) { const n = clone(x); delete n.replaces; return n; }
    const n = clone(m); SHARED_FIELDS.forEach(f => { n[f] = x[f]; }); n.personal = false; delete n.replaces;
    if (n.type === 'time') n.step = 0;
    return n;
  });
  mine.exercises.forEach((x, i) => {
    if (tSharedIds.has(x.id) || !(x.personal || tPersonal.has(x.id))) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) { const idx = result.findIndex(y => y.id === mine.exercises[j].id); if (idx >= 0) { pos = idx + 1; break; } }
    result.splice(pos, 0, clone(x));
  });
  return { title: theirs.title, exercises: result };
}
const DIFF_SIGN = { add: '+', remove: '−', replace: '⇄', edit: '~', order: '↕', title: '~' };
function diffText(d) {
  switch (d.k) {
    case 'add': return `Neu: ${d.b}`;
    case 'remove': return `Entfernt: ${d.a}`;
    case 'replace': return `${d.a} ersetzt durch ${d.b}`;
    case 'edit': return `${d.b}: ${(d.ch || []).join(', ')}`;
    case 'order': return 'Reihenfolge geändert';
    case 'title': return `Name des Tages: ${d.a} → ${d.b}`;
  }
  return '';
}
const diffList = list => `<ul class="diff">${list.map(d => `<li class="${esc(d.k)}"><span class="s">${DIFF_SIGN[d.k] || '~'}</span><span>${esc(diffText(d))}</span></li>`).join('')}</ul>`;

function bellItems() {
  const s = st(), me = cfg.me, other = partner(), out = [];
  DAYS.forEach(d => {
    const pc = s.lastShared[other + '|' + d];
    if (!pc) return;
    const diff = sharedDiff(s.plans[me][d], s.plans[other][d]);
    if (!diff.length) return;
    const dec = s.decisions[me + '|' + pc.id];
    const myK = s.lastAction[me + '|' + d] ?? -1;
    const status = !dec && pc.k > myK ? 'open' : dec && dec.decision === 'dismissed' ? 'dismissed' : 'diverged';
    out.push({ day: d, pc, diff, status });
  });
  return out;
}
const openCount = () => (cfg.me ? bellItems().filter(x => x.status === 'open').length : 0);

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

let syncing = null, syncError = null, rejectedCount = 0;
async function call(body) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key: cfg.key }), signal: ctrl.signal, redirect: 'follow' });
    let json; try { json = await res.json(); } catch (e) { throw { code: 'bad_response' }; }
    if (!json.ok) throw { code: json.error || 'server' };
    const v = Number(json.version) || 1;
    if (v !== scriptVersion) { scriptVersion = v; LS.set('scriptVersion', v); }
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
    await Promise.resolve(); // erst nach der Zuweisung oben weiterlaufen
    ui.show();
    try {
      if (navigator.onLine === false) throw { code: 'offline' };
      const toPush = pending.filter(p => !seenIds.has(p.id));
      const batches = []; for (let i = 0; i < toPush.length; i += 25) batches.push(toPush.slice(i, i + 25));
      const pushShare = batches.length ? 0.4 : 0;
      let rejected = 0;
      ui.set(4, toPush.length ? `Sende ${toPush.length} ${toPush.length === 1 ? 'Eintrag' : 'Einträge'} …` : 'Prüfe auf Neuigkeiten …', '');
      for (let i = 0; i < batches.length; i++) {
        const r = await call({ action: 'push', events: batches[i].map(e => ({ id: e.id, ts: e.ts, person: e.person, type: e.type, summary: e.summary || '', data: e.data })) });
        rejected += r.rejected || 0;
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
      rejectedCount = rejected ? pending.length : 0;
      saveLog();
      lastSync = new Date().toISOString(); LS.set('lastSync', lastSync); syncError = null;
      ui.set(100, 'Fertig', '');
      if (overlay) await sleep(400);
      if (rejected && !quiet) toast('Einige Einträge wurden abgelehnt. Bitte das Google-Skript aktualisieren.');
      return { ok: true };
    } catch (err) {
      const code = (err && err.code) || 'server';
      syncError = code;
      const [t, s] = SYNC_ERR[code] || ['Sync fehlgeschlagen', `Fehler: ${code}`];
      if (overlay) await ui.error(t, s);
      else if (!quiet) toast(t);
      return { ok: false, code };
    } finally {
      ui.hide(); syncing = null; invalidate(); safeRender();
    }
  })();
  return syncing;
}

/* ---------- Oberfläche ---------- */
let view = '', verlaufTab = 'aktiv', notesFilter = 'Alle', skipAsk = false, finishAsk = false, discardAsk = false, builder = null, resetAsk = false, pendingRender = false;
const cal = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: todayStr() };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800);
}
function bellBtn(id = 'bell') {
  const n = openCount();
  return `<a class="iconbtn" id="${id}" href="#glocke" aria-label="Planänderungen${n ? ', ' + n + ' neu' : ''}">${ICON.bell}${n ? `<span class="badge">${n}</span>` : ''}</a>`;
}
function head(title) {
  return `<header class="head" id="head"><div class="brand">${title}</div>${bellBtn()}<a class="iconbtn" href="#einstellungen" aria-label="Einstellungen">${ICON.gear}</a></header>`;
}
function tabbar(active) {
  const t = (id, label, icon) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar">${t('start', 'Start', ICON.home)}${t('verlauf', 'Verlauf', ICON.chart)}${t('plan', 'Plan', ICON.list)}${t('notizen', 'Notizen', ICON.note)}</nav>`;
}
const subhead = (title, backTo = 'start') => `<header class="head" id="head"><a class="back" href="#${backTo}">${ICON.back} Zurück</a><div class="brand" style="text-align:right">${title}</div></header>`;

function safeRender() {
  const a = document.activeElement;
  if (a && $('#app').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { pendingRender = true; if (view === 'training') refreshTraining(); return; }
  if (view === 'training' && draft) { refreshTraining(); return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => {
  if (!pendingRender) return;
  const a = document.activeElement;
  if (a && $('#app').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  pendingRender = false; if (view === 'training' && draft) refreshTraining(); else render();
}, 50));

function render() {
  const app = $('#app');
  if (!cfg.me) { app.innerHTML = viewSetup(); return; }
  const h = decodeURIComponent(location.hash.slice(1)) || 'start';
  const [name, arg] = h.includes(':') ? [h.slice(0, h.indexOf(':')), h.slice(h.indexOf(':') + 1)] : [h, ''];
  if (name !== view) { skipAsk = finishAsk = discardAsk = resetAsk = false; }
  let html;
  switch (name) {
    case 'training': if (!draft) { location.hash = '#start'; return; } html = viewTraining(); break;
    case 'verlauf': html = head('Verlauf') + `<main class="view">${viewVerlauf()}</main>` + tabbar('verlauf'); break;
    case 'plan': html = head('Plan') + `<main class="view">${viewPlan()}</main>` + tabbar('plan'); break;
    case 'notizen': html = head('Notizen') + `<main class="view">${viewNotes()}</main>` + tabbar('notizen'); break;
    case 'glocke': html = subhead('Planänderungen', draft ? 'training' : 'start') + `<main class="view">${viewBell()}</main>` + (draft ? '' : tabbar('')); break;
    case 'einstellungen': html = subhead('Einstellungen') + `<main class="view">${viewSettings()}</main>` + tabbar(''); break;
    case 'gewicht': html = subhead('Körpergewicht') + `<main class="view">${viewBodyweight()}</main>` + tabbar(''); break;
    case 'uebung': html = subhead('Übung', 'verlauf') + `<main class="view">${viewExercise(arg)}</main>` + tabbar('verlauf'); break;
    case 'training-log': html = subhead('Training', 'verlauf') + `<main class="view">${viewWorkout(arg)}</main>` + tabbar('verlauf'); break;
    default: html = head(`Hantelbuch<small>${esc(cfg.me)}</small>`) + `<main class="view">${viewStart()}</main>` + tabbar('start');
  }
  app.innerHTML = html;
  if (name !== view) { window.scrollTo(0, 0); view = name; }
  pendingRender = false;
  onScroll();
}
function onScroll() { const h = $('#head'); if (h) h.classList.toggle('scrolled', window.scrollY > 4); }
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- Start ---------- */
function syncLine() {
  const waiting = pending.filter(p => !seenIds.has(p.id)).length;
  if (!cfg.url) return `<div class="syncline"><i class="dot off"></i><span>Ohne Sync – Einträge bleiben nur auf diesem Handy.</span><a class="linkbtn" href="#einstellungen">Einrichten</a></div>`;
  const old = scriptVersion != null && scriptVersion < SCRIPT_MIN;
  const txt = old ? 'Google-Skript bitte aktualisieren (siehe Anleitung)' :
    syncError && waiting ? `${waiting} ${waiting === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Sync` :
    waiting ? `${waiting} ${waiting === 1 ? 'Eintrag wird' : 'Einträge werden'} gesendet …` :
    lastSync ? `Synchronisiert ${relDay(lastSync)}, ${fmtTime(lastSync)}` : 'Noch nicht synchronisiert';
  return `<div class="syncline"><i class="dot ${waiting || old ? 'wait' : ''}"></i><span>${txt}</span><button class="linkbtn" data-act="sync">${ICON.sync} Sync</button></div>`;
}

function viewStart() {
  const s = st(), me = cfg.me, other = partner();
  const nd = nextDay(me), plan = s.plans[me][nd];
  const dl = deloadState(me);
  const nSets = plan.exercises.reduce((a, x) => a + (+x.sets || 0), 0);
  const lastDone = s.workouts.filter(w => w.person === me && w.data.day === nd).pop();
  const lastAny = s.last[me];
  const rot = DAYS.map(d => `<div class="rot ${d === nd && !draft ? 'next' : ''}"><b>${d}</b><span>${esc(s.plans[me][d].title)}</span></div>`).join('');
  let main;
  if (draft) {
    main = `<div class="eyebrow">Training läuft · Tag ${draft.day}${draft.deload ? ' · Deload' : ''}</div>
      <h2 class="display">${esc(draft.title)}</h2>
      <div class="muted">Begonnen ${relDay(draft.start)} um ${fmtTime(draft.start)}</div>
      <a class="btn primary" href="#training">Training fortsetzen</a>`;
  } else {
    const nextAfter = DAYS[(DAYS.indexOf(nd) + 1) % 3];
    main = `<div class="eyebrow">${dl.active ? `Deload · Teil ${dl.part} von 3 · ` : 'Als Nächstes · '}Tag ${nd}</div>
      <h2 class="display">${esc(plan.title)}</h2>
      <div class="muted">${plan.exercises.length} Übungen · ${dl.active ? `${plan.exercises.reduce((a, x) => a + Math.ceil((+x.sets || 1) / 2), 0)} Sätze (halbiert)` : `${nSets} Sätze`}${lastDone ? ` · zuletzt ${relDay(lastDone.ts)}` : ''}</div>
      ${dl.active ? `<div class="deload"><b>Deload-Woche</b><span>${esc(dl.reason)}. Gewicht −10 %, halbe Sätze, Wiederholungen am unteren Ende. Danach geht es mit deinen bisherigen Gewichten weiter.</span></div>` : ''}
      <button class="btn primary" data-act="start">${dl.active ? 'Deload-Training starten' : 'Training starten'}</button>
      ${dl.active ? '<button class="btn ghost" data-act="start-normal">Heute normal trainieren</button>' : ''}
      ${skipAsk ? `<div class="confirm"><div><b>Tag ${nd} überspringen?</b><br><span class="small">Danach ist bei dir Tag ${nextAfter} dran. ${esc(gen(other))} Rotation bleibt unverändert.</span></div>
        <div class="btnrow"><button class="btn small" data-act="skip-yes">Überspringen</button><button class="btn small ghost" data-act="skip-no">Abbrechen</button></div></div>`
        : `<button class="btn ghost" data-act="skip-ask">Tag ${nd} überspringen</button>`}`;
  }
  const wk = weekStart();
  const weekCount = p => s.workouts.filter(w => w.person === p && new Date(w.ts) >= wk).length;
  const ol = s.last[other];
  const install = !(navigator.standalone || matchMedia('(display-mode: standalone)').matches) && /iPhone|iPad/.test(navigator.userAgent)
    ? `<div class="install"><span>Tipp: Tippe in Safari auf <b>Teilen</b> und dann <b>Zum Home-Bildschirm</b>. Dann läuft die App wie eine normale App und auch offline.</span></div>` : '';
  const feed = s.feed.slice(0, 5);
  const bw = s.bw[me], lb = bw[bw.length - 1], pb = bw[bw.length - 2];
  return `${install}
    <section class="hero">${main}<div class="rotation" aria-label="Deine Rotation">${rot}</div></section>
    ${syncLine()}
    <div class="duo">
      <section class="card"><span class="who ${cls(me)}">Du</span><span class="big">${weekCount(me)}</span><span class="small muted">Trainings diese Woche${lastAny ? `<br>zuletzt ${relDay(lastAny.ts)}` : ''}</span></section>
      <section class="card"><span class="who ${cls(other)}">${esc(other)}</span><span class="big">${weekCount(other)}</span><span class="small muted">Trainings diese Woche<br>${ol ? `${ol.kind === 'skip' ? 'übersprungen' : 'zuletzt'} ${relDay(ol.ts)} · als Nächstes Tag ${nextDay(other)}` : 'noch kein Eintrag'}</span></section>
    </div>
    <section class="card bwcard">
      <div class="rowbetween"><b>Körpergewicht</b><a class="linkbtn" href="#gewicht">Verlauf</a></div>
      <div class="rowbetween"><span class="big mono">${lb ? fmtN(lb.kg) + ' kg' : '–'}</span><span class="small muted">${lb ? `${relDay(lb.ts)}${pb ? ` · ${lb.kg - pb.kg >= 0 ? '+' : '−'}${fmtN(Math.abs(lb.kg - pb.kg))} kg` : ''}` : 'Noch kein Eintrag'}</span></div>
      <div class="bwin"><label class="field"><input id="bw-in" inputmode="decimal" autocomplete="off" placeholder="z. B. 82,4" aria-label="Körpergewicht in kg"><span>kg</span></label><button class="btn small" data-act="bw-save">Eintragen</button></div>
    </section>
    <div class="sec-title"><h2>Neuigkeiten</h2>${s.feed.length > 5 ? '<a href="#verlauf">Alle anzeigen</a>' : ''}</div>
    <section class="card">${feed.length ? `<div class="feed">${feed.map(feedItem).join('')}</div>` : '<div class="empty">Hier erscheinen eure Trainings, Steigerungen und Skips.</div>'}</section>`;
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
    extra = (d.deload ? '<span class="chip dl">Deload</span>' : '')
      + imp.map(i => `<span class="chip ${i.pr ? 'pr' : 'up'}">${esc(i.name.replace(/\s*\(.*\)$/, ''))} ${esc(i.label)}${i.pr ? ' · Rekord' : ''}</span>`).join('')
      + (notes ? `<span class="chip">${notes} ${notes === 1 ? 'Notiz' : 'Notizen'}</span>` : '');
    href = '#training-log:' + encodeURIComponent(e.id);
  } else if (e.type === 'skip') {
    t = `<b>${esc(p)}</b> hat Tag ${d.day} übersprungen`;
  } else if (e.type === 'swap') {
    t = `<b>${esc(p)}</b> hat heute ${esc(d.fromName)} durch ${esc(d.to.name)} getauscht`;
    extra = `<span class="chip">Tag ${d.day} · für beide</span>`;
  }
  const inner = `<div class="av ${cls(p)}">${esc(p[0])}</div><div><div class="t">${t}</div><div class="m">${m}</div>${extra || wait ? `<div class="chips">${extra}${wait}</div>` : ''}</div>`;
  return href ? `<a class="fi" href="${href}">${inner}</a>` : `<div class="fi">${inner}</div>`;
}

/* ---------- Training ---------- */
function normalizeDraft(d) {
  if (!d || !Array.isArray(d.items)) return null;
  d.swapIgnored = d.swapIgnored || [];
  d.items.forEach(it => {
    it.ex = cleanEx(it.ex); it.note = it.note || ''; it.feel = it.feel || ''; it.wu = it.wu || [];
    it.sets = (it.sets || []).map(s => ({ w: s.w ?? '', neg: !!s.neg, r: s.r ?? '', done: !!s.done }));
  });
  return d;
}
function blankSet(w) { return { w: w == null || w === 0 ? '' : fmtIn(w), neg: w < 0, r: '', done: false }; }
function newItem(x, deload) {
  const pr = progression(x);
  let n = Math.max(1, +x.sets || 1), w = pr.w;
  if (deload) { n = Math.max(1, Math.ceil(n / 2)); w = pr.base == null ? null : roundTo(deloadW(pr.base), stepOf(x)); }
  if (x.type === 'time') w = null;
  return { ex: x, note: '', feel: '', wu: [], swappedFrom: null, swapBy: null, removed: false, sets: Array.from({ length: n }, () => blankSet(w)) };
}
function partnerSwapsToday(day) {
  const other = partner(), latest = {};
  st().swaps.filter(e => e.person === other && e.data.day === day && e.data.date === todayStr()).forEach(e => { latest[e.data.fromId] = e; });
  return Object.values(latest);
}
function startTraining(skipDeload) {
  const me = cfg.me, day = nextDay(me), plan = st().plans[me][day];
  const dl = deloadState(me), deload = dl.active && !skipDeload;
  draft = { day, title: plan.title, start: new Date().toISOString(), deload, deloadSkipped: dl.active && !!skipDeload, swapIgnored: [], items: plan.exercises.map(x => newItem(clone(x), deload)) };
  partnerSwapsToday(day).forEach(sw => {
    const i = draft.items.findIndex(t => t.ex.id === sw.data.fromId);
    if (i < 0) return;
    const it = newItem(clone(sw.data.to), deload);
    it.swappedFrom = { id: sw.data.fromId, name: sw.data.fromName }; it.swapBy = sw.person;
    draft.items[i] = it;
  });
  saveDraft(); location.hash = '#training';
}
const hasEntries = it => it.sets.some(s => s.done || int(s.r) > 0) || !!(it.note || '').trim();
const workCount = () => { let done = 0, tot = 0; draft.items.forEach(it => it.sets.forEach(s => { tot++; if (s.done) done++; })); return { done, tot }; };

function viewTraining() {
  const { done, tot } = workCount();
  return `<header class="trainhead" id="head">
      <div class="row"><a class="back" href="#start">${ICON.back} Start</a><span class="mono small muted" id="tp-count">${done}/${tot} Sätze</span>${bellBtn('tbell')}</div>
      <div class="row"><h1 class="display">Tag ${draft.day} · ${esc(draft.title)}</h1>${draft.deload ? '<span class="pill dl">Deload</span>' : ''}</div>
      <div class="bar"><i id="tp-bar" style="width:${tot ? done / tot * 100 : 0}%"></i></div>
    </header>
    <main class="view notab">
      ${draft.items.map((it, i) => exCard(it, i)).join('')}
      <div class="finishbar">${finishAsk ? finishPanel() : `<button class="btn accent" data-act="finish-ask">Training abschließen</button>`}
        ${discardAsk ? `<div class="confirm"><b>Training verwerfen?</b><span class="small">Alle Einträge dieses Trainings gehen verloren. Deine Rotation bleibt unverändert.</span>
          <div class="btnrow"><button class="btn small danger" data-act="discard-yes">Verwerfen</button><button class="btn small ghost" data-act="discard-no">Abbrechen</button></div></div>`
          : `<button class="btn ghost danger" data-act="discard-ask">Training verwerfen</button>`}</div>
    </main>`;
}
function pendingSwapFor(it) {
  if (!draft || it.swappedFrom || it.removed) return null;
  return partnerSwapsToday(draft.day).find(sw => sw.data.fromId === it.ex.id && !draft.swapIgnored.includes(sw.id)) || null;
}
function warmupScheme(i) {
  const it = draft.items[i];
  if (!it.ex.warmup || it.ex.type !== 'kg' || it.removed) return [];
  const first = draft.items.findIndex(t => t.ex.warmup && t.ex.type === 'kg' && !t.removed);
  return i === first ? [[0.4, 10], [0.6, 5], [0.8, 3]] : [[0.6, 5]];
}
function warmupLabel(it, p, reps, k) {
  const W = num(it.sets[0] && it.sets[0].w) || workW(it.sets.map(s => ({ w: s.w, r: 1 })));
  if (!(W > 0)) return k === 0 ? `Leere Stange × ${reps}` : `${Math.round(p * 100)} % × ${reps}`;
  const kg = Math.max(W >= 20 ? 20 : 0, roundTo(W * p, 2.5));
  return `${fmtN(Math.min(kg, W))} kg × ${reps}`;
}
function exCard(it, i) {
  const x = it.ex, me = cfg.me, other = partner();
  const mine = lastAny(me, x.id), theirs = lastAny(other, x.id);
  const pr = progression(x);
  const unit = x.type === 'time' ? ' s' : '';
  const allDone = it.sets.length && it.sets.every(s => s.done);
  const hint = draft.deload ? 'Deload: Gewicht −10 %, halbe Sätze, Wiederholungen am unteren Ende.' : pr.hint;
  const sw = pendingSwapFor(it);
  const scheme = warmupScheme(i);
  const lastReps = j => (draft.deload ? x.min : mine && mine.type === x.type && mine.sets[j] ? mine.sets[j].r : x.max);
  const wField = (s, j) => x.type === 'kg'
    ? `<label class="field"><input id="w-${i}-${j}" data-i="${i}" data-j="${j}" data-f="w" inputmode="decimal" autocomplete="off" aria-label="Gewicht Satz ${j + 1}" value="${esc(s.w)}" placeholder="–"><span>kg</span></label>`
    : x.type === 'bw'
      ? `<div class="field"><button class="sign" data-act="sign" data-i="${i}" data-j="${j}" aria-label="${s.neg ? 'Unterstützung, tippen für Zusatzgewicht' : 'Zusatzgewicht, tippen für Unterstützung'}">${s.neg ? '−' : '+'}</button><input id="w-${i}-${j}" data-i="${i}" data-j="${j}" data-f="w" inputmode="decimal" autocomplete="off" aria-label="${s.neg ? 'Unterstützung' : 'Zusatzgewicht'} Satz ${j + 1}" value="${esc(s.w)}" placeholder="0"><span>kg</span></div>` : '';
  const rows = it.sets.map((s, j) => `<div class="set ${s.done ? 'ok' : ''}">
      <span class="n">${j + 1}</span>${wField(s, j)}
      <label class="field"><input id="r-${i}-${j}" data-i="${i}" data-j="${j}" data-f="r" inputmode="numeric" autocomplete="off" aria-label="${x.type === 'time' ? 'Sekunden' : 'Wiederholungen'} Satz ${j + 1}" value="${esc(s.r)}" placeholder="${lastReps(j)}"><span>${x.type === 'time' ? 's' : '×'}</span></label>
      <button class="check" data-act="check" data-i="${i}" data-j="${j}" aria-label="Satz ${j + 1} erledigt" aria-pressed="${s.done}">${ICON.check}</button>
    </div>`).join('');
  const cols = x.type === 'time' ? `<div class="cols"><span>Satz</span><span class="r">Sekunden</span><span></span></div>`
    : `<div class="cols"><span>Satz</span><span class="r">${x.type === 'bw' ? '± kg' : 'kg'}</span><span class="r">Wdh.</span><span></span></div>`;
  const warm = scheme.length ? `<div class="wsets"><div class="cols"><span></span><span>Aufwärmen</span><span></span></div>${scheme.map(([p, reps], k) => `<div class="wset ${it.wu[k] ? 'ok' : ''}"><span class="n">W</span><span class="wv" id="wu-${i}-${k}">${warmupLabel(it, p, reps, k)}</span><button class="check small" data-act="wu" data-i="${i}" data-k="${k}" aria-label="Aufwärmsatz ${k + 1} erledigt" aria-pressed="${!!it.wu[k]}">${ICON.check}</button></div>`).join('')}</div>` : '';
  return `<article class="ex ${allDone ? 'done' : ''} ${it.removed ? 'gone' : ''}" data-card="${i}" data-swaphint="${sw ? esc(sw.id) : ''}">
    <div class="ex-head"><div class="nm"><h3>${esc(x.name)}</h3>
      ${it.swappedFrom ? `<span class="tag">Heute statt ${esc(it.swappedFrom.name)}${it.swapBy && it.swapBy !== me ? ` · von ${esc(it.swapBy)}` : ''}</span>` : ''}
      ${it.removed ? '<span class="tag warn">Nicht mehr im Plan</span>' : ''}${x.personal ? '<span class="tag">Nur ich</span>' : ''}</div>
      <span class="tgt">${it.sets.length}×${x.min}–${x.max}${unit}</span></div>
    ${sw ? `<div class="swaphint"><span><b>${esc(sw.person)}</b> hat heute ${esc(sw.data.fromName)} durch <b>${esc(sw.data.to.name)}</b> getauscht.</span><div class="btnrow"><button class="btn small accent" data-act="swap-follow" data-i="${i}" data-id="${esc(sw.id)}">Auch tauschen</button><button class="btn small ghost" data-act="swap-ignore" data-id="${esc(sw.id)}">Nein</button></div></div>` : ''}
    <div class="lastline"><span class="who ${cls(me)}">Du</span><span class="v">${mine && mine.type === x.type ? fmtSets(x.type, mine.sets) : 'noch kein Eintrag'}</span>${mine ? `<span>${relDay(mine.ts)}${mine.deload ? ' · Deload' : ''}</span>` : ''}</div>
    ${theirs ? `<div class="lastline"><span class="who ${cls(other)}">${esc(other)}</span><span class="v">${fmtSets(theirs.type, theirs.sets)}</span><span>${relDay(theirs.ts)}</span></div>` : ''}
    ${hint ? `<div class="hint ${draft.deload ? 'dlhint' : pr.kind === 'down' || pr.kind === 'plateau' ? 'warnhint' : ''}">${esc(hint)}${pr.kind === 'plateau' && !draft.deload ? `<div class="btnrow" style="margin-top:8px"><button class="btn small" data-act="plateau-down" data-i="${i}">Heute −10 %</button></div><span class="small">Oder im Plan die Spanne anheben, z. B. ${x.min}–${x.max} → ${x.min + 2}–${x.max + 2}.</span>` : ''}</div>` : ''}
    ${mine && mine.note ? `<div class="quote ${cls(me)} small">Deine Notiz vom letzten Mal: ${esc(mine.note)}</div>` : ''}
    <details class="how"><summary>Ausführung & Video</summary><div class="body">
      ${x.cue ? `<p>${esc(x.cue)}</p>` : ''}
      ${x.image ? `<img src="${esc(x.image)}" alt="${esc(x.name)}" loading="lazy">` : ''}
      <a class="vlink" href="${esc(videoUrl(x))}" target="_blank" rel="noopener">▶ ${x.video ? 'Video ansehen' : 'Videos auf YouTube suchen'}</a>
    </div></details>
    ${warm}
    <div class="sets ${x.type}">${cols}${rows}</div>
    <div class="cardacts"><button class="addset" data-act="addset" data-i="${i}">+ Satz</button>${it.removed ? '' : `<button class="addset" data-act="swap-open" data-i="${i}">${ICON.swap} Heute tauschen</button>`}</div>
    ${allDone ? `<div class="feel" role="group" aria-label="Wie war die Übung?"><span>Wie war's?</span>${Object.entries(FEEL).map(([k, v]) => `<button data-act="feel" data-i="${i}" data-v="${k}" aria-pressed="${it.feel === k}">${v}</button>`).join('')}</div>` : ''}
    <label class="note"><span>Notiz</span><textarea id="note-${i}" data-note="${i}" rows="2" placeholder="z. B. Schulter zwickt, nächstes Mal enger greifen">${esc(it.note)}</textarea></label>
  </article>`;
}
function rerenderCard(i) {
  const el = document.querySelector(`[data-card="${i}"]`);
  if (el) { const d = el.querySelector('details.how'); const open = d && d.open; el.outerHTML = exCard(draft.items[i], i); if (open) document.querySelector(`[data-card="${i}"] details.how`).open = true; }
  updateTrainHead();
}
function updateTrainHead() {
  const { done, tot } = workCount();
  const c = $('#tp-count'), b = $('#tp-bar'), bell = $('#tbell');
  if (c) c.textContent = `${done}/${tot} Sätze`;
  if (b) b.style.width = (tot ? done / tot * 100 : 0) + '%';
  if (bell) bell.outerHTML = bellBtn('tbell');
}
function refreshTraining() {
  if (!draft || view !== 'training') return;
  if (document.querySelectorAll('[data-card]').length !== draft.items.length) { if (!document.activeElement || !$('#app').contains(document.activeElement)) render(); return; }
  document.querySelectorAll('[data-card]').forEach(el => {
    const i = +el.dataset.card, sw = pendingSwapFor(draft.items[i]);
    if ((el.dataset.swaphint || '') !== (sw ? sw.id : '') && !el.contains(document.activeElement)) rerenderCard(i);
  });
  updateTrainHead();
}
function updateWarmups(i) {
  const it = draft.items[i];
  warmupScheme(i).forEach(([p, reps], k) => { const el = document.getElementById(`wu-${i}-${k}`); if (el) el.textContent = warmupLabel(it, p, reps, k); });
}
function collectEntries() {
  return draft.items.map(it => {
    const x = it.ex;
    const sets = it.sets.filter(s => s.done || int(s.r) > 0).map(s => {
      if (x.type === 'time') return { r: int(s.r) };
      const w = Math.abs(num(s.w)) * (x.type === 'bw' && s.neg ? -1 : 1);
      return { w: x.type === 'kg' ? num(s.w) : w, r: int(s.r) };
    }).filter(s => s.r > 0);
    return { exId: x.id, name: x.name, type: x.type, sets, note: (it.note || '').trim(), feel: it.feel || '' };
  }).filter(en => en.sets.length || en.note);
}
function finishPanel() {
  const entries = collectEntries();
  const sets = entries.reduce((a, en) => a + en.sets.length, 0);
  const vol = entries.filter(en => en.type === 'kg').reduce((a, en) => a + en.sets.reduce((b, s) => b + s.w * s.r, 0), 0);
  const empty = draft.items.filter(it => !it.removed && !entries.some(en => en.exId === it.ex.id)).map(it => it.ex.name);
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
  const swaps = draft.items.filter(it => it.swappedFrom).map(it => ({ fromId: it.swappedFrom.id, fromName: it.swappedFrom.name, toId: it.ex.id, toName: it.ex.name }));
  const summary = `Tag ${draft.day} ${draft.title}${draft.deload ? ' (Deload)' : ''} · ${n} Sätze · ` + entries.map(en => `${en.name}: ${fmtSets(en.type, en.sets)}${en.feel ? ` [${FEEL[en.feel]}]` : ''}${en.note ? ` (Notiz: ${en.note})` : ''}`).join(' | ');
  const e = addEvent('workout', { day: draft.day, title: draft.title, start: draft.start, end, deload: !!draft.deload, deloadSkipped: !!draft.deloadSkipped, swaps, entries }, summary);
  draft = null; saveDraft(); finishAsk = false;
  const imp = improvements(e);
  toast(imp.length ? `Training gespeichert · ${imp.length} ${imp.length === 1 ? 'Steigerung' : 'Steigerungen'}` : 'Training gespeichert');
  location.hash = '#start';
}
// Geänderten Plan ins laufende Training übernehmen, ohne Eingaben zu verlieren
function applyToDraft(plan) {
  const old = draft.items, used = new Set(), res = [];
  plan.exercises.forEach(x => {
    let it = old.find(t => !used.has(t) && !t.swappedFrom && t.ex.id === x.id) || old.find(t => !used.has(t) && t.swappedFrom && t.swappedFrom.id === x.id);
    if (it) {
      used.add(it);
      if (!it.swappedFrom) it.ex = clone(x);
      const target = draft.deload ? Math.ceil(x.sets / 2) : x.sets;
      while (it.sets.length < target) { const l = it.sets[it.sets.length - 1]; it.sets.push({ w: l ? l.w : '', neg: l ? l.neg : false, r: '', done: false }); }
      it.removed = false; res.push(it);
    } else res.push(newItem(clone(x), draft.deload));
  });
  old.forEach((t, i) => {
    if (used.has(t) || !hasEntries(t)) return;
    t.removed = true;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) { const k = res.indexOf(old[j]); if (k >= 0) { pos = k + 1; break; } }
    res.splice(pos, 0, t);
  });
  draft.items = res; draft.title = plan.title; saveDraft();
}
function knownExercises() {
  const s = st(), map = new Map();
  PEOPLE.forEach(p => DAYS.forEach(d => s.plans[p][d].exercises.forEach(x => { if (!map.has(x.name.toLowerCase())) map.set(x.name.toLowerCase(), { id: x.id, name: x.name, type: x.type }); })));
  Object.entries(s.exInfo).forEach(([id, v]) => { if (!map.has(v.name.toLowerCase())) map.set(v.name.toLowerCase(), { id, name: v.name, type: v.type }); });
  return map;
}
function swapForm(i) {
  const it = draft.items[i], x = it.ex;
  const names = [...knownExercises().values()].map(v => v.name).filter(n => n !== x.name).sort((a, b) => a.localeCompare(b, 'de'));
  $('#modal').innerHTML = `<div class="backdrop" data-act="mclose-bg"><form class="sheet form" id="swapform" data-i="${i}" novalidate>
    <h2>Heute tauschen</h2>
    <p class="help" style="margin:0">Ersetzt <b>${esc(x.name)}</b> nur in diesem Training. Dein Plan bleibt unverändert, die Ersatzübung bekommt ihren eigenen Verlauf.</p>
    <label>Ersatzübung<input class="inp" id="sw-name" name="name" list="sw-list" maxlength="60" autocomplete="off" required placeholder="z. B. Brustpresse Maschine"><datalist id="sw-list">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>
    <label>Art<select id="sw-type" name="type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <div class="grid3"><label>Sätze<input class="inp" id="sw-sets" name="sets" inputmode="numeric" value="${x.sets}"></label><label>von<input class="inp" id="sw-min" name="min" inputmode="numeric" value="${x.min}"></label><label>bis<input class="inp" id="sw-max" name="max" inputmode="numeric" value="${x.max}"></label></div>
    <fieldset class="radios"><legend>Für wen?</legend>
      <label class="chk"><input type="radio" name="who" value="both" checked><span>Für uns beide heute<small>${esc(partner())} sieht den Tausch in seinem heutigen Training für Tag ${draft.day}.</small></span></label>
      <label class="chk"><input type="radio" name="who" value="me"><span>Nur für mich</span></label>
    </fieldset>
    <div class="err" id="sw-err" hidden></div>
    <div class="btnrow"><button class="btn primary" type="submit">Tauschen</button><button class="btn ghost" type="button" data-act="mclose">Abbrechen</button></div>
  </form></div>`;
  setTimeout(() => { const n = $('#sw-name'); if (n) n.focus(); }, 50);
}
function doSwap(i, x, from, by, shared) {
  const it = draft.items[i];
  const ni = newItem(x, draft.deload); ni.swappedFrom = from; ni.swapBy = by;
  if (hasEntries(it)) draft.items.splice(i + 1, 0, ni); else draft.items.splice(i, 1, ni);
  saveDraft();
  if (shared) addEvent('swap', { day: draft.day, date: todayStr(), fromId: from.id, fromName: from.name, to: x }, `Tag ${draft.day}: ${from.name} heute durch ${x.name} ersetzt (für beide)`);
}
function submitSwap(form) {
  const f = new FormData(form), i = +form.dataset.i, it = draft.items[i];
  const err = m => { const e = $('#sw-err'); e.textContent = m; e.hidden = false; };
  const name = String(f.get('name') || '').trim();
  const sets = int(f.get('sets')), min = int(f.get('min')), max = int(f.get('max'));
  if (!name) return err('Bitte gib die Ersatzübung ein.');
  if (!sets || sets > 10 || !min || !max || min > max) return err('Bitte prüfe Sätze und Spanne.');
  const known = knownExercises().get(name.toLowerCase());
  const type = known ? known.type : f.get('type');
  const id = known ? known.id : 's-' + slug(name);
  const from = it.swappedFrom || { id: it.ex.id, name: it.ex.name };
  if (id === it.ex.id || id === from.id) return err('Das ist dieselbe Übung.');
  const x = cleanEx({ id, name: known ? known.name : name, type, sets, min, max, step: type === 'time' ? 0 : 2.5, warmup: false });
  $('#modal').innerHTML = '';
  doSwap(i, x, from, cfg.me, f.get('who') === 'both');
  render();
  toast(f.get('who') === 'both' ? `Getauscht. ${partner()} sieht den Tausch.` : 'Getauscht');
}

/* ---------- Verlauf ---------- */
function viewVerlauf() {
  const seg = `<div class="seg" role="group" aria-label="Ansicht">${[['aktiv', 'Aktivität'], ['uebungen', 'Übungen'], ['kalender', 'Kalender']].map(([k, v]) => `<button data-act="vtab" data-v="${k}" aria-pressed="${verlaufTab === k}">${v}</button>`).join('')}</div>`;
  const s = st(), me = cfg.me, other = partner();
  if (verlaufTab === 'aktiv') return seg + `<section class="card">${s.feed.length ? `<div class="feed">${s.feed.map(feedItem).join('')}</div>` : '<div class="empty">Noch keine Einträge. Starte dein erstes Training auf der Startseite.</div>'}</section>`;
  if (verlaufTab === 'kalender') return seg + viewCalendar();
  const inPlan = new Set();
  const row = x => {
    inPlan.add(x.id);
    const a = lastAny(me, x.id), b = lastAny(other, x.id);
    return `<a class="exrow" href="#uebung:${encodeURIComponent(x.id)}"><div class="n"><b>${esc(x.name)}</b><span class="small muted">${TYPE_LABEL[x.type]}${x.personal ? ' · nur ich' : ''}</span></div>
      <div class="vals"><span class="m">${a ? metricLabel(a.type, a.sets) : '–'}</span><span class="r">${b ? metricLabel(b.type, b.sets) : '–'}</span></div><span class="chev">›</span></a>`;
  };
  const days = DAYS.map(d => `<div class="sec-title"><h2>Tag ${d} · ${esc(s.plans[me][d].title)}</h2></div><section class="card">${s.plans[me][d].exercises.map(row).join('') || '<div class="empty">Keine Übungen</div>'}</section>`).join('');
  const archived = Object.keys(s.exInfo).filter(id => !inPlan.has(id) && (s.hist[me][id] || s.hist[other][id]));
  const legend = `<div class="legend small"><span class="who ${cls(me)}">Du</span><span class="who ${cls(other)}">${esc(other)}</span><span class="muted">letzte Einheit</span></div>`;
  return seg + legend + days + (archived.length ? `<div class="sec-title"><h2>Archiv</h2></div><div class="small muted" style="margin:0 2px">Ausgetauschte, entfernte oder spontan getauschte Übungen. Ihr Verlauf bleibt erhalten.</div><section class="card">${archived.map(id => row({ id, ...s.exInfo[id] })).join('')}</section>` : '');
}

function viewCalendar() {
  const s = st(), first = new Date(cal.y, cal.m, 1), offset = (first.getDay() + 6) % 7, daysIn = new Date(cal.y, cal.m + 1, 0).getDate();
  const map = {}; const add = (k, o) => (map[k] = map[k] || []).push(o);
  s.workouts.forEach(w => add(dateKey(w.ts), { p: w.person, day: w.data.day, kind: w.data.deload ? 'deload' : 'workout', e: w }));
  s.skips.forEach(e => add(dateKey(e.ts), { p: e.person, day: e.data.day, kind: 'skip', e }));
  const today = todayStr();
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cd empty"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const k = `${cal.y}-${pad2(cal.m + 1)}-${pad2(d)}`;
    const items = (map[k] || []).sort((a, b) => PEOPLE.indexOf(a.p) - PEOPLE.indexOf(b.p));
    cells += `<button class="cd ${k === today ? 'today' : ''} ${k === cal.sel ? 'sel' : ''}" data-act="calday" data-v="${k}" aria-label="${d}. ${items.length ? items.length + ' Einträge' : 'kein Eintrag'}"><span class="dn">${d}</span><span class="marks">${items.map(o => `<i class="cm ${cls(o.p)} ${o.kind}">${o.day}</i>`).join('')}</span></button>`;
  }
  const sel = (map[cal.sel] || []).map(o => o.e).sort((a, b) => b.ts.localeCompare(a.ts));
  const title = first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return `<section class="card cal">
      <div class="calnav"><button class="tool" data-act="calmove" data-v="-1" aria-label="Voriger Monat">${ICON.left}</button><b>${title}</b><button class="tool" data-act="calmove" data-v="1" aria-label="Nächster Monat">${ICON.right}</button></div>
      <div class="calgrid">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => `<span class="wd">${w}</span>`).join('')}${cells}</div>
      <div class="legend small"><span><i class="cm manu workout">A</i> Manu</span><span><i class="cm rob workout">A</i> Rob</span><span><i class="cm manu skip">A</i> übersprungen</span><span><i class="cm manu deload">A</i> Deload</span></div>
    </section>
    <div class="sec-title"><h2>${new Date(cal.sel + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div>
    <section class="card">${sel.length ? `<div class="feed">${sel.map(feedItem).join('')}</div>` : '<div class="empty">An diesem Tag hat niemand trainiert.</div>'}</section>`;
}

function chartSvg(series, label) {
  const pts = series.flatMap(sr => sr.points);
  if (!pts.length) return '<div class="empty">Noch keine Daten für diese Übung.</div>';
  const W = 340, H = 170, L = 38, R = 14, T = 16, B = 26;
  const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t));
  let v0 = Math.min(...pts.map(p => p.v)), v1 = Math.max(...pts.map(p => p.v));
  if (v0 === v1) { v0 -= 2; v1 += 2; }
  const raw = (v1 - v0) / 3, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const stepV = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) || 10 * mag;
  v0 = Math.floor(v0 / stepV) * stepV; if (pts.every(p => p.v >= 0)) v0 = Math.max(0, v0);
  v1 = Math.ceil(v1 / stepV) * stepV; if (v1 === v0) v1 = v0 + stepV;
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
    g += `<polyline fill="none" stroke="${sr.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${sr.points.map(p => `${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ')}"/>`;
    sr.points.forEach((p, i) => { const last = i === sr.points.length - 1; g += `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${last ? 4.5 : 3}" fill="${last ? sr.color : 'var(--surface)'}" stroke="${sr.color}" stroke-width="2"/>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf ${esc(label)}">${g}</svg>`;
}

function viewExercise(id) {
  const s = st(), me = cfg.me, other = partner();
  const info = s.exInfo[id];
  if (!info) return '<div class="empty">Diese Übung gibt es nicht.</div>';
  const def = DAYS.map(d => s.plans[me][d].exercises.find(x => x.id === id)).find(Boolean) || DAYS.map(d => s.plans[other][d].exercises.find(x => x.id === id)).find(Boolean);
  const type = (def && def.type) || info.type;
  const sessionsOf = p => normalSessions(p, id, type);
  const weighted = type === 'kg' || (type === 'bw' && [me, other].some(p => sessionsOf(p).some(h => usesWeight(h.type, h.sets))));
  const value = h => type === 'time' ? Math.max(...h.sets.map(x => x.r)) : weighted ? workW(h.sets) : sum(h.sets.map(x => x.r));
  const label = type === 'time' ? 'Längster Satz (Sek.)' : type === 'kg' ? 'Schwerster Satz (kg)' : weighted ? 'Zusatzgewicht (kg)' : 'Wiederholungen gesamt';
  const series = [me, other].map(p => ({ p, color: p === 'Rob' ? 'var(--rob)' : 'var(--accent)', points: sessionsOf(p).filter(h => h.sets.length).map(h => ({ t: +new Date(h.ts), v: value(h) })) }));
  const best = p => { const h = sessionsOf(p).filter(x => x.sets.length); if (!h.length) return '–'; const b = h.reduce((a, x) => score(x.type, x.sets) > score(a.type, a.sets) ? x : a); return metricLabel(b.type, b.sets); };
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
    <section class="card chart"><b>${label}</b>
      <div class="legend"><span class="who ${cls(me)}">Du</span><span class="who ${cls(other)}">${esc(other)}</span><span class="muted small">ohne Deload</span></div>
      ${chartSvg(series, label)}</section>
    <div class="sec-title"><h2>Alle Einheiten</h2></div>
    <section class="card">${sessions.length ? sessions.map(h => `<div class="sess"><div class="top"><span class="who ${cls(h.person)}">${h.person === me ? 'Du' : esc(h.person)}</span><span>${fmtDate(h.ts)} · Tag ${h.day}${h.deload ? ' · Deload' : ''}${h.feel ? ' · ' + FEEL[h.feel] : ''}</span></div>
      <div class="v">${fmtSets(h.type, h.sets)}</div>${h.note ? `<div class="quote ${cls(h.person)}">${esc(h.note)}</div>` : ''}</div>`).join('') : '<div class="empty">Noch nicht trainiert.</div>'}</section>`;
}

function viewWorkout(id) {
  const e = st().workouts.find(w => w.id === id);
  if (!e) return '<div class="empty">Training nicht gefunden.</div>';
  const d = e.data, imp = improvements(e);
  return `<section class="card"><span class="who ${cls(e.person)}">${esc(e.person)}</span>
      <h1 class="display" style="font-size:34px">Tag ${d.day} · ${esc(d.title)}</h1>
      <div class="small muted">${fmtDate(e.ts)}, ${fmtTime(d.start)}–${fmtTime(d.end)} · ${duration(d.start, d.end)}${d.deload ? ' · Deload' : ''}</div>
      ${imp.length ? `<div class="chips">${imp.map(i => `<span class="chip ${i.pr ? 'pr' : 'up'}">${esc(i.name)} ${esc(i.label)}${i.pr ? ' · Rekord' : ''}</span>`).join('')}</div>` : ''}</section>
    <section class="card">${d.entries.map(en => `<a class="sess" href="#uebung:${encodeURIComponent(en.exId)}" style="text-decoration:none;color:inherit"><div class="top"><b style="color:var(--fg)">${esc(en.name)}</b><span>${en.sets.length} ${en.sets.length === 1 ? 'Satz' : 'Sätze'}${en.feel ? ' · ' + FEEL[en.feel] : ''}</span></div>
      <div class="v">${fmtSets(en.type, en.sets)}</div>${en.note ? `<div class="quote ${cls(e.person)}">${esc(en.note)}</div>` : ''}</a>`).join('')}</section>`;
}

/* ---------- Körpergewicht ---------- */
function viewBodyweight() {
  const list = st().bw[cfg.me];
  const pts = list.map(b => ({ t: +new Date(b.ts), v: b.kg }));
  return `<section class="card form">
      <label>Neuer Eintrag<div class="bwin"><span class="field"><input id="bw-in" inputmode="decimal" autocomplete="off" placeholder="z. B. 82,4" aria-label="Körpergewicht in kg"><span>kg</span></span><button class="btn small" data-act="bw-save">Eintragen</button></div></label>
      <span class="small muted">Am besten einmal pro Woche morgens vor dem Frühstück. Dein Körpergewicht siehst nur du in der App.</span>
    </section>
    <section class="card chart"><b>Verlauf (kg)</b>${chartSvg([{ p: cfg.me, color: cfg.me === 'Rob' ? 'var(--rob)' : 'var(--accent)', points: pts }], 'Körpergewicht')}</section>
    <section class="card">${list.length ? list.slice().reverse().map(b => `<div class="sess"><div class="top"><span>${fmtDate(b.ts)}</span><span class="mono">${fmtN(b.kg)} kg</span></div></div>`).join('') : '<div class="empty">Noch kein Eintrag.</div>'}</section>`;
}

/* ---------- Notizen ---------- */
function viewNotes() {
  const items = [];
  st().workouts.forEach(w => (w.data.entries || []).forEach(en => { if (en.note) items.push({ w, en }); }));
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
  const list = bellItems(), other = partner(), s = st();
  const label = { open: 'Neu', dismissed: 'Ausgeblendet', diverged: 'Weicht ab' };
  const items = list.map(x => {
    const c = x.pc, inDraft = draft && draft.day === x.day;
    return `<section class="card">
      <div class="rowbetween"><span class="who ${cls(c.person)}">${esc(c.person)}</span><span class="pill ${x.status}">${label[x.status]}</span></div>
      <b>Tag ${x.day} · ${esc(s.plans[c.person][x.day].title)}</b>
      <div class="small muted">Geändert ${fmtDate(c.ts)}, ${fmtTime(c.ts)}${x.status === 'diverged' ? ' · du hast diesen Tag danach selbst geändert' : ''}</div>
      ${diffList(x.diff)}
      <div class="small muted">Deine abweichenden Übungen und persönlichen Werte (Steigerung, Ausführung, Links) bleiben erhalten.</div>
      <div class="btnrow"><button class="btn small accent" data-act="accept" data-id="${esc(c.id)}">In meinen Plan übernehmen</button>
        ${x.status === 'open' ? `<button class="btn small ghost" data-act="dismiss" data-id="${esc(c.id)}">Ausblenden</button>` : ''}</div>
      ${inDraft ? `<button class="btn small" data-act="accept-draft" data-id="${esc(c.id)}">Übernehmen und ins laufende Training</button><span class="small muted">Eingaben bleiben erhalten. Übungen mit Einträgen, die wegfallen, bleiben im Training als „Nicht mehr im Plan“.</span>` : ''}
    </section>`;
  });
  const mine = DAYS.map(d => s.lastChange[cfg.me + '|' + d]).filter(Boolean);
  const mineHtml = mine.map(c => {
    const same = !sharedDiff(s.plans[other][c.data.day], s.plans[cfg.me][c.data.day]).length;
    return `<div class="sess"><div class="top"><b style="color:var(--fg)">Tag ${c.data.day} · ${esc(c.data.title)}</b><span class="pill ${same ? 'accepted' : 'open'}">${same ? `Bei ${esc(other)} gleich` : `Bei ${esc(other)} offen`}</span></div><div class="small muted">Zuletzt gespeichert ${fmtDate(c.ts)}, ${fmtTime(c.ts)}</div></div>`;
  }).join('');
  return `<p class="muted small" style="margin:0 2px">Hier siehst du, wenn ${esc(other)} gemeinsame Übungen eines Trainingstags geändert hat. Abweichende Übungen und persönliche Werte lösen keine Meldung aus.</p>
    ${items.join('') || `<section class="card"><div class="empty">Keine Unterschiede. Eure gemeinsamen Übungen sind gleich.</div></section>`}
    ${mine.length ? `<div class="sec-title"><h2>Deine Änderungen</h2></div><section class="card">${mineHtml}</section>` : ''}`;
}
function acceptChange(changeId, intoDraft) {
  const s = st(), c = s.changes[changeId]; if (!c) return;
  const merged = mergePlan(s.plans[cfg.me][c.data.day], s.plans[c.person][c.data.day]);
  addEvent('plan_decision', { changeId, decision: 'accepted', result: merged }, `Änderung von ${c.person} an Tag ${c.data.day} übernommen`);
  if (builder && !Object.values(builder.dirty).some(Boolean)) builder = null;
  if (intoDraft && draft && draft.day === c.data.day) { applyToDraft(merged); toast(`Tag ${c.data.day} übernommen, auch ins laufende Training`); location.hash = '#training'; return; }
  toast(`Tag ${c.data.day} übernommen. Gilt ab dem nächsten Training.`);
  render();
}
function dismissChange(changeId) {
  const c = st().changes[changeId]; if (!c) return;
  addEvent('plan_decision', { changeId, decision: 'dismissed' }, `Änderung von ${c.person} an Tag ${c.data.day} ausgeblendet`);
  toast('Ausgeblendet. Du kannst sie später noch übernehmen.');
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
      <div class="n"><b>${esc(x.name)}</b><span class="small muted">${TYPE_LABEL[x.type]} · ${x.sets}×${x.min}–${x.max}${x.type === 'time' ? ' s' : ''}${x.type !== 'time' && x.step ? ` · +${fmtN(x.step)} kg` : ''}</span>
        ${x.personal || x.warmup ? `<span class="tags">${x.personal ? '<span class="tag">Nur ich</span>' : ''}${x.warmup ? '<span class="tag">Aufwärmen</span>' : ''}</span>` : ''}</div>
      <div class="tools"><button class="tool" data-act="bmove" data-i="${i}" data-v="-1" aria-label="Nach oben" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button><button class="tool" data-act="bmove" data-i="${i}" data-v="1" aria-label="Nach unten" ${i === w.exercises.length - 1 ? 'disabled' : ''}>${ICON.down}</button></div>
      <div class="acts"><button data-act="bedit" data-i="${i}">Bearbeiten</button><button data-act="breplace" data-i="${i}">Austauschen</button><button class="del" data-act="bremove" data-i="${i}">Entfernen</button></div>
    </div>`).join('');
  const changes = b.dirty[d] ? diffPlan(st().plans[cfg.me][d], w, false) : [];
  return `${seg}
    <section class="card form">
      <label>Name des Trainingstags<input class="inp" id="b-title" data-b="title" value="${esc(w.title)}" maxlength="40"></label>
    </section>
    <section class="card">${rows || '<div class="empty">Noch keine Übungen an diesem Tag.</div>'}
      <button class="btn ghost" data-act="badd">+ Übung hinzufügen</button></section>
    <p class="small muted" style="margin:0 2px">${esc(other)} bekommt nur Änderungen an gemeinsamen Übungen gemeldet: Übung, Art, Reihenfolge, Sätze, Wiederholungen, Aufwärmsätze. Steigerung, Ausführung und Links sind persönlich. Übungen mit „Nur ich“ lösen nie eine Meldung aus. Austauschen legt eine neue Übung an, der Verlauf der alten bleibt im Archiv.</p>
    ${changes.length ? `<section class="card"><b>Ungespeicherte Änderungen an Tag ${d}</b>${diffList(changes)}</section>` : ''}
    ${b.dirty[d] ? `<div style="height:56px"></div><div class="savebar"><span>Tag ${d} geändert</span><button class="btn ghost" data-act="bdiscard">Verwerfen</button><button class="btn" data-act="bsave">Speichern</button></div>` : ''}`;
}
function markDirty() { builder.dirty[builder.day] = diffPlan(st().plans[cfg.me][builder.day], builder.work[builder.day], false).length > 0; }

function exerciseForm(mode, i) {
  const w = builder.work[builder.day];
  const old = mode === 'add' ? null : w.exercises[i];
  const x = mode === 'edit' ? old : { id: '', name: '', type: old ? old.type : 'kg', sets: old ? old.sets : 3, min: old ? old.min : 8, max: old ? old.max : 12, step: old ? old.step : 2.5, cue: '', video: '', image: '', warmup: false, personal: old ? old.personal : false };
  const title = mode === 'add' ? 'Neue Übung' : mode === 'edit' ? 'Übung bearbeiten' : 'Übung austauschen';
  $('#modal').innerHTML = `<div class="backdrop" data-act="mclose-bg"><form class="sheet form" id="exform" data-mode="${mode}" data-i="${i ?? ''}" novalidate>
    <h2>${title}</h2>
    ${mode === 'replace' ? `<p class="help" style="margin:0">Ersetzt <b>${esc(old.name)}</b>. Deren bisherige Einträge bleiben im Archiv erhalten.</p>` : ''}
    ${mode === 'edit' ? `<p class="help" style="margin:0">Änderungen hier gelten für dieselbe Übung, ihr Verlauf läuft weiter. Für eine andere Übung nutze „Austauschen“.</p>` : ''}
    <label>Name<input class="inp" id="f-name" name="name" value="${esc(x.name)}" maxlength="60" required></label>
    <label>Art<select id="f-type" name="type">${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}${k === 'bw' ? ' (Wdh., optional ± kg)' : k === 'time' ? ' (Sekunden)' : ' (kg + Wdh.)'}</option>`).join('')}</select></label>
    <div class="grid3"><label>Sätze<input class="inp" id="f-sets" name="sets" inputmode="numeric" value="${x.sets}"></label>
      <label><span id="f-unit-min">${x.type === 'time' ? 'Sek. von' : 'Wdh. von'}</span><input class="inp" id="f-min" name="min" inputmode="numeric" value="${x.min}"></label>
      <label>bis<input class="inp" id="f-max" name="max" inputmode="numeric" value="${x.max}"></label></div>
    <label class="chk" id="f-warm-l" ${x.type === 'kg' ? '' : 'hidden'}><input type="checkbox" id="f-warmup" name="warmup" ${x.warmup ? 'checked' : ''}><span>Aufwärmsätze<small>Vor den Arbeitssätzen, automatisch aus dem Arbeitsgewicht berechnet. Wird mit ${esc(partner())} abgeglichen.</small></span></label>
    <label class="chk"><input type="checkbox" id="f-personal" name="personal" ${x.personal ? 'checked' : ''}><span>Abweichende Übung (nur ich)<small>Gehört nicht zum gemeinsamen Training und löst bei ${esc(partner())} nie eine Meldung aus.</small></span></label>
    <div class="persbox"><div class="eyebrow">Persönlich · wird nicht abgeglichen</div>
      <label id="f-step-l" ${x.type === 'time' ? 'hidden' : ''}><span id="f-step-t">${x.type === 'bw' ? 'Steigerung Zusatzgewicht in kg (0 = keine)' : 'Steigerung in kg'}</span><input class="inp" id="f-step" name="step" inputmode="decimal" value="${fmtIn(x.step || 0)}"><span class="help">Wird vorgeschlagen, wenn alle Sätze die obere Wdh.-Zahl erreichen.</span></label>
      <label>Ausführung<textarea id="f-cue" name="cue" rows="3" maxlength="500">${esc(x.cue)}</textarea></label>
      <label>Video-Link (optional)<input class="inp" id="f-video" name="video" type="url" inputmode="url" value="${esc(x.video)}" placeholder="https://www.youtube.com/watch?v=…"><span class="help">Leer lassen: Die App sucht passende Videos auf YouTube.</span></label>
      <label>Bild-Link (optional)<input class="inp" id="f-image" name="image" type="url" inputmode="url" value="${esc(x.image)}" placeholder="https://…/bild.jpg"></label>
    </div>
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
  const data = { name, type, sets, min, max, step: type === 'time' ? 0 : Math.max(0, num(f.get('step'))), cue: String(f.get('cue') || '').trim(), video: url(f.get('video')), image: url(f.get('image')), warmup: type === 'kg' && f.get('warmup') === 'on', personal: f.get('personal') === 'on' };
  if (mode === 'edit') Object.assign(w.exercises[i], data);
  else if (mode === 'add') w.exercises.push({ id: 'u-' + uid().slice(0, 8), ...data });
  else { const old = w.exercises[i]; w.exercises.splice(i, 1, { id: 'u-' + uid().slice(0, 8), replaces: old.id, ...data }); }
  $('#modal').innerHTML = ''; markDirty(); render();
}
function savePlan() {
  const d = builder.day, w = builder.work[d];
  const changes = diffPlan(st().plans[cfg.me][d], w, false);
  if (!changes.length) { builder.dirty[d] = false; render(); return; }
  const notify = sharedDiff(st().plans[cfg.me][d], w).length > 0 && sharedDiff(st().plans[partner()][d], w).length > 0;
  addEvent('plan_change', { day: d, title: w.title, exercises: clone(w.exercises), changes }, `Tag ${d} geändert: ${changes.map(diffText).join('; ')}`);
  builder.dirty[d] = false;
  toast(notify ? `Tag ${d} gespeichert. ${partner()} bekommt einen Hinweis.` : `Tag ${d} gespeichert.`);
  render();
}

/* ---------- Einstellungen & Einrichtung ---------- */
function viewSettings() {
  const waiting = pending.filter(p => !seenIds.has(p.id)).length;
  const sv = scriptVersion == null ? '–' : scriptVersion >= SCRIPT_MIN ? `Version ${scriptVersion} ✓` : `Version ${scriptVersion} – bitte aktualisieren`;
  return `<section class="card form">
      <b>Sync mit Google-Tabelle</b>
      <label>Sync-Adresse<input class="inp" id="s-url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url" autocomplete="off"></label>
      <label>Sync-Schlüssel<input class="inp" id="s-key" value="${esc(cfg.key)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="err" id="s-err" hidden></div>
      <div class="btnrow"><button class="btn primary" data-act="s-save">Speichern & synchronisieren</button></div>
    </section>
    <section class="card"><b>Status</b>
      <dl class="kv"><dt>Ich bin</dt><dd>${esc(cfg.me)}</dd><dt>Letzter Sync</dt><dd>${lastSync ? fmtDate(lastSync) + ', ' + fmtTime(lastSync) : '–'}</dd>
      <dt>Einträge</dt><dd>${events.length} synchronisiert, ${waiting} wartend</dd><dt>App</dt><dd>Version ${APP_VERSION}</dd><dt>Google-Skript</dt><dd>${sv}</dd></dl>
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
const readSetInputs = (i, j) => {
  const s = draft.items[i].sets[j], rIn = document.getElementById(`r-${i}-${j}`), wIn = document.getElementById(`w-${i}-${j}`);
  if (wIn) s.w = wIn.value; if (rIn) s.r = rIn.value; return s;
};
const actions = {
  start: () => startTraining(false),
  'start-normal': () => startTraining(true),
  'skip-ask': () => { skipAsk = true; render(); },
  'skip-no': () => { skipAsk = false; render(); },
  'skip-yes': () => { const d = nextDay(cfg.me); addEvent('skip', { day: d }, `Tag ${d} übersprungen`); skipAsk = false; toast(`Tag ${d} übersprungen`); render(); },
  sync: () => sync({ overlay: true }),
  check: t => {
    const i = +t.dataset.i, j = +t.dataset.j, x = draft.items[i].ex, s = readSetInputs(i, j);
    if (!s.done && x.type === 'kg' && !num(s.w)) { toast('Trag zuerst das Gewicht ein.'); const w = document.getElementById(`w-${i}-${j}`); if (w) w.focus(); return; }
    if (!s.done && !int(s.r)) { const mine = lastAny(cfg.me, x.id); s.r = String(draft.deload ? x.min : mine && mine.type === x.type && mine.sets[j] ? mine.sets[j].r : x.max); }
    s.done = !s.done; saveDraft(); rerenderCard(i);
  },
  sign: t => { const i = +t.dataset.i, s = readSetInputs(i, +t.dataset.j); s.neg = !s.neg; saveDraft(); rerenderCard(i); },
  wu: t => { const it = draft.items[+t.dataset.i], k = +t.dataset.k; it.wu[k] = !it.wu[k]; saveDraft(); rerenderCard(+t.dataset.i); },
  feel: t => { const it = draft.items[+t.dataset.i]; it.feel = it.feel === t.dataset.v ? '' : t.dataset.v; saveDraft(); rerenderCard(+t.dataset.i); },
  'plateau-down': t => {
    const i = +t.dataset.i, it = draft.items[i], pr = progression(it.ex);
    if (pr.base == null) return;
    const w = roundTo(it.ex.type === 'kg' ? pr.base * 0.9 : deloadW(pr.base), stepOf(it.ex));
    it.sets.forEach(s => { if (!s.done) { s.w = w ? fmtIn(w) : ''; s.neg = w < 0; } });
    saveDraft(); rerenderCard(i); toast('Gewicht für heute um 10 % reduziert');
  },
  addset: t => { const it = draft.items[+t.dataset.i]; const l = it.sets[it.sets.length - 1]; it.sets.push({ w: l ? l.w : '', neg: l ? l.neg : false, r: '', done: false }); saveDraft(); rerenderCard(+t.dataset.i); },
  'swap-open': t => swapForm(+t.dataset.i),
  'swap-follow': t => {
    const sw = st().swaps.find(e => e.id === t.dataset.id), i = +t.dataset.i; if (!sw) return;
    doSwap(i, clone(sw.data.to), { id: sw.data.fromId, name: sw.data.fromName }, sw.person, false); render(); toast('Getauscht');
  },
  'swap-ignore': t => { draft.swapIgnored.push(t.dataset.id); saveDraft(); render(); },
  'finish-ask': () => { finishAsk = true; discardAsk = false; render(); setTimeout(() => { const f = $('.finishbar'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30); },
  'finish-no': () => { finishAsk = false; render(); },
  'finish-yes': () => finishTraining(),
  'discard-ask': () => { discardAsk = true; finishAsk = false; render(); },
  'discard-no': () => { discardAsk = false; render(); },
  'discard-yes': () => { draft = null; saveDraft(); discardAsk = false; toast('Training verworfen'); location.hash = '#start'; },
  'bw-save': () => {
    const el = $('#bw-in'), v = num(el && el.value);
    if (v < 30 || v > 300) { toast('Bitte ein Gewicht zwischen 30 und 300 kg eingeben.'); return; }
    addEvent('bodyweight', { kg: Math.round(v * 10) / 10 }, `Körpergewicht ${fmtN(v)} kg`); toast('Körpergewicht gespeichert'); render();
  },
  vtab: t => { verlaufTab = t.dataset.v; render(); },
  calmove: t => { cal.m += +t.dataset.v; if (cal.m < 0) { cal.m = 11; cal.y--; } if (cal.m > 11) { cal.m = 0; cal.y++; } render(); },
  calday: t => { cal.sel = t.dataset.v; render(); },
  nfilter: t => { notesFilter = t.dataset.v; render(); },
  accept: t => acceptChange(t.dataset.id, false),
  'accept-draft': t => acceptChange(t.dataset.id, true),
  dismiss: t => dismissChange(t.dataset.id),
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
document.addEventListener('submit', e => {
  if (e.target.id === 'exform') { e.preventDefault(); submitExercise(e.target); }
  if (e.target.id === 'swapform') { e.preventDefault(); submitSwap(e.target); }
});
let draftTimer;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f && draft) {
    const i = +t.dataset.i, j = +t.dataset.j;
    draft.items[i].sets[j][t.dataset.f] = t.value;
    if (t.dataset.f === 'w') updateWarmups(i);
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300);
  } else if (t.dataset.note != null && draft) {
    draft.items[+t.dataset.note].note = t.value;
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300);
  } else if (t.dataset.b === 'title' && builder) {
    builder.work[builder.day].title = t.value.trimStart();
    const was = builder.dirty[builder.day]; markDirty();
    if (was !== builder.dirty[builder.day]) { const pos = t.selectionStart; render(); const n = $('#b-title'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
  } else if (t.id === 'f-type') {
    $('#f-step-l').hidden = t.value === 'time';
    $('#f-warm-l').hidden = t.value !== 'kg';
    $('#f-step-t').textContent = t.value === 'bw' ? 'Steigerung Zusatzgewicht in kg (0 = keine)' : 'Steigerung in kg';
    $('#f-unit-min').textContent = t.value === 'time' ? 'Sek. von' : 'Wdh. von';
  } else if (t.id === 'sw-name') {
    const k = knownExercises().get(t.value.trim().toLowerCase());
    if (k) { const sel = $('#sw-type'); if (sel) sel.value = k.type; }
  }
});
document.addEventListener('change', e => { if (e.target.id === 'f-type') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
window.addEventListener('hashchange', () => { $('#modal').innerHTML = ''; render(); });

/* ---------- Start der App ---------- */
let hiddenAt = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); if (draft) saveDraft(); return; }
  const away = Date.now() - hiddenAt;
  if (cfg.me && cfg.url && away > 60000) sync({ overlay: away > 5 * 60000 && view !== 'training' });
});
window.addEventListener('online', () => { if (cfg.me && cfg.url) sync({ quiet: true }); });
// Während eines Trainings etwa jede Minute still abgleichen (z. B. für einen Tausch „für uns beide“)
setInterval(() => { if (view === 'training' && draft && cfg.url && document.visibilityState === 'visible' && !syncing) sync({ quiet: true }); }, 60000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; if (draft) saveDraft(); location.reload(); } });
}

try { draft = normalizeDraft(draft); } catch (e) { draft = null; }
render();
if (cfg.me && cfg.url) sync({ overlay: true });
