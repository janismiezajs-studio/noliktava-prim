/* NoliktavaPRIM — lietotnes saskarne (iPhone Safari PWA, bezsaistē). Loģika: core.js */
(function () {
  'use strict';
  const C = window.PRIMCore;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAdmin = () => S.role === C.ROLE.ADMIN;
  const newCap = () => ({ code: '', name: '', unit: '', flagged: false, existing: null, editId: null, qtyPrefill: '' });
  const S = { role: C.ROLE.WORKER, screen: 'home', mode: null, sid: null, cap: newCap(),
              flt: { mod: 'ALL', st: 'ALL' }, recId: null, hideBanner: false, persisted: null, busy: false, loadTarget: null };
  let core;

  // ------------------------------------------------------------ IndexedDB (L10: dati lokāli, bezsaistē)
  function openDB() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB nav pieejams'));
      const rq = indexedDB.open('noliktavaprim', 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        db.createObjectStore('records', { keyPath: 'RecordID' });
        db.createObjectStore('sessions', { keyPath: 'SessionID' });
        db.createObjectStore('exports', { keyPath: 'id' });
        db.createObjectStore('kv', { keyPath: 'k' });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  function idbStorage(db) {
    const run = (store, mode, fn) => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const rq = fn(t.objectStore(store));
      t.oncomplete = () => res(rq ? rq.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
    return {
      get: (s, k) => run(s, 'readonly', os => os.get(k)),
      put: (s, o) => run(s, 'readwrite', os => os.put(o)),
      getAll: s => run(s, 'readonly', os => os.getAll()),
      clear: s => run(s, 'readwrite', os => os.clear()),
    };
  }

  // ------------------------------------------------------------ palīgi
  const fmtD = d => (d && d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d || '');
  const fmtDT = s => (s ? `${fmtD(s.slice(0, 10))} ${s.slice(11, 16)}` : '');
  const qtyTxt = n => String(n).replace('.', ',');
  const nIer = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'ieraksts' : 'ieraksti'}`;
  let toastTimer;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = ''; }, ms || 2600);
  }
  let audioCtx;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; g.gain.value = 0.12; o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.09);
    } catch (e) { /* skaņa nav obligāta */ }
  }
  function modal(o) {
    return new Promise(res => {
      const m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = `<div class="box"><h3>${esc(o.title)}</h3>${o.html || ''}<div class="row" style="margin-top:14px;justify-content:flex-end">` +
        o.buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('') + '</div></div>';
      document.body.appendChild(m);
      const first = m.querySelector('input'); if (first) setTimeout(() => first.focus(), 60);
      m.addEventListener('click', e => {
        const b = e.target.closest('button[data-i]'); if (!b) return;
        const vals = Array.from(m.querySelectorAll('input')).map(i => i.value);
        m.remove(); res({ btn: o.buttons[+b.dataset.i].id, vals });
      });
    });
  }
  const confirmBox = (title, text, okLabel) => modal({ title, html: `<p>${esc(text)}</p>`,
    buttons: [{ id: 'x', label: 'Atcelt' }, { id: 'ok', label: okLabel || 'Jā', cls: 'pri' }] }).then(r => r.btn === 'ok');

  async function shareFile(name, text, type) {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ------------------------------------------------------------ svītrkodu skeneris (kamera, bezsaistē)
  let zxP;
  function loadZXing() {
    if (window.ZXing) return Promise.resolve();
    if (!zxP) zxP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'zxing.min.js'; s.onload = res;
      s.onerror = () => { zxP = null; rej(new Error('Skenēšanas bibliotēka nav ielādēta')); };
      document.head.appendChild(s);
    });
    return zxP;
  }
  function scan(title) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div><div class="bar"><div class="grow">${esc(title)}</div><button class="btn" id="scX">Aizvērt</button></div>`;
      document.body.appendChild(ov);
      let reader = null, done = false;
      const finish = val => { if (done) return; done = true; try { if (reader) reader.reset(); } catch (e) { /* */ } ov.remove(); resolve(val); };
      ov.querySelector('#scX').onclick = () => finish(null);
      (async () => {
        try {
          await loadZXing();
          const Z = window.ZXing, F = Z.BarcodeFormat, hints = new Map();
          hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX]);
          // TRY_HARDER netiek lietots: testā ar EAN-13 tas samazināja kadru ātrumu un traucēja nolasīšanai
          reader = new Z.BrowserMultiFormatReader(hints, 250);
          await reader.decodeFromConstraints(
            { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            ov.querySelector('video'),
            result => { if (result) { beep(); finish(result.getText()); } });
        } catch (e) {
          finish(null);
          toast(e && e.name === 'NotAllowedError' ? 'Kamera nav atļauta: Iestatījumi → Safari → Kamera' : 'Kamera nav pieejama: ' + (e && e.message), 5000);
        }
      })();
    });
  }

  // ------------------------------------------------------------ ekrāni
  const TITLES = { home: 'NoliktavaPRIM', start: 'Sesijas sākums', recipient: 'Saņēmējs', capture: '', records: 'Ieraksti', exchange: 'Datu apmaiņa', settings: 'Iestatījumi' };
  function header() {
    let t = TITLES[S.screen];
    if ((S.screen === 'start' || S.screen === 'recipient' || S.screen === 'capture') && S.mode) t = C.MODE_NAME[S.mode];
    const back = S.screen !== 'home' ? '<button class="back" data-act="home">‹ Sākums</button>' : '';
    return `<header>${back}<h1>${esc(t)}</h1><button class="chip ${isAdmin() ? 'admin' : ''}" data-act="role">${isAdmin() ? 'Admins' : 'Darbinieks'}</button></header>`;
  }
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);

  async function screenHome() {
    const sum = await core.summary();
    const open = await core.listSessions({ status: C.SESS.OPEN });
    let h = '';
    if (isIOS() && !isStandalone() && !S.hideBanner) {
      h += '<div class="alert info">Lai lietotne darbotos bez interneta un dati netiktu dzēsti: Safari → Kopīgot → <b>Pievienot sākuma ekrānam</b>, un atveriet no ikonas. <button class="btn" data-act="hideBanner" style="margin-top:8px">Sapratu</button></div>';
    }
    if (open.length) {
      const rows = await Promise.all(open.map(async s => {
        const n = (await core.listRecords({ sessionId: s.SessionID })).length;
        return `<div class="rec row"><div class="grow"><b>${esc(C.MODE_NAME[s.Modulis])}</b> · ${esc(s.Noliktava)}${s.Kam ? ' → ' + esc(s.Kam) : ''}<div class="mut">${nIer(n)} · sākta ${esc(fmtDT(s.Sakts))}</div></div><button class="btn pri" data-act="resume" data-id="${esc(s.SessionID)}">Turpināt</button></div>`;
      }));
      h += `<div class="card"><h2>Atvērtās sesijas</h2>${rows.join('')}</div>`;
    }
    h += '<div class="grid"><button class="big" data-act="start" data-mode="INV">Inventarizācija</button><button class="big" data-act="start" data-mode="IZD">Izdošana</button></div>';
    h += '<div style="height:12px"></div><button class="big sec" data-act="nav" data-to="records">Ieraksti</button>';
    if (isAdmin()) {
      h += '<div style="height:12px"></div><div class="grid"><button class="big sec" data-act="nav" data-to="exchange">Datu apmaiņa</button><button class="big sec" data-act="nav" data-to="settings">Iestatījumi</button></div>';
    }
    h += `<div class="card" style="margin-top:14px"><div class="kv"><span>Neeksportēti: Izdošana</span><b>${sum.IZD.new}</b></div><div class="kv"><span>Neeksportēti: Inventarizācija</span><b>${sum.INV.new}</b></div></div>`;
    return h;
  }

  async function screenStart() {
    const st = await core.getSettings();
    if (!st.warehouses.length) {
      return `<div class="alert err">Noliktavu saraksts ir tukšs. ${isAdmin()
        ? '<button class="btn pri" data-act="nav" data-to="settings" style="margin-top:8px">Atvērt Iestatījumus</button>'
        : 'Lūdziet Adminam to ievadīt sadaļā Iestatījumi.'}</div>`;
    }
    return `<div class="card"><h2>1. solis — noliktavas kods</h2><p class="mut">Pirmais skenējums vienmēr ir noliktavas kods.</p>
      <button class="big" data-act="scanWh">Skenēt noliktavas kodu</button>
      <label for="whIn">vai ievadiet kodu</label>
      <div class="row"><input class="grow" id="whIn" type="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" data-enter="typeWh" placeholder="Noliktavas kods"><button class="btn pri" data-act="typeWh">OK</button></div>
      <label>vai izvēlieties no saraksta</label>
      <div class="wh">${st.warehouses.map(w => `<button class="btn" data-act="pickWh" data-wh="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>`;
  }

  async function screenRecipient() {
    if (!S.pendingWh) return screenStart();
    const st = await core.getSettings();
    return `<div class="card"><div class="kv"><span>Noliktava</span><b>${esc(S.pendingWh)}</b></div></div>
      <div class="card"><h2>2. solis — saņēmējs</h2><p class="mut">Saņēmējs attiecas uz visu šo izdošanu (vienu aktu). Citam saņēmējam pabeidziet izdošanu un sāciet jaunu.</p>
      <div class="wh">${st.recipients.map(r => `<button class="btn" data-act="pickRcp" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>`;
  }

  async function screenCapture() {
    const sess = await core.getSession(S.sid);
    if (!sess) { S.screen = 'home'; return screenHome(); }
    const st = await core.getSettings();
    const recs = await core.listRecords({ sessionId: sess.SessionID });
    const done = sess.Statuss === C.SESS.DONE, inv = sess.Modulis === C.MODE.INV, cap = S.cap;
    let h = `<div class="card"><div class="kv"><span>Noliktava</span><b>${esc(sess.Noliktava)}</b></div>${sess.Kam ? `<div class="kv"><span>Saņēmējs</span><b>${esc(sess.Kam)}</b></div>` : ''}<div class="kv"><span>Ieraksti sesijā</span><b>${recs.length}</b></div>${done ? '<div class="kv"><span>Statuss</span><span class="pill">Pabeigta</span></div>' : ''}</div>`;
    if (!done) {
      if (!cap.code) {
        h += `<div class="card"><h2>Preces kods</h2><button class="big" data-act="scanProd">Skenēt preci</button>
          <label for="codeIn">vai ievadiet kodu</label>
          <div class="row"><input class="grow" id="codeIn" type="text" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" data-enter="typeCode" placeholder="Preces kods"><button class="btn pri" data-act="typeCode">OK</button></div></div>`;
      } else {
        const ex = cap.existing;
        h += `<div class="card"><div class="row"><div class="grow"><div class="mut">Preces kods</div><div class="code">${esc(cap.code)}</div>${cap.name ? `<div class="pname">${esc(cap.name)}</div>` : (!st.products.length ? '<div class="mut">Preču saraksts nav ielādēts — nosaukums netiek rādīts.</div>' : '')}</div><button class="btn" data-act="clearCode">Mainīt</button></div>`;
        if (cap.flagged) h += '<div class="alert warn"><b>NEATPAZĪTA PRECE</b> — kods nav preču kodu sarakstā. Ieraksts tiks saglabāts, pārbaude notiks importā.</div>';
        if (ex && !cap.editId) {
          h += `<div class="alert warn"><b>JAU PĀRSKAITĪTS</b><br>Šajā sesijā šai precei jau ir ieraksts: <b>${esc(qtyTxt(ex.Skaits))}</b> (${esc(fmtDT(ex.Datums + ' ' + ex.Laiks))}).`;
          if (ex.Statuss === C.REC.EXP) h += '<br>Ieraksts jau eksportēts — labot nedrīkst. Pārskaitīšanai izveidojiet jaunu inventarizācijas sesiju.';
          h += `<div class="row" style="margin-top:10px"><button class="btn" data-act="contExisting">Turpināt (nākamā prece)</button>`;
          if (ex.Statuss !== C.REC.EXP) h += isAdmin() ? '<button class="btn pri" data-act="editExisting">Labot</button>' : '<span class="mut">Labot var tikai Admins</span>';
          h += '</div></div></div>';
        } else {
          if (cap.editId) h += '<div class="alert info">Labošana: tiks mainīts esošā ieraksta skaits (RecordID nemainās).</div>';
          h += `<label for="qty">Skaits${cap.unit ? ' (' + esc(cap.unit) + ')' : ''}</label><input id="qty" type="text" inputmode="decimal" autocomplete="off" data-enter="confirm" value="${esc(cap.qtyPrefill)}" placeholder="${inv ? 'noskaitītais skaits' : 'izdodamais skaits'}">`;
          if (!inv && !sess.Kam) {
            if (!st.recipients.length) h += '<div class="alert err">Saņēmēju saraksts ir tukšs — Admins to ievada Iestatījumos.</div>';
            h += `<label for="rcp">Saņēmējs</label><select id="rcp"><option value="">— izvēlieties —</option>${st.recipients.map(r => `<option value="${esc(r)}" ${r === sess.DefaultKam ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
          }
          h += '<div id="capErr"></div><div style="height:12px"></div><button class="big ok" id="okBtn" data-act="confirm" disabled>APSTIPRINĀT</button></div>';
        }
      }
    }
    if (recs.length) {
      h += '<div class="card"><h2>Pēdējie ieraksti</h2>' + recs.slice(0, 5).map(r =>
        `<div class="rec"><div class="row"><div class="grow code" style="font-size:16px">${esc(r.PrecesKods)}</div><b>${esc(qtyTxt(r.Skaits))}</b></div>${r.Nosaukums ? `<div class="pname sm">${esc(r.Nosaukums)}</div>` : ''}<div class="mut">${esc(r.KamIzdots ? r.KamIzdots + ' · ' : '')}${esc(r.Laiks)} ${r.Neatpazita ? '<span class="pill warn">neatpazīta</span>' : ''}${r.Statuss === C.REC.EXP ? '<span class="pill exp">eksportēts</span>' : ''}</div></div>`).join('') + '</div>';
    }
    h += done ? '' : '<button class="btn dng" data-act="finish" style="width:100%;margin-top:4px">Pabeigt sesiju</button>';
    return h;
  }

  async function screenRecords() {
    if (S.recId) return screenRecDetail();
    let recs = await core.listRecords({});
    if (S.flt.mod !== 'ALL') recs = recs.filter(r => r.Modulis === S.flt.mod);
    if (S.flt.st !== 'ALL') recs = recs.filter(r => r.Statuss === S.flt.st);
    const chip = (grp, val, label) => `<button class="chip ${S.flt[grp] === val ? 'on' : ''}" data-act="flt" data-grp="${grp}" data-val="${val}">${label}</button>`;
    let h = `<div class="chips">${chip('mod', 'ALL', 'Visi')}${chip('mod', 'INV', 'Inventarizācija')}${chip('mod', 'IZD', 'Izdošana')}</div>
      <div class="chips">${chip('st', 'ALL', 'Visi statusi')}${chip('st', C.REC.OK, 'Apstiprināts')}${chip('st', C.REC.EXP, 'Eksportēts')}</div>`;
    if (!recs.length) return h + '<div class="card mut">Nav ierakstu.</div>';
    h += `<div class="card">${recs.slice(0, 200).map(r =>
      `<div class="rec" data-act="openRec" data-id="${esc(r.RecordID)}"><div class="row"><div class="grow code" style="font-size:17px">${esc(r.PrecesKods)}</div><b style="font-size:20px">${esc(qtyTxt(r.Skaits))}</b></div>
       ${r.Nosaukums ? `<div class="pname sm">${esc(r.Nosaukums)}</div>` : ''}<div class="mut">${esc(C.MODE_NAME[r.Modulis])} · ${esc(r.Noliktava)}${r.KamIzdots ? ' · ' + esc(r.KamIzdots) : ''} · ${esc(fmtD(r.Datums))} ${esc(r.Laiks)}</div>
       <span class="pill ${r.Statuss === C.REC.EXP ? 'exp' : ''}">${esc(r.Statuss)}</span> ${r.Neatpazita ? '<span class="pill warn">neatpazīta</span>' : ''} ${r.Labots ? '<span class="pill warn">labots</span>' : ''}</div>`).join('')}</div>`;
    if (recs.length > 200) h += '<div class="mut">Rādīti jaunākie 200 ieraksti.</div>';
    return h;
  }
  async function screenRecDetail() {
    const r = await core.getRecord(S.recId);
    if (!r) { S.recId = null; return screenRecords(); }
    const st = await core.getSettings();
    const exp = r.Statuss === C.REC.EXP;
    let h = '<button class="btn" data-act="closeRec" style="margin-bottom:12px">‹ Atpakaļ uz sarakstu</button>';
    h += `<div class="card"><div class="mut">Preces kods</div><div class="code">${esc(r.PrecesKods)}</div>${r.Nosaukums ? `<div class="pname">${esc(r.Nosaukums)}</div>` : ''}<div class="qty">${esc(qtyTxt(r.Skaits))}</div>
      <div class="kv"><span>Modulis</span><span>${esc(C.MODE_NAME[r.Modulis])}</span></div>
      <div class="kv"><span>Noliktava</span><span>${esc(r.Noliktava)}</span></div>
      ${r.KamIzdots ? `<div class="kv"><span>Saņēmējs</span><span>${esc(r.KamIzdots)}</span></div>` : ''}
      <div class="kv"><span>Datums / laiks</span><span>${esc(fmtD(r.Datums))} ${esc(r.Laiks)}</span></div>
      <div class="kv"><span>Statuss</span><span class="pill ${exp ? 'exp' : ''}">${esc(r.Statuss)}</span></div>
      <div class="kv"><span>RecordID</span><span class="mut" style="word-break:break-all">${esc(r.RecordID)}</span></div></div>`;
    if (exp) h += '<div class="alert info">Eksportētu ierakstu labot nedrīkst. Inventarizācijā nepareizu skaitu labo ar jaunu skaitījumu (jauna sesija); Izdošanu labo manuāli Excel.</div>';
    else if (!isAdmin()) h += '<div class="alert info">Labot var tikai Admins.</div>';
    else {
      h += `<div class="card"><h2>Labot</h2><label for="eqty">Skaits</label><input id="eqty" type="text" inputmode="decimal" value="${esc(qtyTxt(r.Skaits))}">`;
      if (r.Modulis === C.MODE.IZD) h += `<label for="ercp">Saņēmējs</label><select id="ercp">${st.recipients.map(x => `<option value="${esc(x)}" ${x === r.KamIzdots ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
      h += '<div style="height:12px"></div><button class="big ok" data-act="saveEdit">SAGLABĀT LABOJUMU</button></div>';
    }
    return h;
  }

  async function screenExchange() {
    const sum = await core.summary();
    const exports = await core.listExports();
    const n = sum.IZD.new + sum.INV.new;
    let h = `<div class="card"><h2>Eksports uz datoru (CSV)</h2>
      <div class="kv"><span>Izdošana — neeksportēti</span><b>${sum.IZD.new}</b></div>
      <div class="kv"><span>Inventarizācija — neeksportēti</span><b>${sum.INV.new}</b></div>`;
    if (sum.openInv) h += `<div class="alert warn">Ir ${sum.openInv} nepabeigta inventarizācijas sesija(s). Eksportā tiks iekļauti arī to apstiprinātie ieraksti.</div>`;
    h += `<button class="big ok" data-act="doExport" ${n ? '' : 'disabled'}>EKSPORTĒT (${n})</button>
      <p class="mut">Tiek izveidots atsevišķs fails Izdošanai un Inventarizācijai. Pēc eksporta ieraksti kļūst par “Eksportēts”. Failu kopīgojiet ar AirDrop, sadaļu Faili vai e-pastu — tas jānonāk mapē DATU_APMAINA\\02_IENAKOSIE.</p></div>`;
    h += '<div class="card"><h2>Izveidotie faili</h2>';
    h += exports.length ? exports.slice(0, 20).map(x =>
      `<div class="rec"><b style="word-break:break-all">${esc(x.fileName)}</b><div class="mut">${nIer(x.count)} · ${esc(fmtDT(x.created))}</div><button class="btn pri" data-act="shareExport" data-id="${esc(x.id)}" style="margin-top:6px">Kopīgot / saglabāt</button></div>`).join('')
      : '<div class="mut">Vēl nav eksportu.</div>';
    h += '</div>';
    h += `<div class="card"><h2>Rezerves kopija (JSON)</h2><p class="mut">Visi lokālie dati vienā failā — glabājiet drošā vietā. Atjaunošana tikai pievieno trūkstošo, esošo nepārraksta.</p>
      <div class="row"><button class="btn" data-act="backup">Izveidot kopiju</button><button class="btn" data-act="restorePick">Atjaunot no kopijas</button></div>
      <input type="file" id="restoreIn" accept=".json,application/json" hidden></div>`;
    h += `<div class="card"><h2>Darba datu dzēšana</h2><p class="mut">Izdzēš visus ierakstus, sesijas un izveidotos eksporta failus šajā ierīcē (piem., pēc testēšanas). Iestatījumi — PIN, noliktavas, saņēmēji, preču saraksts — paliek. Darbība nav atceļama; iepriekš var izveidot rezerves kopiju.</p>
      <button class="btn dng" data-act="resetData" style="width:100%">Dzēst visus ierakstus…</button></div>`;
    return h;
  }

  async function screenSettings() {
    const st = await core.getSettings();
    const ta = (id, label, hint, arr) => `<div class="card"><h2>${label}</h2><p class="mut">${hint}</p><textarea id="${id}" spellcheck="false" autocapitalize="off">${esc(arr.join('\n'))}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn" data-act="loadList" data-target="${id}">Ielādēt no faila</button><span class="mut" id="${id}N"></span></div></div>`;
    let persisted = S.persisted == null ? 'nav zināms' : (S.persisted ? 'jā' : 'nē');
    return ta('sWh', 'Noliktavu saraksts', 'Viens kods rindā (kā Excel lapā L_Izvietojums, piem. K1, K2, HMP).', st.warehouses) +
      ta('sRc', 'Saņēmēju saraksts', 'Viens saņēmējs rindā — tieši kā Excel Iestatījumu tabulā (kolonna N). Projekts un zona lietotnē netiek glabāti.', st.recipients) +
      ta('sPr', 'Preču saraksts (neobligāts)', 'Rinda: kods;nosaukums;mērvienība (nosaukums un mērvienība neobligāti). Ja ielādēts, lietotne pēc skenēšanas rāda preces nosaukumu un kodi ārpus saraksta tiek atzīmēti kā “neatpazīta prece” (process netiek apturēts). Ja tukšs — pārbaude notiek tikai importā. Sarakstu var izveidot QR ģeneratorā (Eksportēt lietotnei).', st.products.map(c => C.productLine(c, (st.productInfo || {})[c]))) +
      '<button class="big ok" data-act="saveSettings">SAGLABĀT SARAKSTUS</button><input type="file" id="listFile" accept=".txt,.csv,text/plain,text/csv" hidden>' +
      '<div class="card" style="margin-top:14px"><h2>Admina PIN</h2><button class="btn" data-act="changePin">Mainīt PIN</button></div>' +
      `<div class="card"><h2>Par lietotni</h2><div class="kv"><span>Versija</span><b>${C.VERSION}</b></div><div class="kv"><span>Pastāvīga datu glabāšana</span><b>${persisted}</b></div><div class="kv"><span>Atvērta no sākuma ekrāna</span><b>${isStandalone() ? 'jā' : 'nē'}</b></div></div>`;
  }

  const SCREENS = { home: screenHome, start: screenStart, recipient: screenRecipient, capture: screenCapture, records: screenRecords, exchange: screenExchange, settings: screenSettings };
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq;
    let body;
    try { body = await SCREENS[S.screen](); }
    catch (e) { body = `<div class="alert err">Kļūda: ${esc(e.message)}</div>`; }
    if (seq !== renderSeq) return;
    $('#app').innerHTML = header() + `<main>${body}</main><footer>NoliktavaPRIM v${C.VERSION}</footer>`;
    if (S.screen === 'capture' && S.cap.code && $('#qty')) { updateConfirm(); setTimeout(() => { const q = $('#qty'); if (q) q.focus(); }, 80); }
    if (S.screen === 'settings') ['sWh', 'sRc', 'sPr'].forEach(countList);
  }
  const go = (screen, extra) => { S.screen = screen; Object.assign(S, extra || {}); window.scrollTo(0, 0); return render(); };

  function countList(id) {
    const ta = $('#' + id), n = $('#' + id + 'N');
    if (ta && n) n.textContent = nIer(C.normList(ta.value).length);
  }
  function updateConfirm() {
    const b = $('#okBtn'); if (!b) return;
    let ok = true;
    try { C.parseQty($('#qty').value, S.mode); } catch (e) { ok = false; }
    const r = $('#rcp'); if (r && !r.value) ok = false;
    b.disabled = !ok;
  }
  const showErr = msg => { const e = $('#capErr'); if (e) e.innerHTML = `<div class="alert err">${esc(msg)}</div>`; };

  // ------------------------------------------------------------ darbības
  async function setCode(text) {
    const code = C.normCode(text); if (!code) return;
    const st = await core.getSettings(), sess = await core.getSession(S.sid);
    let existing = null;
    if (sess.Modulis === C.MODE.INV) existing = (await core.listRecords({ sessionId: sess.SessionID })).find(r => r.PrecesKods === code) || null;
    const inf = (st.productInfo || {})[code] || {};
    S.cap = { code, name: inf.n || '', unit: inf.u || '', flagged: st.products.length > 0 && !st.products.includes(code), existing, editId: null, qtyPrefill: '' };
    render();
  }
  async function beginSession(wh) {
    try {
      if (S.mode === C.MODE.IZD) {                                   // v1.3.0: noliktava → saņēmējs → preces
        const st = await core.getSettings();
        const w = C.matchList(st.warehouses, wh);
        if (!w) { toast(`Kods "${C.normCode(wh)}" nav noliktavu sarakstā.`, 4000); return; }
        if (!st.recipients.length) { toast('Saņēmēju saraksts ir tukšs. Admins to ievada Iestatījumos.', 4000); return; }
        return go('recipient', { pendingWh: w });
      }
      const s = await core.startSession(S.mode, wh);
      S.sid = s.SessionID; S.cap = newCap();
      go('capture');
    } catch (e) { toast(e.message, 4000); }
  }
  async function toggleRole() {
    if (isAdmin()) { S.role = C.ROLE.WORKER; if (S.screen === 'exchange' || S.screen === 'settings') S.screen = 'home'; S.recId = null; return render(); }
    if (!(await core.hasPin())) {
      const r = await modal({ title: 'Izveidojiet Admina PIN',
        html: '<p class="mut">4–8 cipari. Bez PIN nevar atvērt Datu apmaiņu, Iestatījumus un labot ierakstus. PIN nevar atjaunot — pierakstiet to.</p><input type="password" inputmode="numeric" placeholder="PIN"><input type="password" inputmode="numeric" placeholder="Atkārtot PIN" style="margin-top:8px">',
        buttons: [{ id: 'x', label: 'Atcelt' }, { id: 'ok', label: 'Izveidot', cls: 'pri' }] });
      if (r.btn !== 'ok') return;
      if (r.vals[0] !== r.vals[1]) return toast('PIN nesakrīt');
      try { await core.setPin(r.vals[0]); S.role = C.ROLE.ADMIN; render(); } catch (e) { toast(e.message); }
      return;
    }
    const r = await modal({ title: 'Admina PIN', html: '<input type="password" inputmode="numeric" placeholder="PIN">',
      buttons: [{ id: 'x', label: 'Atcelt' }, { id: 'ok', label: 'Ieiet', cls: 'pri' }] });
    if (r.btn !== 'ok') return;
    if (await core.verifyPin(r.vals[0])) { S.role = C.ROLE.ADMIN; render(); } else toast('Nepareizs PIN');
  }
  async function readTextFile(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1257').decode(buf); }       // Excel CSV ar latviešu burtiem
  }

  const ACT = {
    home: () => { S.recId = null; go('home'); },
    hideBanner: () => { S.hideBanner = true; render(); },
    role: toggleRole,
    nav: d => { if ((d.to === 'exchange' || d.to === 'settings') && !isAdmin()) return toast('Tikai Admins'); S.recId = null; go(d.to); },
    start: async d => {
      S.mode = d.mode;
      if (d.mode === C.MODE.IZD) {
        const o = (await core.listSessions({ status: C.SESS.OPEN, mode: C.MODE.IZD }))[0];
        if (o) { toast('Izdošana jau ir atvērta. Turpiniet to vai pabeidziet, tad sāciet jaunu.', 5000); return go('home'); }
      }
      go('start');
    },
    pickRcp: async d => {
      try {
        const s = await core.startSession(C.MODE.IZD, S.pendingWh, d.r);
        S.sid = s.SessionID; S.cap = newCap(); S.pendingWh = null;
        go('capture');
      } catch (e) { toast(e.message, 4000); }
    },
    resume: async d => { const s = await core.getSession(d.id); S.mode = s.Modulis; S.sid = s.SessionID; S.cap = newCap(); go('capture'); },
    scanWh: async () => { const t = await scan('Skenējiet noliktavas kodu'); if (t) beginSession(t); },
    pickWh: d => beginSession(d.wh),
    typeWh: () => { const v = $('#whIn').value; if (v.trim()) beginSession(v); },
    scanProd: async () => { const t = await scan('Skenējiet preces kodu'); if (t) setCode(t); },
    typeCode: () => { const v = $('#codeIn').value; if (v.trim()) setCode(v); },
    clearCode: () => { S.cap = newCap(); render(); },
    contExisting: () => { S.cap = newCap(); render(); },
    editExisting: () => { const ex = S.cap.existing; S.cap.editId = ex.RecordID; S.cap.qtyPrefill = qtyTxt(ex.Skaits); render(); },
    confirm: async () => {
      if (S.busy) return; S.busy = true;
      try {
        const qty = $('#qty').value, rcp = $('#rcp') ? $('#rcp').value : '';
        if (S.cap.editId) { await core.editRecord(S.cap.editId, { qty }, S.role); toast('Labots'); }
        else { const r = await core.addRecord(S.sid, { code: S.cap.code, qty, recipient: rcp }); beep(); toast(`Saglabāts: ${r.PrecesKods} × ${qtyTxt(r.Skaits)}`); }
        S.cap = newCap(); render();
      } catch (e) {
        if (e.code === 'JAU_PARSKAITITS') { S.cap.existing = e.extra.existing; render(); } else showErr(e.message);
      } finally { S.busy = false; }
    },
    finish: async () => {
      const recs = await core.listRecords({ sessionId: S.sid });
      if (!(await confirmBox('Pabeigt sesiju?', `Sesijā: ${nIer(recs.length)}. Pēc pabeigšanas ierakstus šajā sesijā pievienot vairs nevarēs.`, 'Pabeigt'))) return;
      await core.completeSession(S.sid); toast('Sesija pabeigta'); S.cap = newCap(); go('home');
    },
    flt: d => { S.flt[d.grp] = d.val; render(); },
    openRec: d => { S.recId = d.id; render(); },
    closeRec: () => { S.recId = null; render(); },
    saveEdit: async () => {
      try {
        const r = await core.getRecord(S.recId), patch = { qty: $('#eqty').value };
        if (r.Modulis === C.MODE.IZD) patch.recipient = $('#ercp').value;
        await core.editRecord(S.recId, patch, S.role); toast('Labojums saglabāts'); render();
      } catch (e) { toast(e.message, 4000); }
    },
    doExport: async () => {
      if (S.busy) return; S.busy = true;
      try {
        const b = await core.exportUnexported();
        toast(b.length ? `Izveidoti faili: ${b.length}. Nospiediet “Kopīgot / saglabāt”.` : 'Nav ko eksportēt', 4500); render();
      } catch (e) { toast(e.message, 4000); } finally { S.busy = false; }
    },
    shareExport: async d => { const x = await core.getExport(d.id); if (x) await shareFile(x.fileName, x.csv, 'text/csv'); },
    backup: async () => { const b = await core.backup(); await shareFile(`NoliktavaPRIM_backup_${C.nowParts().stamp}.json`, JSON.stringify(b), 'application/json'); },
    restorePick: () => $('#restoreIn').click(),
    resetData: async () => {
      if (!isAdmin()) return toast('Tikai Admins');
      const sum = await core.summary();
      const recs = await core.listRecords();
      const unexp = sum.IZD.new + sum.INV.new;
      const warn = unexp ? `<div class="alert warn"><b>Uzmanību:</b> ${unexp} ieraksti vēl nav eksportēti — tie tiks neatgriezeniski zaudēti, ja iepriekš neizveidosiet eksportu vai rezerves kopiju.</div>` : '';
      const r = await modal({ title: 'Dzēst visus ierakstus?',
        html: `<p>Tiks izdzēsti <b>${recs.length}</b> ieraksti, visas sesijas un eksporta faili. Iestatījumi paliek.</p>${warn}<p class="mut">Lai apstiprinātu, ierakstiet <b>DZEST</b> (var arī DZĒST) un ievadiet Admina PIN.</p><input type="text" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="DZEST"><input type="password" inputmode="numeric" placeholder="PIN" style="margin-top:8px">`,
        buttons: [{ id: 'x', label: 'Atcelt' }, { id: 'ok', label: 'Dzēst', cls: 'dng' }] });
      if (r.btn !== 'ok') return;
      if (String(r.vals[0] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() !== 'DZEST') return toast('Jāieraksta DZEST (vai DZĒST) — nekas nav dzēsts', 4000);
      if (!(await core.verifyPin(r.vals[1]))) return toast('Nepareizs PIN — nekas nav dzēsts', 4000);
      try {
        const n = await core.resetData(S.role);
        S.sid = null; S.cap = newCap(); S.recId = null;
        toast(`Izdzēsts: ${n.records} ieraksti, ${n.sessions} sesijas, ${n.exports} faili`, 4500); go('home');
      } catch (e) { toast(e.message, 4500); }
    },
    loadList: d => { S.loadTarget = d.target; $('#listFile').click(); },
    saveSettings: async () => {
      try {
        const st = await core.saveSettings({ warehouses: $('#sWh').value, recipients: $('#sRc').value, products: $('#sPr').value }, S.role);
        toast(`Saglabāts: ${st.warehouses.length} noliktavas, ${st.recipients.length} saņēmēji, ${st.products.length} preces (${Object.keys(st.productInfo || {}).length} ar nosaukumu)`, 4500); render();
      } catch (e) { toast(e.message, 4000); }
    },
    changePin: async () => {
      const r = await modal({ title: 'Mainīt Admina PIN', html: '<input type="password" inputmode="numeric" placeholder="Pašreizējais PIN"><input type="password" inputmode="numeric" placeholder="Jaunais PIN (4–8 cipari)" style="margin-top:8px">',
        buttons: [{ id: 'x', label: 'Atcelt' }, { id: 'ok', label: 'Mainīt', cls: 'pri' }] });
      if (r.btn !== 'ok') return;
      try { await core.setPin(r.vals[1], r.vals[0]); toast('PIN nomainīts'); } catch (e) { toast(e.message, 4000); }
    },
  };

  function wire() {
    const root = $('#app');
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-act]'); if (!el) return;
      const fn = ACT[el.dataset.act]; if (!fn) return;
      Promise.resolve(fn(el.dataset, el)).catch(err => toast(err.message, 4000));
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); ACT[e.target.dataset.enter](e.target.dataset); }
    });
    root.addEventListener('input', e => {
      if (e.target.id === 'qty') updateConfirm();
      if (e.target.tagName === 'TEXTAREA') countList(e.target.id);
    });
    root.addEventListener('change', async e => {
      if (e.target.id === 'rcp') updateConfirm();
      const f = e.target.files && e.target.files[0];
      if (e.target.id === 'listFile' && f) {
        const text = await readTextFile(f), ta = $('#' + S.loadTarget);
        if (ta && ta.id === 'sPr') { const pp = C.parseProducts(text); ta.value = pp.lines.join('\n'); countList(ta.id); toast(`Saraksts ielādēts: ${pp.codes.length} preces, ${Object.keys(pp.info).length} ar nosaukumu — nospiediet SAGLABĀT`, 4500); }
        else if (ta) { ta.value = C.normList(text).join('\n'); countList(ta.id); toast('Saraksts ielādēts — nospiediet SAGLABĀT'); }
        e.target.value = '';
      }
      if (e.target.id === 'restoreIn' && f) {
        try {
          const n = await core.restore(JSON.parse(await f.text()), S.role);
          toast(`Atjaunots: ${n.records} ieraksti, ${n.sessions} sesijas, ${n.exports} faili`, 4000); render();
        } catch (err) { toast(err.message, 4500); }
        e.target.value = '';
      }
    });
  }

  async function boot() {
    try {
      core = C.createApp(idbStorage(await openDB()));
    } catch (e) {
      $('#app').innerHTML = `<main><div class="alert err"><b>Datu glabātuve nav pieejama.</b><br>${esc(e.message)}<br>Atveriet lietotni Safari (ne privātajā režīmā) vai no sākuma ekrāna ikonas.</div></main>`;
      return;
    }
    wire();
    try { if (navigator.storage && navigator.storage.persist) S.persisted = await navigator.storage.persist(); } catch (e) { /* */ }
    if ('serviceWorker' in navigator) {
      const had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(() => { /* bezsaistes kešs nav pieejams */ });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Lietotne atjaunināta — aizveriet un atveriet to vēlreiz.', 6000); });
    }
    render();
  }
  boot();
})();
