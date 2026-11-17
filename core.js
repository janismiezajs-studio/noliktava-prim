/* NoliktavaPRIM — domēna loģika (bez DOM). Darbojas pārlūkā (window.PRIMCore) un Node (testiem).
 * Specifikācija: 06_CSV_specifikacija v1.5 (CSV līgums 1.–8. p., lietotnes uzvedība L1–L11). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.PRIMCore = factory(root);
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  const VERSION = '1.1.0';
  const MODE = { INV: 'INV', IZD: 'IZD' };
  const MODE_NAME = { INV: 'Inventarizācija', IZD: 'Izdošana' };
  const ROLE = { ADMIN: 'ADMIN', WORKER: 'DARBINIEKS' };
  const REC = { OK: 'Apstiprināts', EXP: 'Eksportēts' };       // L2
  const SESS = { OPEN: 'Atvērta', DONE: 'Pabeigta' };
  const FILE_PREFIX = { IZD: 'IZDOSANA', INV: 'INVENTARIZACIJA' }; // L4
  const HEAD = {                                                  // 06: 3. un 4. punkts
    IZD: ['RecordID', 'SessionID', 'Noliktava', 'PrecesKods', 'Skaits', 'Izdots', 'KamIzdots', 'Datums', 'Laiks'],
    INV: ['RecordID', 'SessionID', 'Noliktava', 'PrecesKods', 'Skaits', 'Parskaitits', 'Datums', 'Laiks'],
  };
  const BOM = '﻿';

  class PrimError extends Error {
    constructor(code, message, extra) { super(message); this.code = code; this.extra = extra || null; }
  }

  // ------------------------------------------------------------ palīgfunkcijas
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  function nowParts(d) {
    d = d || new Date();
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      stamp: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    };
  }
  function randHex(bytes) {
    const a = new Uint8Array(bytes);
    root.crypto.getRandomValues(a);
    return Array.from(a, b => pad(b.toString(16))).join('');
  }
  function uuid() {                                               // L1: unikāls RecordID
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    const h = randHex(16).split('');
    h[12] = '4'; h[16] = '89ab'[parseInt(h[16], 16) & 3];
    const s = h.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  function newSessionId(d) {
    const p = nowParts(d);
    return `S${p.stamp.replace('_', 'T')}-${randHex(2)}`;
  }

  /** Preces/noliktavas kods tiek saglabāts kā teksts bez izmaiņām (L5): tikai trim + vadības rakstzīmju noņemšana. */
  function normCode(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  }

  /** Skaits: Izdošanā > 0, Inventarizācijā ≥ 0; "," vai "." (06, 1. punkts). Līdz 3 zīmēm aiz komata (pieņēmums v1). */
  function parseQty(input, mode) {
    const s = String(input == null ? '' : input).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(s)) {
      throw new PrimError('SKAITS_NEDERIGS', 'Skaits nav derīgs. Ievadiet skaitli (piem. 12 vai 36,5).');
    }
    const n = Number(s);
    if (!isFinite(n) || n > 1e9) throw new PrimError('SKAITS_NEDERIGS', 'Skaits nav derīgs.');
    if (mode === MODE.IZD && n <= 0) throw new PrimError('SKAITS_NULLE', 'Izdošanā skaitam jābūt lielākam par 0.');
    return n;
  }

  /** Saraksta normalizācija: katra rinda = viena vērtība (pirmā šūna, ja iekopēts no Excel/CSV), bez dublikātiem. */
  function normList(input) {
    const lines = Array.isArray(input) ? input : String(input || '').split(/\r\n|\r|\n/);
    const out = [], seen = new Set();
    for (const line of lines) {
      const v = normCode(String(line).split(/[;\t]/)[0]);
      if (v && !seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }
  function matchList(list, text) {
    const t = normCode(text);
    if (!t) return null;
    if (list.includes(t)) return t;
    const low = t.toLowerCase();
    return list.find(x => x.toLowerCase() === low) || null;
  }

  /** Teksts rādīšanai (nosaukums, mērvienība): vadības rakstzīmes → atstarpe, lieki tukšumi noņemti. */
  function cleanText(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 120);
  }
  /** Viena rinda → šūnas. Pēdiņas tiek ņemtas vērā tikai šūnas sākumā ("..." ar "" iekšā, kā Excel CSV); pēdiņa vārda vidū
   *  (piem. 1/4" ) ir parasta rakstzīme. */
  function splitCells(line, d) {
    const out = []; const n = line.length; let i = 0;
    for (;;) {
      if (line[i] === '"') {
        let j = i + 1, s = '';
        for (; j < n; j++) {
          if (line[j] === '"') { if (line[j + 1] === '"') { s += '"'; j++; } else break; } else s += line[j];
        }
        if (j < n && (j + 1 === n || line[j + 1] === d)) {
          out.push(s);
          if (j + 1 === n) break;
          i = j + 2; continue;
        }
      }
      const k = line.indexOf(d, i);
      if (k < 0) { out.push(line.slice(i)); break; }
      out.push(line.slice(i, k)); i = k + 1;
    }
    return out;
  }
  /** Preču saraksts: rindas "kods;nosaukums;mērvienība" (nosaukums un mērvienība neobligāti; atdalītājs ; vai TAB vai ,).
   *  Atgriež { codes, info: {kods: {n, u}}, lines } — kodi bez dublikātiem (pirmais uzvar), galvenes rinda tiek izlaista. */
  function parseProducts(input) {
    const text = Array.isArray(input) ? input.join('\n') : String(input == null ? '' : input).replace(/^\uFEFF/, '');
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim() !== '');
    const first = lines[0] || '';
    const d = first.includes(';') ? ';' : first.includes('\t') ? '\t' : first.includes(',') ? ',' : ';';
    const codes = [], info = {}, seen = new Set();
    for (const line of lines) {
      const cells = splitCells(line, d);
      const code = normCode(cells[0]);
      if (!code || seen.has(code)) continue;
      if (/^(kods|artikuls|preces\s*kods|itemcode|item\s*code|code)$/i.test(code) && !seen.size && !codes.length) continue;
      seen.add(code); codes.push(code);
      const n = cleanText(cells[1], 120), u = cleanText(cells[2], 20);
      if (n || u) info[code] = { n, u };
    }
    return { codes, info, lines: codes.map(c => productLine(c, info[c])) };
  }
  /** Saraksta rinda rediģēšanai/saglabāšanai: kods vai kods;nosaukums;mērvienība (";" nosaukumā aizstāts ar ","). */
  function productLine(code, inf) {
    if (!inf || (!inf.n && !inf.u)) return code;
    return code + ';' + String(inf.n || '').replace(/;/g, ',') + (inf.u ? ';' + String(inf.u).replace(/;/g, ',') : '');
  }

  // ------------------------------------------------------------ CSV
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function recordToRow(mode, r) {
    const base = [r.RecordID, r.SessionID, r.Noliktava, r.PrecesKods, String(r.Skaits)];
    return mode === MODE.IZD
      ? base.concat(['Jā', r.KamIzdots, r.Datums, r.Laiks])
      : base.concat(['Jā', r.Datums, r.Laiks]);
  }
  /** Veido CSV tekstu (UTF-8 ar BOM, ";" atdalītājs, CRLF). Ieraksti sakārtoti pēc datuma/laika/secības. */
  function buildCsv(mode, records) {
    const sorted = records.slice().sort((a, b) =>
      (a.Datums + a.Laiks).localeCompare(b.Datums + b.Laiks) || (a.Seq - b.Seq));
    const lines = [HEAD[mode].join(';')].concat(sorted.map(r => recordToRow(mode, r).map(csvCell).join(';')));
    return BOM + lines.join('\r\n') + '\r\n';
  }
  /** Vienkāršs CSV parseris (RFC 4180, ";") — testiem un rezerves kopijai. */
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ';') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // ------------------------------------------------------------ PIN (Admin)
  async function sha256Hex(s) {
    const buf = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), b => pad(b.toString(16))).join('');
  }

  // ------------------------------------------------------------ lietotnes kodols
  function createApp(storage, opts) {
    opts = opts || {};
    const clock = opts.clock || (() => new Date());
    const requireAdmin = role => {
      if (role !== ROLE.ADMIN) throw new PrimError('NAV_ADMIN', 'Šo darbību drīkst veikt tikai Admins.');   // L6, L11
    };

    async function nextSeq() {
      const kv = await storage.get('kv', 'seq');
      const n = (kv ? kv.v : 0) + 1;
      await storage.put('kv', { k: 'seq', v: n });
      return n;
    }

    // ---------- iestatījumi
    async function getSettings() {
      const kv = await storage.get('kv', 'settings');
      return Object.assign({ warehouses: [], recipients: [], products: [], productInfo: {}, pinHash: null, pinSalt: null }, kv ? kv.v : {});
    }
    async function saveSettings(patch, role) {
      requireAdmin(role);
      const cur = await getSettings();
      for (const k of ['warehouses', 'recipients']) if (k in patch) cur[k] = normList(patch[k]);
      if ('products' in patch) { const pp = parseProducts(patch.products); cur.products = pp.codes; cur.productInfo = pp.info; }
      await storage.put('kv', { k: 'settings', v: cur });
      return cur;
    }
    async function hasPin() { return !!(await getSettings()).pinHash; }
    async function verifyPin(pin) {
      const s = await getSettings();
      if (!s.pinHash) return false;
      return (await sha256Hex(s.pinSalt + ':' + pin)) === s.pinHash;
    }
    /** Pirmā PIN uzstādīšana (bez pašreizējā) vai maiņa (ar pašreizējo). */
    async function setPin(newPin, currentPin) {
      if (!/^\d{4,8}$/.test(String(newPin))) throw new PrimError('PIN_NEDERIGS', 'PIN jābūt 4–8 cipariem.');
      const s = await getSettings();
      if (s.pinHash && !(await verifyPin(currentPin))) throw new PrimError('PIN_KLUDA', 'Nepareizs pašreizējais PIN.');
      s.pinSalt = randHex(8);
      s.pinHash = await sha256Hex(s.pinSalt + ':' + newPin);
      await storage.put('kv', { k: 'settings', v: s });
    }

    // ---------- sesijas
    async function startSession(mode, warehouseInput) {
      if (!MODE[mode]) throw new PrimError('MODULIS_NEDERIGS', 'Nezināms modulis.');
      const st = await getSettings();
      if (!st.warehouses.length) {
        throw new PrimError('NOLIKTAVU_SARAKSTS_TUKSS', 'Noliktavu saraksts ir tukšs. Admins to ievada sadaļā Iestatījumi.');
      }
      const wh = matchList(st.warehouses, warehouseInput);
      if (!wh) {
        throw new PrimError('NOLIKTAVA_NAV_SARAKSTA', `Kods "${normCode(warehouseInput)}" nav noliktavu sarakstā.`);   // L9
      }
      const p = nowParts(clock());
      const sess = { SessionID: newSessionId(clock()), Modulis: mode, Noliktava: wh, Statuss: SESS.OPEN,
                     Sakts: `${p.date} ${p.time}`, Beigts: null, DefaultKam: '' };
      await storage.put('sessions', sess);
      return sess;
    }
    const getSession = id => storage.get('sessions', id);
    async function completeSession(id) {
      const s = await getSession(id);
      if (!s) throw new PrimError('SESIJA_NAV', 'Sesija nav atrasta.');
      if (s.Statuss === SESS.DONE) return s;
      const p = nowParts(clock());
      s.Statuss = SESS.DONE; s.Beigts = `${p.date} ${p.time}`;
      await storage.put('sessions', s);
      return s;
    }
    async function listSessions(f) {
      f = f || {};
      return (await storage.getAll('sessions'))
        .filter(s => (!f.status || s.Statuss === f.status) && (!f.mode || s.Modulis === f.mode))
        .sort((a, b) => b.Sakts.localeCompare(a.Sakts));
    }

    // ---------- ieraksti
    async function listRecords(f) {
      f = f || {};
      return (await storage.getAll('records'))
        .filter(r => (!f.mode || r.Modulis === f.mode) && (!f.status || r.Statuss === f.status) &&
                     (!f.sessionId || r.SessionID === f.sessionId))
        .sort((a, b) => b.Seq - a.Seq);
    }
    const getRecord = id => storage.get('records', id);

    function checkRecipient(st, name) {
      const kam = matchList(st.recipients, name);
      if (!kam) throw new PrimError('SANEMEJS_NAV_SARAKSTA', 'Saņēmējs jāizvēlas no saraksta.');             // L9
      return kam;
    }

    /** APSTIPRINĀT: izveido ierakstu ar jaunu RecordID (L1). Inventarizācijā viena prece + viena sesija = viens ieraksts (L7). */
    async function addRecord(sessionId, input) {
      const sess = await getSession(sessionId);
      if (!sess) throw new PrimError('SESIJA_NAV', 'Sesija nav atrasta.');
      if (sess.Statuss !== SESS.OPEN) throw new PrimError('SESIJA_PABEIGTA', 'Sesija ir pabeigta — ierakstus pievienot vairs nevar.');
      const st = await getSettings();
      if (!matchList(st.warehouses, sess.Noliktava)) {
        throw new PrimError('NOLIKTAVA_NAV_SARAKSTA', `Noliktava "${sess.Noliktava}" vairs nav sarakstā.`);
      }
      const code = normCode(input.code);
      if (!code) throw new PrimError('KODS_TUKSS', 'Preces kods ir tukšs.');
      const qty = parseQty(input.qty, sess.Modulis);
      let kam = '';
      if (sess.Modulis === MODE.IZD) kam = checkRecipient(st, input.recipient);
      if (sess.Modulis === MODE.INV) {
        const dup = (await listRecords({ sessionId })).find(r => r.PrecesKods === code);
        if (dup) throw new PrimError('JAU_PARSKAITITS', 'JAU PĀRSKAITĪTS', { existing: dup });
      }
      const p = nowParts(clock());
      const rec = {
        RecordID: uuid(), SessionID: sess.SessionID, Modulis: sess.Modulis, Noliktava: sess.Noliktava,
        PrecesKods: code, Nosaukums: ((st.productInfo || {})[code] || {}).n || '', Skaits: qty, KamIzdots: kam, Datums: p.date, Laiks: p.time,
        Statuss: REC.OK, Neatpazita: st.products.length > 0 && !st.products.includes(code),
        Seq: await nextSeq(), Labots: false, ExportId: null,
      };
      await storage.put('records', rec);
      if (sess.Modulis === MODE.IZD && sess.DefaultKam !== kam) { sess.DefaultKam = kam; await storage.put('sessions', sess); }
      return rec;
    }

    /** LABOT: tikai Admins (L6) un tikai pirms eksporta (L2). RecordID nemainās (L1). */
    async function editRecord(recordId, input, role) {
      requireAdmin(role);
      const rec = await getRecord(recordId);
      if (!rec) throw new PrimError('IERAKSTS_NAV', 'Ieraksts nav atrasts.');
      if (rec.Statuss === REC.EXP) throw new PrimError('EKSPORTETS_NELABO', 'Eksportētu ierakstu labot nedrīkst.');
      const upd = Object.assign({}, rec);
      if ('qty' in input) upd.Skaits = parseQty(input.qty, rec.Modulis);
      if (rec.Modulis === MODE.IZD && 'recipient' in input) upd.KamIzdots = checkRecipient(await getSettings(), input.recipient);
      upd.Labots = true;
      await storage.put('records', upd);
      return upd;
    }

    // ---------- eksports (L2, L3, L4)
    async function summary() {
      const recs = await storage.getAll('records');
      const out = { IZD: { new: 0, exp: 0 }, INV: { new: 0, exp: 0 }, openInv: 0, openAny: 0 };
      for (const r of recs) out[r.Modulis][r.Statuss === REC.EXP ? 'exp' : 'new']++;
      for (const s of await listSessions({ status: SESS.OPEN })) { out.openAny++; if (s.Modulis === MODE.INV) out.openInv++; }
      return out;
    }
    /** Eksportē VISUS vēl neeksportētos ierakstus, atsevišķi Izdošanai un Inventarizācijai; ieraksti kļūst par "Eksportēts". */
    async function exportUnexported() {
      const fresh = await listRecords({ status: REC.OK });
      const p = nowParts(clock());
      const batches = [];
      for (const mode of [MODE.IZD, MODE.INV]) {
        const recs = fresh.filter(r => r.Modulis === mode);
        if (!recs.length) continue;
        const batch = {
          id: `E${p.stamp}-${mode}`, mode, fileName: `${FILE_PREFIX[mode]}_${p.stamp}.csv`,
          csv: buildCsv(mode, recs), count: recs.length, recordIds: recs.map(r => r.RecordID),
          created: `${p.date} ${p.time}`,
        };
        await storage.put('exports', batch);
        for (const r of recs) await storage.put('records', Object.assign({}, r, { Statuss: REC.EXP, ExportId: batch.id }));
        batches.push(batch);
      }
      return batches;
    }
    async function listExports() { return (await storage.getAll('exports')).sort((a, b) => b.id.localeCompare(a.id)); }
    const getExport = id => storage.get('exports', id);

    // ---------- rezerves kopija (JSON)
    async function backup() {
      const st = await getSettings();
      return {
        format: 'NoliktavaPRIM-backup', version: VERSION, created: nowParts(clock()).date + ' ' + nowParts(clock()).time,
        settings: { warehouses: st.warehouses, recipients: st.recipients, products: st.products, productInfo: st.productInfo },
        sessions: await storage.getAll('sessions'), records: await storage.getAll('records'),
        exports: await storage.getAll('exports'),
      };
    }
    /** Atjaunošana tikai pievieno trūkstošo (pēc atslēgas); esošos datus nepārraksta. */
    async function restore(data, role) {
      requireAdmin(role);
      if (!data || data.format !== 'NoliktavaPRIM-backup') throw new PrimError('BACKUP_NEDERIGS', 'Fails nav NoliktavaPRIM rezerves kopija.');
      const n = { sessions: 0, records: 0, exports: 0 };
      let maxSeq = 0;
      for (const [store, key, name] of [['sessions', 'SessionID', 'sessions'], ['records', 'RecordID', 'records'], ['exports', 'id', 'exports']]) {
        for (const o of data[name] || []) {
          if (!(await storage.get(store, o[key]))) { await storage.put(store, o); n[name]++; }
          if (store === 'records') maxSeq = Math.max(maxSeq, o.Seq || 0);
        }
      }
      const kv = await storage.get('kv', 'seq');
      if (maxSeq > (kv ? kv.v : 0)) await storage.put('kv', { k: 'seq', v: maxSeq });
      const st = await getSettings();
      const patch = {};
      for (const k of ['warehouses', 'recipients', 'products']) if (!st[k].length && data.settings && data.settings[k]) patch[k] = data.settings[k];
      if (patch.products) { const inf = (data.settings && data.settings.productInfo) || {}; patch.products = patch.products.map(c => productLine(c, inf[c])); }
      if (Object.keys(patch).length) await saveSettings(patch, role);
      return n;
    }

    return { getSettings, saveSettings, hasPin, verifyPin, setPin, startSession, getSession, completeSession, listSessions,
             listRecords, getRecord, addRecord, editRecord, summary, exportUnexported, listExports, getExport, backup, restore };
  }

  /** Atmiņas glabātuve (testiem). Tāds pats interfeiss kā IndexedDB ietinumam app.js. */
  function memoryStorage() {
    const data = { records: new Map(), sessions: new Map(), exports: new Map(), kv: new Map() };
    const keyOf = { records: 'RecordID', sessions: 'SessionID', exports: 'id', kv: 'k' };
    const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
    return {
      async get(s, k) { return clone(data[s].get(k)); },
      async put(s, o) { data[s].set(o[keyOf[s]], clone(o)); },
      async getAll(s) { return Array.from(data[s].values(), clone); },
    };
  }

  return { VERSION, MODE, MODE_NAME, ROLE, REC, SESS, HEAD, FILE_PREFIX, PrimError, nowParts, uuid, newSessionId, normCode,
           parseQty, normList, matchList, cleanText, splitCells, parseProducts, productLine, csvCell, buildCsv, parseCsv, createApp, memoryStorage };
});
