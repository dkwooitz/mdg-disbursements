  const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', currencyDisplay: 'narrowSymbol' });

  /* ===== Signed-in user =====
     These details fill the Requestor section and are locked, so a claim can only ever be
     submitted for the person logged in. Until sign-in and the organogram/workforce lookup
     are connected, this object stands in for the logged-in profile — replace it with the
     values returned by the directory once that integration is in place. */
  const SESSION_USER = {
    name: 'Diedrik',
    surname: 'Kwooitz',
    number: '10234',                        // placeholder — set to the real employee number
    email: 'DKwooitz@masterdrilling.com'
  };

  function applySessionUser() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('empName', SESSION_USER.name);
    set('empSurname', SESSION_USER.surname);
    set('empNumber', SESSION_USER.number);
    set('empEmail', SESSION_USER.email);

    const full = [SESSION_USER.name, SESSION_USER.surname].filter(Boolean).join(' ');
    const initials = (SESSION_USER.name || ' ')[0] + (SESSION_USER.surname || ' ')[0];
    const nameEl = document.querySelector('.user-name');
    const avatarEl = document.querySelector('.avatar');
    const accName = document.querySelector('.account-name');
    const accEmail = document.querySelector('.account-email');
    if (nameEl) nameEl.textContent = full;
    if (avatarEl) avatarEl.textContent = initials.toUpperCase();
    if (accName) accName.textContent = full;
    if (accEmail) accEmail.textContent = SESSION_USER.email;
  }

  // Kilometre reimbursement rate (Rand per km). Editable by admins; not shown to requestors.
  let KM_RATE = 5.63;

  // Currencies offered on Other Claims. ZAR is home/payment currency.
  const CUR = {
    ZAR: { label: 'ZAR (R)' },
    USD: { label: 'USD ($)' },
    EUR: { label: 'EUR (€)' },
    AUD: { label: 'AUD (A$)' },
    BRL: { label: 'BRL (R$)' },
    PEN: { label: 'PEN (S/)' }
  };
  // Value of 1 unit of each currency in ZAR. Indicative fallback (~Jun 2026);
  // overwritten by the live daily feed on load.
  let RATES = { ZAR: 1, USD: 16.54, EUR: 18.90, AUD: 11.39, BRL: 3.00, PEN: 4.47 };
  let RATES_DATE = 'indicative';

  function curOptions() {
    return Object.keys(CUR).map(c =>
      '<option value="' + c + '"' + (c === 'ZAR' ? ' selected' : '') + '>' + CUR[c].label + '</option>'
    ).join('');
  }

  function updateRatesLabel() {
    const el = document.getElementById('ratesNote');
    if (!el) return;
    el.textContent = RATES_DATE === 'indicative'
      ? 'Showing indicative rates — live feed unavailable. Amounts still convert to ZAR.'
      : 'Live daily rates · updated ' + RATES_DATE + ' · all amounts converted to ZAR for payment.';
  }

  // Pull today's rates from a free daily feed and express each currency in ZAR.
  // Primary: open.er-api.com (USD base). Fallback: fawazahmed0 currency-api (EUR base),
  // via jsDelivr then Cloudflare Pages. Finally, indicative rates if everything is unreachable.
  // (For production this is where Master Drilling's OANDA Exchange Rates API would slot in.)
  async function fetchRates() {
    // 1) Primary source — open.er-api.com, base USD
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!r.ok) throw new Error('bad response');
      const d = await r.json();
      if (!d || !d.rates || !d.rates.ZAR) throw new Error('no rates');
      const z = d.rates.ZAR; // ZAR per 1 USD
      ['USD', 'EUR', 'AUD', 'BRL', 'PEN'].forEach(c => {
        if (d.rates[c]) RATES[c] = z / d.rates[c]; // foreign -> ZAR
      });
      RATES.ZAR = 1;
      RATES_DATE = (d.time_last_update_utc || '').slice(0, 16) || 'today';
      updateRatesLabel();
      recalc();
      return;
    } catch (e) { /* fall through to the EUR-based fallback */ }

    // 2) Fallback source — fawazahmed0 currency-api, base EUR (jsDelivr, then Cloudflare Pages)
    const eurUrls = [
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json',
      'https://latest.currency-api.pages.dev/v1/currencies/eur.min.json'
    ];
    for (const url of eurUrls) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('bad response');
        const d = await r.json();
        const eur = d && d.eur; // { usd: n, zar: n, aud: n, ... } — units per 1 EUR
        if (!eur || !eur.zar) throw new Error('no rates');
        // value of 1 unit of a currency in ZAR = (ZAR per EUR) / (currency per EUR)
        RATES.EUR = eur.zar;
        ['usd', 'aud', 'brl', 'pen'].forEach(c => {
          if (eur[c]) RATES[c.toUpperCase()] = eur.zar / eur[c];
        });
        RATES.ZAR = 1;
        RATES_DATE = d.date || 'today';
        updateRatesLabel();
        recalc();
        return;
      } catch (e) { /* try the next fallback URL */ }
    }

    // 3) All sources failed — keep the indicative rates
    RATES_DATE = 'indicative';
    updateRatesLabel();
    recalc();
  }

  /* ---- Account menu + theme dropdown ---- */
  const accountBtn = document.getElementById('accountBtn');
  const accountMenu = document.getElementById('accountMenu');
  const themeSelect = document.getElementById('themeSelect');

  accountBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = accountMenu.classList.toggle('hidden') === false;
    accountBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!accountMenu.contains(e.target) && !accountBtn.contains(e.target)) {
      accountMenu.classList.add('hidden');
      accountBtn.setAttribute('aria-expanded', 'false');
    }
  });
  // One place that applies a theme everywhere and keeps all controls in sync.
  // Corporate CI permits two themes only (MDG-COE-POL-DIG-01 §5.4).
  const THEMES = ['light', 'dark'];
  function applyTheme(t) {
    if (THEMES.indexOf(t) === -1) t = 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('mdg-theme', t); } catch (e) { /* storage unavailable */ }
    if (themeSelect) themeSelect.value = t;
    document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.themeVal === t));
  }

  // Initialise controls to the current theme (from storage or default).
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(currentTheme);

  themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

  // Settings page: theme cards
  document.querySelectorAll('.theme-card').forEach(card =>
    card.addEventListener('click', () => applyTheme(card.dataset.themeVal))
  );

  // Presentation poster shown by Logout (temporary — revert after the presentation).
  const posterOverlay = document.getElementById('posterOverlay');
  function showPoster() {
    if (posterOverlay) posterOverlay.classList.remove('hidden');
    if (accountMenu) { accountMenu.classList.add('hidden'); accountBtn.setAttribute('aria-expanded', 'false'); }
  }
  function hidePoster() { if (posterOverlay) posterOverlay.classList.add('hidden'); }
  const posterBack = document.getElementById('posterBack');
  if (posterBack) posterBack.addEventListener('click', hidePoster);

  // Settings page: session actions
  const setHubBtn = document.getElementById('setHub');
  if (setHubBtn) setHubBtn.addEventListener('click', () =>
    showToast('“Back to Hub” will link to the Master Drilling hub once it’s connected.', 5000));
  const setLogoutBtn = document.getElementById('setLogout');
  if (setLogoutBtn) setLogoutBtn.addEventListener('click', showPoster);

  // Account-menu logout also shows the poster
  const menuLogout = document.querySelector('.btn-logout');
  if (menuLogout) menuLogout.addEventListener('click', showPoster);

  /* ---- Sidebar show/hide ---- */
  const appEl = document.querySelector('.app');
  function toggleSidebar() { appEl.classList.toggle('sidebar-hidden'); }
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarToggleTop = document.getElementById('sidebarToggleTop');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
    sidebarToggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSidebar(); } });
  }
  if (sidebarToggleTop) sidebarToggleTop.addEventListener('click', toggleSidebar);

  /* ---- Sidebar view switching ---- */  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      document.getElementById('view-' + view).classList.remove('hidden');
    });
  });

  /* ---- Tabs ---- */
  function switchTab(which) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === which));
    document.getElementById('tab-km').classList.toggle('hidden', which !== 'km');
    document.getElementById('tab-other').classList.toggle('hidden', which !== 'other');
  }
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  /* ---- Rows ---- */
  // data-label carries the column heading down to the phone layout, where the table
  // stacks into cards and the header row is no longer on screen.
  function kmRow() {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Date"><input type="date"></td>' +
      '<td data-label="From"><input type="text" placeholder="From"></td>' +
      '<td data-label="To"><input type="text" placeholder="To"></td>' +
      '<td data-label="Kilometres"><input type="number" min="0" step="1" placeholder="0" class="km-input"></td>' +
      '<td class="col-amt" data-label="Amount (R)"><span class="amt-cell">R 0,00</span></td>' +
      '<td class="col-odo" data-label="Odometer (optional)">' +
        '<input type="file" accept="image/*" class="odo-input" hidden>' +
        '<button type="button" class="odo-btn" title="Upload proof of the trip">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/></svg>' +
          'Proof' +
        '</button>' +
      '</td>' +
      '<td class="col-del"><button class="row-del" title="Remove row">&times;</button></td>';
    return tr;
  }
  function otherRow() {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td data-label="Date"><input type="date"></td>' +
      '<td data-label="Description of claim"><input type="text" placeholder="Description of claim"></td>' +
      '<td class="col-amt" data-label="Amount">' +
        '<div class="cur-row">' +
          '<select class="cur-select">' + curOptions() + '</select>' +
          '<input type="number" min="0" step="0.01" placeholder="0.00" class="amt-input">' +
        '</div>' +
        '<div class="zar-line"><span class="zar-eq">R 0,00</span><span class="rate-note"></span></div>' +
      '</td>' +
      '<td class="col-odo" data-label="Proof — required">' +
        '<input type="file" accept="image/*" class="odo-input" hidden>' +
        '<button type="button" class="odo-btn" title="Upload proof of claim">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>' +
          'Proof' +
        '</button>' +
      '</td>' +
      '<td class="col-del"><button class="row-del" title="Remove row">&times;</button></td>';
    return tr;
  }

  const kmBody = document.getElementById('km-rows');
  const otherBody = document.getElementById('other-rows');

  /* ---- Proof of purchase on other claims ----
     Finance needs a receipt or invoice behind every rand claimed, so an other-claims line
     may not be submitted without one. A recalled claim keeps the proof it already had on
     file: the file itself cannot be put back into the browser, but it still counts. */
  function rowHasProof(tr) {
    return !!tr.querySelector('.odo-thumb') || tr.dataset.proofOnFile === '1';
  }
  // A line counts as filled in once it carries an amount, a date or a description.
  function otherRowHasContent(tr) {
    const date = tr.querySelector('input[type=date]').value;
    const desc = tr.querySelector('input[type=text]').value.trim();
    const amt = parseFloat(tr.querySelector('.amt-input').value) || 0;
    return !!(amt > 0 || date || desc);
  }
  function otherRowsMissingProof() {
    return [...otherBody.querySelectorAll('tr')].filter(tr => otherRowHasContent(tr) && !rowHasProof(tr));
  }
  // Clear the warning as soon as the employee starts putting the line right.
  otherBody.addEventListener('input', e => {
    const tr = e.target.closest('tr');
    if (tr) tr.classList.remove('row-error');
  });

  function recalc() {
    // Travelling: amount per row = kilometres × hidden rate
    let km = 0;
    kmBody.querySelectorAll('tr').forEach(tr => {
      const kmInput = tr.querySelector('.km-input');
      const amtCell = tr.querySelector('.amt-cell');
      const dist = parseFloat(kmInput && kmInput.value) || 0;
      const amt = dist * KM_RATE;
      km += amt;
      if (amtCell) amtCell.textContent = money.format(amt);
    });
    // Other claims: each amount is in the row's chosen currency, converted to ZAR
    let other = 0;
    otherBody.querySelectorAll('tr').forEach(tr => {
      const sel = tr.querySelector('.cur-select');
      const amtInput = tr.querySelector('.amt-input');
      const zarEq = tr.querySelector('.zar-eq');
      const rateNote = tr.querySelector('.rate-note');
      const code = (sel && sel.value) || 'ZAR';
      const rate = RATES[code] || 1;
      const val = parseFloat(amtInput && amtInput.value) || 0;
      const zar = val * rate;
      other += zar;
      if (zarEq) zarEq.textContent = money.format(zar);
      if (rateNote) rateNote.textContent = code === 'ZAR' ? '' : '@ ' + rate.toFixed(2);
    });

    document.getElementById('km-total').textContent = money.format(km);
    document.getElementById('other-total').textContent = money.format(other);
    document.getElementById('sum-km').textContent = money.format(km);
    document.getElementById('sum-other').textContent = money.format(other);
    document.getElementById('sum-grand').textContent = money.format(km + other);

    // Tell the employee the moment the claim crosses the materiality limit, while they can
    // still see what pushed it over, rather than only once it has been submitted.
    const matFlag = document.getElementById('materialFlag');
    if (matFlag) matFlag.classList.toggle('hidden', !((km + other) > MATERIAL_LIMIT));

    updateKmFlag();
  }

  // Show the soft disclaimer if any travelling line repeats a previous disbursement's route + distance.
  /* The repeated-kilometres check is deliberately silent to the person claiming.
     Telling them their route matches an earlier claim would only teach them to vary it
     until the check stops firing. The flag is still worked out and stored on the claim
     (see recomputeKmFlags), for the HOD — and the CFO on a material claim — to act on
     once approver sign-in exists. It must not be surfaced anywhere the requestor looks:
     not on the form, not in Previous Claims, not on the claim, not on the PDF. */
  function updateKmFlag() { /* nothing is shown to the requestor */ }

  function wireRow(tr, which) {
    tr.querySelectorAll('input:not([type=file])').forEach(i => i.addEventListener('input', recalc));
    const curSel = tr.querySelector('.cur-select');
    if (curSel) curSel.addEventListener('change', recalc);
    tr.querySelector('.row-del').addEventListener('click', () => { tr.remove(); recalc(); });

    const upBtn = tr.querySelector('.odo-btn');
    const upInput = tr.querySelector('.odo-input');
    if (upBtn && upInput) {
      upBtn.addEventListener('click', () => upInput.click());
      upInput.addEventListener('change', () => {
        const f = upInput.files[0];
        if (!f) return;
        const url = URL.createObjectURL(f);
        upBtn.classList.add('has-photo');
        upBtn.innerHTML =
          '<img class="odo-thumb" src="' + url + '" alt="Attached proof">' +
          '<span class="odo-ok" title="Proof attached">&#10003;</span>';
        keepFile(f).then(id => { if (id) tr.dataset.fileId = id; });
        if (which === 'other') readReceipt(f, tr, upBtn);
      });
    }
  }
  function addRow(which) {
    const tr = which === 'km' ? kmRow() : otherRow();
    (which === 'km' ? kmBody : otherBody).appendChild(tr);
    wireRow(tr, which);
  }

  // Read a receipt photo with the AI and fill in date / description / amount.
  /* ---- Document reader ----
     Handled by this app's own Cloudflare Worker (see worker/index.js), so the request
     never leaves the app's origin and the API key stays on the server. */
  const AI_PROXY_URL = '/api/ai';

  // Sends a file + prompt to the Worker and returns the AI's raw text result.
  async function callAIProxy(base64Data, mimeType, prompt) {
    const resp = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: mimeType || 'image/jpeg', base64Data, prompt })
    });
    if (!resp.ok) {
      // The Worker explains itself in JSON; carry that up so a failure is diagnosable.
      let why = 'the reader returned ' + resp.status;
      try { const e = await resp.json(); if (e && e.error) why = e.error; } catch (err) {}
      throw new Error(why);
    }
    const data = await resp.json();
    return (data && data.result) ? String(data.result) : '';
  }

  /* ---- Policy Q&A: answers grounded in the policy shown on the Policy page ---- */
  // UTF-8 safe base64 (btoa alone breaks on accented/dashed characters).
  function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  // Read the policy straight off the page, so the AI always answers from the current wording.
  function getPolicyText() {
    return Array.from(document.querySelectorAll('#view-manual .policy'))
      .map(sec => sec.innerText.trim())
      .join('\n\n');
  }

  const policyQ = document.getElementById('policyQ');
  const policyAskBtn = document.getElementById('policyAskBtn');
  const policyA = document.getElementById('policyA');

  // The model sometimes wraps its reply in JSON or code fences — unwrap to plain text.
  function plainAnswer(raw) {
    let t = String(raw || '').trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        const obj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (typeof obj === 'string') return obj.trim();
        if (obj && typeof obj === 'object') {
          const preferred = obj.answer || obj.response || obj.text || obj.result || obj.message;
          if (typeof preferred === 'string') return preferred.trim();
          const firstString = Object.values(obj).find(v => typeof v === 'string');
          if (firstString) return firstString.trim();
        }
      } catch (e) { /* not JSON after all — fall through */ }
    }
    return t;
  }

  // Contact list rendered for the assistant's fallback (uses the admin-editable contacts).
  function contactsHtml() {
    return '<ul class="answer-contacts">' + CONTACTS.map(c =>
      '<li>' + escapeHtml(c.name) + (c.role ? ' (' + escapeHtml(c.role) + ')' : '') +
      ' <a href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + '</a></li>'
    ).join('') + '</ul>';
  }
  function noAnswerHtml() {
    return '<p>Unfortunately your query is not supported by the disbursement policy. ' +
      'If you require further assistance, please contact:</p>' + contactsHtml();
  }

  async function askPolicy() {
    const q = (policyQ.value || '').trim();
    if (!q) return;
    policyA.classList.remove('hidden');
    policyA.textContent = 'Checking the policy…';
    policyAskBtn.disabled = true;

    try {
      const prompt =
        'The attached text is Master Drilling\'s disbursement policy, including the "Requirements from Finance" section. ' +
        'Answer the employee\'s question using ONLY this policy. ' +
        'Reply with plain conversational text only — no JSON, no code fences, no markdown, no field names, no quotation marks around the answer. ' +
        'Be brief, clear and practical: two or three sentences. ' +
        'If the policy does not contain the answer, or the question is unrelated to disbursements, ' +
        'reply with exactly this single word and nothing else: NO_ANSWER. ' +
        'Do not invent rules, dates or amounts.\n\nEmployee question: ' + q;
      const answer = plainAnswer(await callAIProxy(toBase64Utf8(getPolicyText()), 'text/plain', prompt));

      if (!answer || /^NO[_\s-]?ANSWER\.?$/i.test(answer.trim()) || /NO_ANSWER/i.test(answer)) {
        policyA.innerHTML = noAnswerHtml();
      } else {
        policyA.textContent = answer;
      }
    } catch (e) {
      policyA.innerHTML = '<p>The policy assistant is unavailable right now. ' +
        'Please read the policy above, or contact:</p>' + contactsHtml();
    } finally {
      policyAskBtn.disabled = false;
    }
  }

  if (policyAskBtn) policyAskBtn.addEventListener('click', askPolicy);
  if (policyQ) policyQ.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askPolicy(); } });

  /* ===== Uploaded files =====
     The claim record keeps only the file's name; the file itself lives in IndexedDB on this
     device, so a claim can be opened later and its bank letter, receipts and odometer photos
     looked at again. Local storage is far too small for photographs, which is why this is not
     kept alongside the claims themselves. The backend will take this over. */
  const FILE_DB = 'mdg-files';
  const FILE_STORE = 'files';
  const MAX_IMAGE_EDGE = 1600; // photographs are shrunk before keeping — a phone camera shot
  const IMAGE_QUALITY = 0.82;  // is many times larger than anything needed to read a slip

  let fileDbPromise = null;
  function openFileDb() {
    if (fileDbPromise) return fileDbPromise;
    fileDbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(FILE_DB, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return fileDbPromise;
  }

  function newFileId() {
    return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Shrink a photograph so a claim's attachments do not run to tens of megabytes.
  function shrinkImage(file) {
    return new Promise(resolve => {
      if (!/^image\//.test(file.type) || /svg/.test(file.type)) { resolve(file); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
        if (scale === 1) { URL.revokeObjectURL(url); resolve(file); return; }
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob || file); }, 'image/jpeg', IMAGE_QUALITY);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  async function keepFile(file) {
    if (!file) return '';
    try {
      const blob = await shrinkImage(file);
      const rec = { id: newFileId(), name: file.name, type: file.type || blob.type || '', size: blob.size, blob: blob };
      const db = await openFileDb();
      await new Promise((res, rej) => {
        const tx = db.transaction(FILE_STORE, 'readwrite');
        tx.objectStore(FILE_STORE).put(rec);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      return rec.id;
    } catch (e) {
      return ''; // the claim still goes through; only the copy of the file is lost
    }
  }

  async function readKeptFile(id) {
    if (!id) return null;
    try {
      const db = await openFileDb();
      return await new Promise((res, rej) => {
        const tx = db.transaction(FILE_STORE, 'readonly');
        const req = tx.objectStore(FILE_STORE).get(id);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
    } catch (e) { return null; }
  }

  /* ---- Duplicate detection helpers ---- */
  // Fast, dependency-free hash of the file's base64 (identifies the exact same image).
  function cyrb53(str, seed) {
    seed = seed || 0;
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  // A content signature from the AI-read details (catches the same receipt re-photographed).
  function receiptSig(p) {
    const amt = parseFloat(p && p.amount);
    if (!p || (!p.date && !(amt > 0))) return '';
    const desc = (p.description || '').toLowerCase().replace(/\s+/g, ' ').trim();
    return [p.date || '', (isNaN(amt) ? '' : amt.toFixed(2)), (p.currency || '').toUpperCase(), desc].join('|');
  }
  // A retracted claim is not a live claim: nothing was paid on it, so it holds no receipts
  // and blocks nothing. That lets an employee delete a claim they got wrong and rebuild it
  // from the same slips. Every claim still standing keeps its receipts locked.
  function liveClaims() { return claims.filter(c => !c.deleted); }
  // Does a receipt fingerprint appear on a live claim other than this one?
  function receiptHolder(fp, exceptRef) {
    for (const c of liveClaims()) {
      if (exceptRef && c.ref === exceptRef) continue;
      for (const it of (c.other || [])) {
        if (fp.hash && it.hash && it.hash === fp.hash) return c.ref;
        if (fp.sig && it.sig && it.sig === fp.sig) return c.ref;
      }
    }
    return '';
  }
  // Is this receipt fingerprint already used on another line or a live previous claim?
  function isReceiptUsed(fp, exceptTr) {
    const rows = otherBody.querySelectorAll('tr');
    for (const r of rows) {
      if (r === exceptTr) continue;
      if (fp.hash && r.dataset.fileHash === fp.hash) return true;
      if (fp.sig && r.dataset.sig && r.dataset.sig === fp.sig) return true;
    }
    return !!receiptHolder(fp, editingRef);
  }
  const receiptProofSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>';
  function rejectReceipt(tr, btn, msg) {
    if (btn) { btn.classList.remove('has-photo', 'busy'); btn.innerHTML = receiptProofSvg + 'Proof'; }
    const input = tr.querySelector('.odo-input'); if (input) input.value = '';
    // The row keeps no trace of a rejected slip — including the copy that was kept of it.
    delete tr.dataset.fileHash; delete tr.dataset.sig; delete tr.dataset.fileId; delete tr.dataset.proofOnFile;
    showToast(msg, 6500);
  }
  // Signature of a whole disbursement (employee + all line items + total) to catch re-submissions.
  function claimSig(d) {
    const km = (d.km || []).map(r => [r.date, r.from, r.to, r.km, (+r.amount).toFixed(2)].join(',')).sort().join(';');
    const oth = (d.other || []).map(r => [r.date, (r.desc || '').toLowerCase().trim(), r.currency, (+r.amount).toFixed(2)].join(',')).sort().join(';');
    return [(fullName(d.employee) + '|' + (d.employee.number || '')).toLowerCase().trim(), km, oth, (+d.grandTotal).toFixed(2)].join('||');
  }
  // A route/distance signature for a travelling line (from + to + kilometres).
  function kmSig(r) {
    const from = (r.from || '').toLowerCase().trim();
    const to = (r.to || '').toLowerCase().trim();
    const km = parseFloat(r.km) || 0;
    if (!from || !to || !km) return '';
    return from + '|' + to + '|' + km;
  }
  // Does any travelling line here match the route + distance of a previous disbursement?
  function kmMatchesPrevious(kmList, exceptRef) {
    for (const r of (kmList || [])) {
      const sig = kmSig(r);
      if (!sig) continue;
      for (const c of liveClaims()) {
        if (exceptRef && c.ref === exceptRef) continue;
        for (const it of (c.km || [])) {
          if (kmSig(it) === sig) return true;
        }
      }
    }
    return false;
  }
  // Check a travelling list against a specific set of claims (used to recompute flags in order).
  function kmMatchesList(kmList, claimList) {
    for (const r of (kmList || [])) {
      const sig = kmSig(r);
      if (!sig) continue;
      for (const c of claimList) {
        for (const it of (c.km || [])) {
          if (kmSig(it) === sig) return true;
        }
      }
    }
    return false;
  }
  // Recompute every claim's flag so only a claim that repeats an EARLIER one stays flagged.
  // Retracted claims neither carry a flag nor raise one on the claims that follow them.
  function recomputeKmFlags() {
    const inOrder = claims.slice().sort((a, b) => new Date(a.submitted) - new Date(b.submitted));
    const seen = [];
    for (const c of inOrder) {
      if (c.deleted) { c.kmFlagged = false; continue; }
      c.kmFlagged = kmMatchesList(c.km, seen);
      seen.push(c);
    }
  }

  /* ---- Late-submission flag (policy 5.4: claim within 90 calendar days of the expense) ---- */
  const LATE_DAYS = 90;

  // "YYYY-MM-DD" from a date input, read as a local calendar date (never shifted by timezone).
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  // Whole days since the epoch, ignoring time of day, so the gap counts calendar days.
  // Line dates arrive as "YYYY-MM-DD" and are read as plain calendar dates; the submission
  // date is a Date (or the ISO string it becomes once saved) and is read as a local date.
  function dayNo(d) {
    if (!d) return null;
    const x = parseYmd(d) || new Date(d);
    if (isNaN(x.getTime())) return null;
    return Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000);
  }
  // Age of a claim's OLDEST expense, measured from the day it was submitted.
  // Deliberately measured against the submission date and not against today: once a
  // claim is in on time it stays on time, no matter how long payment afterwards takes.
  function claimAge(c) {
    const submitted = dayNo(c && c.submitted);
    if (submitted === null) return null;
    let oldest = null, oldestDate = '';
    [].concat((c && c.km) || [], (c && c.other) || []).forEach(r => {
      const n = dayNo(r && r.date);
      if (n !== null && (oldest === null || n < oldest)) { oldest = n; oldestDate = r.date; }
    });
    if (oldest === null) return null; // no dated expense lines — nothing to measure
    const days = submitted - oldest;
    return { days: days, date: oldestDate, late: days > LATE_DAYS };
  }
  function ageTipText(age) {
    return 'Disbursements claimed are older than 90 days of the expense being incurred. '
      + 'The oldest expense is dated ' + fmtDate(parseYmd(age.date))
      + ' — ' + age.days + ' calendar days before this claim was submitted (policy 5.4).';
  }

  async function readReceipt(file, tr, btn) {
    const dateInput = tr.querySelector('input[type=date]');
    const descInput = tr.querySelector('input[type=text]');
    const amtInput  = tr.querySelector('.amt-input');

    let b64;
    try {
      b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(file);
      });
    } catch (e) { return; }

    // 1) Exact-image duplicate — caught instantly, before even calling the AI.
    const fileHash = cyrb53(b64);
    if (isReceiptUsed({ hash: fileHash }, tr)) {
      rejectReceipt(tr, btn, 'Duplicate receipt rejected — this exact receipt has already been used.');
      return;
    }

    // Record the image fingerprint now, not after the AI has read it. Whether the reader
    // works has nothing to do with whether this is the same slip twice, and if it were only
    // recorded on success then the duplicate check would quietly stop working whenever the
    // reader was down.
    tr.dataset.fileHash = fileHash;

    const prevPlaceholder = descInput.placeholder;
    descInput.placeholder = 'Reading receipt…';
    if (btn) btn.classList.add('busy');

    try {
      const prompt = 'This is a receipt for an employee expense claim. Read it and respond with ONLY a JSON object — no markdown, no code fences, no commentary — in exactly this shape: {"date":"the purchase date as YYYY-MM-DD, or empty string if not visible","description":"a concise 2 to 5 word description of the purchase or merchant, suitable for an expense line","amount": the total amount paid as a plain number with no currency symbol or thousands separator, or 0 if not visible,"currency":"the three-letter ISO code of the currency on the receipt; must be one of ZAR, USD, EUR, AUD, BRL, PEN; use ZAR if you cannot tell"}.';
      const raw = await callAIProxy(b64, file.type || 'image/jpeg', prompt);
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);

      // 2) Content duplicate — same date + amount (+ merchant) as a receipt already captured.
      const sig = receiptSig(parsed);
      if (sig && isReceiptUsed({ sig }, tr)) {
        rejectReceipt(tr, btn, 'Duplicate receipt rejected — a receipt with the same date and amount has already been claimed.');
        descInput.placeholder = prevPlaceholder;
        return;
      }

      // Accept: add the content fingerprint too, then fill the details.
      if (sig) tr.dataset.sig = sig;

      if (parsed.date) dateInput.value = parsed.date;
      if (parsed.description) descInput.value = parsed.description;
      const amt = parseFloat(parsed.amount);
      if (!isNaN(amt) && amt > 0) amtInput.value = amt;
      const sel = tr.querySelector('.cur-select');
      if (sel && parsed.currency && CUR[parsed.currency]) sel.value = parsed.currency;
      recalc();
    } catch (e) {
      descInput.placeholder = 'Could not read it — please type the details in';
      setTimeout(() => { descInput.placeholder = prevPlaceholder; }, 4500);
    } finally {
      if (btn) btn.classList.remove('busy');
      if (descInput.placeholder === 'Reading receipt…') descInput.placeholder = prevPlaceholder;
    }
  }
  document.querySelectorAll('[data-add]').forEach(b =>
    b.addEventListener('click', () => addRow(b.dataset.add))
  );

  /* ---- Banking details: proof upload + AI reader ---- */
  const SA_BANKS = [
    'Absa Bank Limited', 'African Bank Limited', 'Bidvest Bank Limited', 'Capitec Bank Limited',
    'Discovery Bank Limited', 'FirstRand Limited', 'Investec Bank Limited', 'OM Bank Limited',
    'Nedbank Limited', 'Sasfin Bank Limited', 'The Standard Bank of South Africa Limited', 'GoTyme Bank Limited'
  ];
  (function () {
    const sel = document.getElementById('bankName');
    if (sel) SA_BANKS.forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
  })();

  // Machine list (cost-allocation dimension) — from Finance's custom financial dimension list.
  const MACHINES = ["Overheads", "009-A", "009-B", "009-C", "009-D", "009-E", "009-F", "009-G", "009-H", "009-I", "009-J", "009-P", "73R-DC", "24R", "41R", "41R-A", "41R-B", "41R-S", "43R-A ATL", "52R-A", "52R-B", "52R-C", "52R-E", "LP200-E", "LP200-F", "52R-I", "52R-J", "52R-K", "52R-M", "53R", "61R-A", "61R-B", "61R-C", "61R-D", "61R-E BALUBA", "61R-K", "61R-M", "61R-N", "61R-S", "61R-Z", "61R-ZC", "61R-ZD", "71R-A", "71R-B", "71R-BOESMAN", "71R-GATIEP", "71R-GHANA", "71R-M", "71R-N", "71R-O", "71R-P", "71R-Q", "71R-S", "71R-T", "71R-TS", "71R-Y (PAT)", "72R-A", "72R-L", "RD3-250LG", "73R-MUGABE", "DD52", "Bauer BG20 ADD", "BHB", "LP200-G", "LP200-I", "LP200-J", "Bauer BG28", "DD39 (M)", "MDX-308", "MDX-302", "MDX-309", "MDX-400", "MDX-311", "MDX-312", "MDX-314", "MDX-315", "MDX-316", "MDX-317", "MDX-318", "MDX-319", "MDX-320", "MDX-310", "MDX-321", "MDX-401", "DRESSER", "DTH-A", "DTH-B", "Gripper", "HG380", "LM-90-1", "LM-90-2", "LP200-A", "MD150-B", "MD150-C", "MD150-D", "MD150-E", "LM-90-3", "LM-90-4", "Orelyzer", "RBM6", "RBM6-M", "RBM7-1", "RBM7-2", "MDX-600", "MDX-601", "MDX-603", "RD1000", "RD2000-A", "RD2000-B", "RD2000-C", "RD2000-D", "RD3-250 LENA", "RD3-250A", "RD3-250B", "RD3-250C", "RD3-250D", "RD3-250E", "RD3-250F", "RD3-250G", "RD3-250H", "RD3A-250I", "RD3A-250J", "RD3A-250K", "RD3A-250L", "RD3A-250N", "RD3A-250O", "RD3A-250P", "RD3A-250Q", "RD3A-250R", "RD3A-250S", "RD3A-250T", "RD3A-250U", "RD3A-250V", "RD5-550D", "RD5-550E", "RD5-550G", "RD7-150B", "RD7-150C", "RD8-1500", "Stage", "ROBOT AMBILICAL - Spinnekop", "ROBOT SELF SUPPORT_ROSS & ROSIE", "ROBOT SHOTCRETE - Rabobi", "MDX-701", "MDX-702", "MDX-700", "UG60-001", "UG60-010", "UG60-015", "UG60-003", "RD3A-250MX", "43R-B", "RD11D-A", "RD11D-B ATL", "LM-30-1", "RD5-550H", "52R-F", "52R-N ATL", "52R-O ATL", "61R-O ATL", "71R-D ATL", "71R-E ATL", "RHINO 1000 2006 ATL", "RHINO 1000 2007 ATL", "RHINO 1000 2008 ATL", "RM12 ATL", "71R-C ATL", "61R-F", "MTB 0550-01", "LP200-B", "190 AMV", "43R", "LP200-C", "61R-R ATL", "82R-A ATL", "RD11D-C ATL", "Indau 250 HYD H1", "Indau 250 HYD H2", "Indau 500H M1", "Indau 500H M2", "Indau 500H M3", "Indau 500H M4", "Indau 90", "Rhino 1000 DC Bregenz", "Rhino 1000 DC Hoijer", "Rhino 1000 DC Kiruna", "Rhino 2000 DC", "RM10 ATL", "RM8 ATL", "RM7 ATL", "Robbins 61 AC", "Robbins R91 R1", "Robbins R91 R2", "Robbins R91 R3", "Robbins R91 R5", "LP200-D", "009-K", "MDX LY40", "MDX-322", "61R-P ATL", "61R-Q ATL", "RD6-A", "Robbins R91 R4", "RD3A-250M", "SBM11.5-2000", "MDX-324-UG", "009-L", "RC-01", "RC-02", "MDX-602", "RC-04", "RC-05", "MDX LY17", "MDX LY19", "MDX LY20", "MDX-324", "MDX-328", "MDX V013", "MDX-329", "MDX C45", "MDX C46", "MDX-327", "MDX LY32", "MDX LY26", "MDX LY34", "MDX LY23", "MDX LY27", "MDX LY24", "MDX LY44", "MDX-331", "MDX LY29", "MDX LY41", "UG-MEA002", "UG-MEH003", "SD-750 - Cargill", "009-M", "DD02", "MDX C03", "MDX LY06", "MDX V011", "MDX LY12", "MDX LY14", "MDX B015", "MDX V018", "MDX LY21", "MDX LY22", "MDX V025", "MDX LY31", "MDX LY33", "MDX LY38", "MDX LY42", "MDX DD043-AC01", "MDX LY47", "MDX L048", "MDX 604", "MDX 703-001", "MDX 704-002", "MDX 705-003", "MDX 706-004", "MDX 707-005", "Robot Shotcrete Doble Boquilla", "Robot Shotcrete Centrifugo 1", "MDX-708", "RD6-B", "MDX-323", "MDX-709", "MDX-900", "MDX-901", "DD039", "MDX-402", "MDX-403", "SCMREC-001", "SCMREC-002", "SCMREC-003", "SCMREC-004", "SCMREC-005", "91R-3", "91R-4", "RUCDR", "SBS", "ARM-Machine", "RBR 900", "009-O", "RD7-1000-A", "RD7-1000-B", "LP200-K", "LP200-L", "LP200-M", "LP200-N", "VectorZIEL800", "VectorEXAKT900", "LM-110-01", "LM-110-02", "LM-110-03", "53R-GH-1", "Shotcrete Robot - Spinnekop", "Shotcrete Robot - Mass 1", "73R-GH-1", "73R-GH-2", "73R-GH-3", "LM-110-04", "LM-110-05", "53R-GH-2", "RD8-1000-B", "LP100-A", "RD7-1000-C", "MDX-434", "MDX-711", "MDX-712", "RD3A-250W", "THOR 1200", "97R-GH-01", "RD6-DC-A", "RD6-DC-B", "RD6-DC-C", "VIP-01", "VIP-02", "009-N", "MDX-713", "SCMREC-006", "MDX-705", "RD5-550F", "MDX-714", "MDX-717", "All Machines 2020", "HCU01", "HCU02", "HCU03", "HCU04", "HCU05", "HC22", "HC33", "HC34", "HC35", "HC41", "HC43", "HC45", "HC48", "HC52", "HC60", "HC70", "HC17", "HC23", "HC31", "HC32", "HC42", "HC46", "HC50", "HC53", "HC59", "HC68", "HC69", "HC71", "Crawler-3 - CRW-20/3 (Chile)", "Crawler-4 - CRW-20/4 (Chile)", "DumperCrawler - Dump-01 (Chile)", "Crawler-6 - CRW20/6 (Chile)", "HC71 (Hall Core)", "ARM Project", "PCD", "Komatsu Project", "Consortium", "MDX-408", "73R_Anglo Gold Ashanti", "MDX-404", "MDX-405", "Van Zyl-Sonic Drilling", "Van Zyl-Reverse Circulation Drilling", "Van Zyl-Percussion Drilling", "Van Zyl-Diamond Drilling", "MDX-325", "MDX-326", "GOB PD01", "MDX-710", "Trio Drilling", "LP200-H", "MTB-Repmain-1623"];
  (function () {
    const input = document.getElementById('empMachine');
    const list = document.getElementById('machineList');
    if (!input || !list) return;
    let shown = [];
    let activeIdx = -1;

    function filter(q) {
      q = q.trim().toLowerCase();
      const all = withNA(MACHINES);
      const src = q ? all.filter(m => m.toLowerCase().includes(q)) : all;
      // No cap: the whole list must be reachable by scrolling, not only by typing.
      return src;
    }
    // Clicking into a box that already holds a value opens the whole list, not the one
    // entry that matches it — changing a choice should not mean deleting it first.
    function render(showAll) {
      shown = filter(showAll ? '' : input.value);
      activeIdx = -1;
      if (!shown.length) { list.innerHTML = '<div class="combo-empty">No matching machine</div>'; list.classList.remove('hidden'); return; }
      list.innerHTML = shown.map((m, i) => '<div class="combo-opt" data-i="' + i + '">' + m + '</div>').join('');
      list.classList.remove('hidden');
      if (showAll) showCurrentOption(list, shown, input.value);
    }
    function choose(m) { input.value = m; input.classList.remove('field-error'); list.classList.add('hidden'); }
    function highlight() {
      const opts = list.querySelectorAll('.combo-opt');
      opts.forEach((o, i) => o.classList.toggle('active', i === activeIdx));
      if (opts[activeIdx]) opts[activeIdx].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', () => render(true));
    input.addEventListener('input', () => render(false));
    input.addEventListener('keydown', e => {
      const opts = list.querySelectorAll('.combo-opt');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!opts.length) return; activeIdx = Math.min(activeIdx + 1, opts.length - 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!opts.length) return; activeIdx = Math.max(activeIdx - 1, 0); highlight(); }
      else if (e.key === 'Enter') { if (activeIdx >= 0 && shown[activeIdx]) { e.preventDefault(); choose(shown[activeIdx]); } }
      else if (e.key === 'Escape') { list.classList.add('hidden'); }
    });
    // mousedown fires before blur, so the selection registers before the field validates
    list.addEventListener('mousedown', e => {
      const opt = e.target.closest('.combo-opt');
      if (!opt) return;
      e.preventDefault();
      choose(shown[+opt.dataset.i]);
    });
    // Constrain: on leaving the field, the value must be an exact machine — otherwise clear it
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.classList.add('hidden');
        if (input.value && withNA(MACHINES).indexOf(input.value) === -1) input.value = '';
      }, 150);
    });
  })();
  const uploadSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>';
  let bankProofFileId = '';   // the kept copy of the letter attached in this session
  const bankProofInput = document.getElementById('bankProofInput');
  const bankProofBtn = document.getElementById('bankProofBtn');

  /* ---- Main vs Other banking details ----
     "Main" is the employee's remembered default account (persisted on this device and
     reloaded at login). "Other" is a one-off account for a single claim. Both are kept in
     memory during a session so switching between them never loses what was typed. The
     persisted Main only changes deliberately, via the "Update banking details" button.
     The AI letter reader works with whichever option is selected. */
  const bankTypeSel = document.getElementById('bankType');
  const bankHolderEl = document.getElementById('bankHolder');
  const bankNameEl = document.getElementById('bankName');
  const bankAccEl = document.getElementById('bankAcc');
  const bankTypeHint = document.getElementById('bankTypeHint');
  const updateBankBtn = document.getElementById('updateBankBtn');
  const MAIN_BANK_KEY = 'mdg-bank-main';

  const blankBank = () => ({ holder: '', bank: '', acc: '', proofName: '', proofFileId: '' });
  let currentBankType = 'main';

  function loadMainBank() {
    try { return JSON.parse(localStorage.getItem(MAIN_BANK_KEY) || 'null') || blankBank(); }
    catch (e) { return blankBank(); }
  }
  // Session copies so toggling Main/Other doesn't discard in-progress edits.
  const bankProfiles = { main: loadMainBank(), other: blankBank() };

  function readBankFields() {
    return {
      holder: bankHolderEl.value.trim(),
      bank: bankNameEl.value,
      acc: bankAccEl.value.trim(),
      proofName: (bankProofInput.files && bankProofInput.files[0]) ? bankProofInput.files[0].name
                 : (bankProofBtn.classList.contains('has-file') ? ((bankProofBtn.querySelector('.pf-label') || {}).textContent || '') : ''),
      // The kept copy of the letter, so a repeat claim carries it without re-uploading.
      proofFileId: bankProofFileId || ((bankProfiles[currentBankType] || {}).proofFileId) || ''
    };
  }
  function writeBankFields(d) {
    d = d || blankBank();
    bankHolderEl.value = d.holder || '';
    bankNameEl.value = d.bank || '';
    bankAccEl.value = d.acc || '';
    bankProofInput.value = '';
    bankProofFileId = d.proofFileId || '';   // switching profile switches which letter is in play
    bankProofBtn.classList.remove('field-error', 'busy');
    if (d.proofName) {
      bankProofBtn.classList.add('has-file');
      bankProofBtn.innerHTML = uploadSvg + '<span class="pf-label">' + escapeHtml(d.proofName) + '</span>';
    } else {
      bankProofBtn.classList.remove('has-file');
      bankProofBtn.innerHTML = uploadSvg + '<span class="pf-label">Upload bank confirmation letter</span>';
    }
    [bankHolderEl, bankNameEl, bankAccEl].forEach(el => el.classList.remove('field-error'));
  }
  // Persist the details currently on screen as the employee's remembered Main account.
  function commitMainBank() {
    const d = readBankFields();
    bankProfiles.main = d;
    try { localStorage.setItem(MAIN_BANK_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function updateBankHint() {
    if (!bankTypeHint) return;
    bankTypeHint.innerHTML = currentBankType === 'main'
      ? 'These are your remembered banking details and are filled in automatically each time you log in. Use “Update banking details” to change them.'
      : 'These details are for <strong>this claim only</strong> and are not saved. Use “Update banking details” to make them your remembered main account.';
    if (updateBankBtn) updateBankBtn.textContent = 'Update banking details';
  }

  if (bankTypeSel) {
    bankTypeSel.addEventListener('change', () => {
      bankProfiles[currentBankType] = readBankFields(); // remember what was on screen
      currentBankType = bankTypeSel.value;
      writeBankFields(bankProfiles[currentBankType]);
      updateBankHint();
    });
  }

  if (updateBankBtn) {
    updateBankBtn.addEventListener('click', () => {
      if (currentBankType === 'other') {
        // Unchanged: promote the currently-typed Other details to Main.
        showConfirm(
          'Are you sure that you want to update your banking details? Please ensure that the information is correct once the changes are accepted.',
          () => { commitMainBank(); showToast('Your main banking details have been updated.', 4500); },
          { okText: 'Confirm', okClass: 'btn-primary' }
        );
      } else {
        // Main: confirm, then upload a fresh bank letter to read and confirm.
        showConfirm(
          'You are about to update your main banking details. Are you certain that you would like to do this? If accepted, please ensure that the information is correct.',
          openBankUpdateModal,
          { okText: 'Upload new banking details', okClass: 'btn-primary' }
        );
      }
    });
  }

  /* ---- Update-main modal: upload a new bank letter, read it, then confirm ---- */
  const bankUpdateModal = document.getElementById('bankUpdateModal');
  const bankUpdateInput = document.getElementById('bankUpdateInput');
  const bankUpdateUploadBtn = document.getElementById('bankUpdateUploadBtn');
  const bankUpdateConfirm = document.getElementById('bankUpdateConfirm');
  let pendingMainBank = null;

  function matchBankName(raw) {
    if (!raw) return '';
    const key = String(raw).toLowerCase();
    let m = SA_BANKS.find(b => b.toLowerCase() === key);
    if (!m) m = SA_BANKS.find(b => b.toLowerCase().includes(key) || key.includes(b.toLowerCase().split(' ')[0]));
    return m || String(raw);
  }
  function openBankUpdateModal() {
    pendingMainBank = null;
    bankUpdateInput.value = '';
    bankUpdateUploadBtn.classList.remove('has-file', 'busy');
    bankUpdateUploadBtn.innerHTML = uploadSvg + '<span class="pf-label">Upload bank confirmation letter</span>';
    document.getElementById('bankUpdatePreview').classList.add('hidden');
    bankUpdateConfirm.disabled = true;
    bankUpdateModal.classList.remove('hidden');
  }
  function closeBankUpdateModal() { bankUpdateModal.classList.add('hidden'); }

  bankUpdateUploadBtn.addEventListener('click', () => bankUpdateInput.click());
  bankUpdateInput.addEventListener('change', async () => {
    const file = bankUpdateInput.files[0];
    if (!file) return;
    bankUpdateUploadBtn.classList.add('has-file', 'busy');
    bankUpdateUploadBtn.innerHTML = uploadSvg + '<span class="pf-label">Reading letter…</span>';
    bankUpdateConfirm.disabled = true;

    let b64;
    try {
      b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(file);
      });
    } catch (e) { return; }

    const mimeType = file.type === 'application/pdf' ? 'application/pdf' : (file.type || 'image/jpeg');
    try {
      const prompt = 'This is a bank account confirmation letter / proof of account. Read it and respond with ONLY a JSON object — no markdown, no code fences, no commentary — in exactly this shape: {"accountHolder":"the full name of the account holder","bank":"the bank, chosen as EXACTLY one of these options (or empty string if you cannot tell): ' + SA_BANKS.join('; ') + '","accountNumber":"the account number as digits only, no spaces or dashes"}. Use an empty string for any field you cannot read.';
      const raw = await callAIProxy(b64, mimeType, prompt);
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      pendingMainBank = {
        holder: parsed.accountHolder || '',
        bank: matchBankName(parsed.bank),
        acc: parsed.accountNumber ? String(parsed.accountNumber) : '',
        proofName: file.name,
        proofFileId: await keepFile(file)   // kept, so every later claim can carry it
      };
      document.getElementById('buHolder').textContent = pendingMainBank.holder || '—';
      document.getElementById('buBank').textContent = pendingMainBank.bank || '—';
      document.getElementById('buAcc').textContent = pendingMainBank.acc || '—';
      document.getElementById('bankUpdatePreview').classList.remove('hidden');
      bankUpdateConfirm.disabled = false;
      bankUpdateUploadBtn.innerHTML = uploadSvg + '<span class="pf-label">' + escapeHtml(file.name) + '</span>';
    } catch (e) {
      bankUpdateUploadBtn.innerHTML = uploadSvg + '<span class="pf-label">Could not read it — try another letter</span>';
    } finally {
      bankUpdateUploadBtn.classList.remove('busy');
    }
  });

  bankUpdateConfirm.addEventListener('click', () => {
    if (!pendingMainBank) return;
    bankProfiles.main = {
      holder: pendingMainBank.holder,
      bank: pendingMainBank.bank,
      acc: pendingMainBank.acc,
      proofName: pendingMainBank.proofName,
      proofFileId: pendingMainBank.proofFileId || ''
    };
    try { localStorage.setItem(MAIN_BANK_KEY, JSON.stringify(bankProfiles.main)); } catch (e) {}
    if (currentBankType === 'main') writeBankFields(bankProfiles.main);
    closeBankUpdateModal();
    showToast('Your main banking details have been updated.', 4500);
  });

  document.getElementById('bankUpdateClose').addEventListener('click', closeBankUpdateModal);
  document.getElementById('bankUpdateCancel').addEventListener('click', closeBankUpdateModal);
  bankUpdateModal.addEventListener('click', e => { if (e.target === bankUpdateModal) closeBankUpdateModal(); });

  bankProofBtn.addEventListener('click', () => bankProofInput.click());
  bankProofInput.addEventListener('change', () => {
    const f = bankProofInput.files[0];
    if (!f) return;
    bankProofBtn.classList.add('has-file');
    bankProofBtn.classList.remove('field-error');
    bankProofBtn.innerHTML = uploadSvg + '<span class="pf-label">' + f.name + '</span>';
    keepFile(f).then(id => {
      bankProofFileId = id;
      // The first letter uploaded for the main account is remembered, so every later claim
      // carries it without asking for it again. An account that already has one on file is
      // only changed through "Update banking details", which asks first.
      if (id && currentBankType === 'main' && !bankProfiles.main.proofFileId) {
        bankProfiles.main.proofName = f.name;
        bankProfiles.main.proofFileId = id;
        try { localStorage.setItem(MAIN_BANK_KEY, JSON.stringify(bankProfiles.main)); } catch (e) {}
      }
      readBankLetter(f);
    });
  });

  async function readBankLetter(file) {
    const holder = document.getElementById('bankHolder');
    const bank   = document.getElementById('bankName');
    const acc    = document.getElementById('bankAcc');
    const label  = bankProofBtn.querySelector('.pf-label');

    let b64;
    try {
      b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('read failed'));
        r.readAsDataURL(file);
      });
    } catch (e) { return; }

    bankProofBtn.classList.add('busy');
    if (label) label.textContent = 'Reading letter…';

    // Clear any details from a previous letter so the newest upload fully replaces them.
    holder.value = ''; bank.value = ''; acc.value = '';
    holder.classList.remove('field-error');
    bank.classList.remove('field-error');
    acc.classList.remove('field-error');

    const mimeType = file.type === 'application/pdf' ? 'application/pdf' : (file.type || 'image/jpeg');

    try {
      const prompt = 'This is a bank account confirmation letter / proof of account. Read it and respond with ONLY a JSON object — no markdown, no code fences, no commentary — in exactly this shape: {"accountHolder":"the full name of the account holder","bank":"the bank, chosen as EXACTLY one of these options (or empty string if you cannot tell): ' + SA_BANKS.join('; ') + '","accountNumber":"the account number as digits only, no spaces or dashes"}. Use an empty string for any field you cannot read.';
      const raw = await callAIProxy(b64, mimeType, prompt);
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (parsed.accountHolder) holder.value = parsed.accountHolder;
      if (parsed.bank) {
        const opts = Array.from(bank.options);
        const key = String(parsed.bank).toLowerCase();
        let match = opts.find(o => o.value.toLowerCase() === key);
        if (!match) match = opts.find(o => o.value && (o.value.toLowerCase().includes(key) || key.includes(o.value.toLowerCase().split(' ')[0])));
        if (match) bank.value = match.value;
      }
      if (parsed.accountNumber) acc.value = String(parsed.accountNumber);
      [holder, bank, acc].forEach(el => { if (el.value) el.classList.remove('field-error'); });
      bankProfiles[currentBankType] = readBankFields(); // keep the session copy in step
    } catch (e) {
      // Say so rather than leaving three blank boxes and no explanation. The letter is
      // still attached and still counts as proof — only the reading of it failed.
      showToast('Could not read the letter automatically. Your letter is attached — please type the account holder, bank and account number in yourself.', 8000);
    } finally {
      bankProofBtn.classList.remove('busy');
      if (label) label.textContent = file.name;
      if (!bankProofBtn.querySelector('.proof-check')) {
        const ck = document.createElement('span');
        ck.className = 'proof-check';
        ck.innerHTML = '&#10003;';
        bankProofBtn.appendChild(ck);
      }
    }
  }

  /* ---- Required-field validation on submit ---- */
  document.querySelectorAll('[data-required]').forEach(el =>
    el.addEventListener('input', () => el.classList.remove('field-error'))
  );
  const submitMsg = document.getElementById('submitMsg');
  document.getElementById('submitBtn').addEventListener('click', () => {
    let missing = 0;
    document.querySelectorAll('[data-required]').forEach(el => {
      const ok = el.value && el.value.trim() !== '';
      el.classList.toggle('field-error', !ok);
      if (!ok) missing++;
    });
    const proofOk = (bankProofInput.files && bankProofInput.files.length > 0)
      || bankProofBtn.classList.contains('has-file')
      || (editingRef && editingProofName);
    bankProofBtn.classList.toggle('field-error', !proofOk);
    if (!proofOk) missing++;

    if (missing > 0) {
      submitMsg.textContent = 'Please complete the required fields (marked *) and attach your proof of account before submitting.';
      submitMsg.className = 'submit-msg err';
      return;
    }

    // Every other-claims line must carry its proof of purchase. The odometer photo on a
    // travelling line is supplementary and is never required.
    const unproven = otherRowsMissingProof();
    otherBody.querySelectorAll('tr.row-error').forEach(tr => tr.classList.remove('row-error'));
    if (unproven.length) {
      unproven.forEach(tr => tr.classList.add('row-error'));
      switchTab('other');
      unproven[0].scrollIntoView({ block: 'center' });
      submitMsg.textContent = unproven.length === 1
        ? 'One of your other claims has no proof attached. Every claim line needs its receipt or invoice before it can be submitted.'
        : unproven.length + ' of your other claims have no proof attached. Every claim line needs its receipt or invoice before it can be submitted.';
      submitMsg.className = 'submit-msg err';
      return;
    }

    const data = collectClaim();

    if (editingRef) {
      // Update the recalled claim in place. It keeps its reference and its original
      // submission date, but NOT its approval progress: a changed claim goes back to the
      // HOD as a fresh request, so nothing can be added to a claim after it was approved.
      const c = claims.find(x => x.ref === editingRef);
      if (c) {
        c.employee = data.employee;
        c.banking = data.banking;
        if (!(bankProofInput.files && bankProofInput.files.length) && editingProofName) c.banking.proofName = editingProofName;
        c.km = data.km; c.other = data.other;
        c.kmTotal = data.kmTotal; c.otherTotal = data.otherTotal; c.grandTotal = data.grandTotal;

        c.status = 'Pending HOD';
        c.stage = 1; // submitted to the HOD again, from the start
        c.revision = (c.revision || 0) + 1;
        c.resubmittedAt = new Date();
        // The claim takes the date it actually reached the HOD in its current form, so the
        // 90-day rule runs to this submission and not to the one that was withdrawn. The
        // first submission is kept alongside it for the record.
        c.firstSubmitted = c.firstSubmitted || c.submitted;
        c.submitted = c.resubmittedAt;
        delete c.statusBeforeRecall; delete c.stageBeforeRecall;

        recomputeKmFlags();
        renderPrev(c.ref);
        submitMsg.textContent = 'Claim ' + c.ref + ' updated and sent to your HOD again. '
          + 'Any approval it had before falls away — it must be approved afresh.';
        submitMsg.className = 'submit-msg ok';
        saveClaims();
      }
      endEdit();
      resetForm();
      showView('previous');
    } else {
      // Whole-disbursement duplicate check (retracted claims are not in the running)
      const sig = claimSig(data);
      const dup = liveClaims().find(c => claimSig(c) === sig);
      if (dup) {
        submitMsg.textContent = 'This disbursement is identical to ' + dup.ref + ', which has already been submitted. Duplicate submissions are not allowed.';
        submitMsg.className = 'submit-msg err';
        return;
      }
      data.kmFlagged = kmMatchesPrevious(data.km, null);
      claims.unshift(data);
      renderPrev(data.ref);
      saveClaims();
      submitMsg.textContent = 'Claim ' + data.ref + ' submitted — it now appears under Previous Claims.'
        + (isMaterial(data) ? ' It is a material disbursement, so it goes to your HOD and then to the CFO for approval.' : '');
      submitMsg.className = 'submit-msg ok';
      if (isMaterial(data)) showToast(materialTipText(), 8000);
      clearDraft(); // the claim is in — the draft has served its purpose
      resetForm();
      showView('previous');
    }
  });

  /* ===== Claims: store, Previous Claims table, detail modal, PDF ===== */
  const LOGO_DATA = (document.querySelector('.logo img') || {}).src || null;
  const claims = [];
  let refSeq = 43; // next reference number

  // Persist claim history on the device so duplicate checks and Previous Claims survive reloads.
  // (Per-browser for now; the backend will make this permanent and shared.)
  function saveClaims() {
    try { localStorage.setItem('mdg-claims', JSON.stringify({ refSeq: refSeq, claims: claims })); } catch (e) {}
  }
  function loadClaims() {
    try {
      const d = JSON.parse(localStorage.getItem('mdg-claims') || '{}');
      if (Array.isArray(d.claims)) { claims.length = 0; d.claims.forEach(c => claims.push(c)); }
      if (typeof d.refSeq === 'number') refSeq = d.refSeq;
    } catch (e) {}
  }

  function fmtDate(d)     { return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }); }
  function fullName(e)    { return [(e && e.name) || '', (e && e.surname) || ''].filter(Boolean).join(' ').trim(); }
  function fmtDateTime(d) { return new Date(d).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  /* ---- Reference numbers ----
     The sequential part counts per browser, so on its own it would hand two employees the
     same number. Each reference therefore carries a suffix built from the moment it was
     created plus two random characters, which makes it unique across devices while the
     DSB-YYYY-NNNN part stays readable. The alphabet leaves out 0/O and 1/I so a reference
     can be read off a printed claim or repeated over the phone without ambiguity. */
  const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 unambiguous characters
  const REF_EPOCH = Date.UTC(2026, 0, 1); // counting from the project's first year keeps the suffix short

  function refEncode(n) {
    let out = '';
    n = Math.max(0, Math.floor(n));
    do {
      out = REF_ALPHABET[n % REF_ALPHABET.length] + out;
      n = Math.floor(n / REF_ALPHABET.length);
    } while (n > 0);
    return out;
  }
  function refRandom(len) {
    // 256 divides evenly by 32, so the modulo below draws each character with equal odds.
    const bytes = (window.crypto && window.crypto.getRandomValues)
      ? window.crypto.getRandomValues(new Uint8Array(len)) : null;
    let out = '';
    for (let i = 0; i < len; i++) {
      const n = bytes ? bytes[i] : Math.floor(Math.random() * 256);
      out += REF_ALPHABET[n % REF_ALPHABET.length];
    }
    return out;
  }
  function newRef() {
    const seq = String(refSeq++).padStart(4, '0'); // taken once: retries must not burn numbers
    const stem = 'DSB-' + new Date().getFullYear() + '-' + seq + '-';
    for (let tries = 0; tries < 50; tries++) {
      const ref = stem + refEncode(Date.now() - REF_EPOCH) + refRandom(2);
      if (!claims.some(c => c.ref === ref)) return ref;
    }
    // Never reached in practice — take a longer random tail rather than return a duplicate.
    return stem + refEncode(Date.now() - REF_EPOCH) + refRandom(6);
  }

  function typeLabel(c) {
    const k = c.kmTotal > 0, o = c.otherTotal > 0;
    if (k && o) return 'Travelling + Other';
    if (k) return 'Travelling';
    if (o) return 'Other claims';
    return '—';
  }
  // When the whole list opens over a box that already holds a value, put that value in view
  // and mark it, so changing a choice among hundreds does not start with a long scroll.
  function showCurrentOption(list, shown, value) {
    const i = shown.indexOf(value);
    if (i < 0) return;
    const opt = list.querySelectorAll('.combo-opt')[i];
    if (!opt) return;
    opt.classList.add('active');
    list.scrollTop = Math.max(0, opt.offsetTop - (list.clientHeight / 2) + (opt.offsetHeight / 2));
  }

  const DRAFT_TIP = 'This disbursement has not been submitted yet — there is nothing to view or print until it is.';

  // Recalled means the employee pulled it back and is working on it again, so to them it is
  // a draft. The stored status stays "Recalled" for the record; only the wording changes.
  function isRecalled(c) { return !!c && !c.deleted && c.status === 'Recalled'; }
  function statusLabel(c) { return isRecalled(c) ? 'Draft' : c.status; }

  // What a saved draft adds up to, for the row that shows it before it is submitted.
  function draftTotals(d) {
    const km = (d.km || []).reduce((s, r) => s + (parseFloat(r.km) || 0) * KM_RATE, 0);
    const other = (d.other || []).reduce((s, r) =>
      s + (parseFloat(r.amount) || 0) * (RATES[r.currency] || 1), 0);
    const type = km > 0 && other > 0 ? 'Travelling + Other'
      : km > 0 ? 'Travelling' : other > 0 ? 'Other claims' : '—';
    return { km: km, other: other, grand: km + other, type: type };
  }

  function pillFor(status) {
    const grey = status === 'Recalled' || status === 'Deleted' || status === 'Draft';
    const cls = status === 'Approved' ? 'pill-ok' : (status === 'Rejected' ? 'pill-no' : (grey ? 'pill-recalled' : 'pill-wait'));
    return '<span class="pill ' + cls + '">' + status + '</span>';
  }

  /* ---- Materiality: a large disbursement needs the CFO as well as the HOD ----
     Above the limit a claim is material, and its approval route gains a CFO step after the
     HOD. The routing itself is not built yet — no approval flow exists — so for now the
     app detects it, says so, and shows the longer route on the claim's progress. */
  const MATERIAL_LIMIT = 10000; // rand, excluding
  function isMaterial(c) { return !!c && +c.grandTotal > MATERIAL_LIMIT; }
  // Says a claim was pulled back, changed and sent to the HOD again — so an approver can
  // see they are looking at something different from what they may have seen before.
  function revisionTipText(c) {
    const n = c.revision || 0;
    return 'Revised claim — recalled and resubmitted to the HOD '
      + (n === 1 ? 'once' : n + ' times')
      + (c.resubmittedAt ? ', most recently on ' + fmtDateTime(c.resubmittedAt) : '')
      + (c.firstSubmitted ? '. It was first submitted on ' + fmtDateTime(c.firstSubmitted)
        + ', but the claim now stands on its latest submission date' : '') + '.';
  }

  function materialTipText() {
    return 'Material disbursement — above ' + money.format(MATERIAL_LIMIT) + '. It must be approved by '
      + 'your HOD and by the CFO before it can be paid.';
  }

  const STEPS = ['Filled in disbursement', 'Submitted to HOD', 'Submitted for payment', 'Disbursement paid'];
  const STEPS_MATERIAL = ['Filled in disbursement', 'Submitted to HOD', 'Approved by CFO', 'Submitted for payment', 'Disbursement paid'];
  function stepsFor(c) { return isMaterial(c) ? STEPS_MATERIAL : STEPS; }

  // Once the HOD has approved it, a disbursement is out of the employee's hands: it can no
  // longer be recalled for editing or deleted, so what Finance pays out is what was approved.
  function isHodApproved(c) {
    if (!c || c.deleted) return false;
    const s = (c.status || '').toLowerCase();
    if (s === 'approved' || s === 'paid') return true;
    // Past the approvers and with Finance. Read off the claim's own route, so inserting the
    // CFO step for a material claim does not shift what counts as approved.
    const payIdx = stepsFor(c).indexOf('Submitted for payment');
    return typeof c.stage === 'number' && c.stage >= payIdx;
  }
  const LOCKED_TIP = 'Approved by the HOD — this disbursement can no longer be recalled or deleted.';

  function stepperHtml(c, stage) {
    const nodes = stepsFor(c).map((s, i) =>
      '<div class="step' + (i <= stage ? ' done' : '') + (s === 'Approved by CFO' ? ' step-cfo' : '') +
      '"><span class="node"></span><span class="step-lbl">' + s + '</span></div>'
    ).join('');
    return '<div class="stepper"><div class="stepper-nodes">' + nodes + '</div></div>';
  }

  function renderPrev(highlightRef) {
    const tb = document.getElementById('prevRows');
    if (!tb) return;
    const sorted = claims.slice().sort((a, b) => new Date(b.submitted) - new Date(a.submitted));
    tb.innerHTML = '';

    // A saved draft has never been near the HOD, so it sits at the top with nothing to view
    // or print yet — only the work in progress and the chance to carry on with it.
    const draft = readDraft();
    if (draft && draftHasContent(draft)) {
      const totals = draftTotals(draft);
      const dr = document.createElement('tr');
      dr.className = 'claim-row draft-row';
      dr.innerHTML =
        '<td class="ref"><div class="ref-wrap"><span class="ref-no">Not submitted</span></div></td>' +
        '<td data-label="Saved">' + fmtDate(draft.savedAt) + '</td>' +
        '<td data-label="Type">' + totals.type + '</td>' +
        '<td class="col-amount" data-label="Amount (ZAR)">' + money.format(totals.grand) + '</td>' +
        '<td data-label="Status">' + pillFor('Draft') + '</td>' +
        '<td class="col-actions">' +
          '<button class="mini-btn" disabled title="' + DRAFT_TIP + '">View</button> ' +
          '<button class="mini-btn" disabled title="' + DRAFT_TIP + '">PDF</button> ' +
          '<button class="mini-btn" data-draft="1">Draft</button> ' +
          '<button class="mini-btn danger" data-draft-discard="1">Delete</button>' +
        '</td>';
      tb.appendChild(dr);
    }

    if (!sorted.length) {
      if (!tb.children.length) {
        tb.innerHTML = '<tr><td colspan="6" class="prev-empty">No claims submitted yet — a submitted claim will appear here.</td></tr>';
      }
      wirePrevActions(tb);
      return;
    }
    sorted.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'claim-row' + (c.ref === highlightRef ? ' row-new' : '') + (c.deleted ? ' deleted-row' : '');

      const badges = [];
      // No duplicate-kilometres badge here — that flag is for approvers, not the claimant.
      const age = claimAge(c);
      if (age && age.late) {
        badges.push('<span class="age-flag-badge" data-tip="' + escapeHtml(ageTipText(age)) + '">!</span>');
      }
      if (isMaterial(c)) {
        badges.push('<span class="material-badge" data-tip="' + escapeHtml(materialTipText()) + '">CFO</span>');
      }
      if (c.revision) {
        badges.push('<span class="revision-badge" data-tip="' + escapeHtml(revisionTipText(c)) + '">REV ' + c.revision + '</span>');
      }
      const flagBadges = badges.length ? '<div class="flag-badges">' + badges.join('') + '</div>' : '';

      // A deleted claim is retracted, not removed: its reference and record stay on file and
      // stay readable, but deletion is final, so it keeps only View and PDF. An approved claim
      // keeps both buttons, greyed out, so it is clear why they can no longer be used.
      const open = '<button class="mini-btn" data-view="' + c.ref + '">View</button> ' +
        '<button class="mini-btn" data-pdf="' + c.ref + '">PDF</button> ';
      // A claim that has been recalled is back in the employee's hands and not with anyone
      // else, so the button says Draft: pressing it carries on where they left off.
      const reopenLabel = isRecalled(c) ? 'Draft' : 'Recall';
      const actions = c.deleted
        ? open
        : isHodApproved(c)
          ? open + '<button class="mini-btn" disabled title="' + LOCKED_TIP + '">Recall</button> ' +
            '<button class="mini-btn" disabled title="' + LOCKED_TIP + '">Delete</button>'
          : open + '<button class="mini-btn" data-recall="' + c.ref + '">' + reopenLabel + '</button> ' +
            '<button class="mini-btn danger" data-delete="' + c.ref + '">Delete</button>';

      tr.innerHTML =
        '<td class="ref"><div class="ref-wrap"><span class="ref-no">' + c.ref + '</span>' + flagBadges + '</div></td>' +
        '<td data-label="Submitted">' + fmtDate(c.submitted) + '</td>' +
        '<td data-label="Type">' + typeLabel(c) + '</td>' +
        '<td class="col-amount" data-label="Amount (ZAR)">' + money.format(c.grandTotal) + '</td>' +
        '<td data-label="Status">' + pillFor(statusLabel(c)) + '</td>' +
        '<td class="col-actions">' + actions + '</td>';
      tb.appendChild(tr);

      const pr = document.createElement('tr');
      pr.className = 'progress-row' + (c.deleted ? ' deleted-row' : '');
      pr.innerHTML = '<td colspan="6">' + stepperHtml(c, typeof c.stage === 'number' ? c.stage : 1) + '</td>';
      tb.appendChild(pr);
    });
    wirePrevActions(tb);
  }

  function wirePrevActions(tb) {
    tb.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openClaim(claims.find(x => x.ref === b.dataset.view))));
    tb.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => generateFullPDF(claims.find(x => x.ref === b.dataset.pdf))));
    tb.querySelectorAll('[data-recall]').forEach(b => b.addEventListener('click', () => recallClaim(b.dataset.recall)));
    tb.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteClaim(b.dataset.delete)));
    tb.querySelectorAll('[data-draft]').forEach(b => b.addEventListener('click', () => {
      const d = readDraft();
      if (!d) { renderPrev(); return; }
      applyDraft(d);
      if (draftBanner) draftBanner.classList.add('hidden');
      showView('new');
      showToast('Carrying on with your saved draft. It is not with the HOD until you submit it.', 5500);
    }));
    tb.querySelectorAll('[data-draft-discard]').forEach(b => b.addEventListener('click', () => {
      showConfirm('Discard the saved draft? Everything on it will be lost.', () => {
        clearDraft();
        renderPrev();
        showToast('Draft discarded.', 3000);
      });
    }));
  }

  // ---- Recall: reopen a claim into New Claim for editing (progress is preserved) ----
  let editingRef = null;
  let editingProofName = '';
  let editingProofFileId = '';   // the letter already on the claim being edited
  const editBanner = document.getElementById('editBanner');
  const submitBtnEl = document.getElementById('submitBtn');

  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; }

  function fillKmRow(tr, r) {
    tr.querySelector('input[type=date]').value = r.date || '';
    const texts = tr.querySelectorAll('input[type=text]');
    if (texts[0]) texts[0].value = r.from || '';
    if (texts[1]) texts[1].value = r.to || '';
    tr.querySelector('.km-input').value = r.km || '';
    if (r.fileId) tr.dataset.fileId = r.fileId;
  }
  function fillOtherRow(tr, r) {
    tr.querySelector('input[type=date]').value = r.date || '';
    tr.querySelector('input[type=text]').value = r.desc || '';
    const sel = tr.querySelector('.cur-select'); if (sel) sel.value = r.currency || 'ZAR';
    tr.querySelector('.amt-input').value = (r.amount != null ? r.amount : '');
    if (r.hash) tr.dataset.fileHash = r.hash;
    if (r.sig) tr.dataset.sig = r.sig;
    if (r.fileId) tr.dataset.fileId = r.fileId;   // restoreRowFiles puts the file back on it
    // A claim recalled from before files were kept has the proof on record but no copy of it.
    if (r.hasProof && !r.fileId) {
      tr.dataset.proofOnFile = '1';
      const btn = tr.querySelector('.odo-btn');
      if (btn) { btn.classList.add('has-file'); btn.innerHTML = receiptProofSvg + 'On file'; }
    }
  }

  function populateForm(c) {
    // Identity always comes from the signed-in user, never from the stored claim.
    applySessionUser();
    setVal('empSite', c.employee.site);
    setVal('empMachine', c.employee.machine);
    setVal('empProject', c.employee.project);
    setVal('empCostCentre', c.employee.costCentre);
    setVal('carReg', c.employee.carReg);
    setVal('bankHolder', c.banking.holder);
    setVal('bankName', c.banking.bank);
    setVal('bankAcc', c.banking.acc);
    currentBankType = c.banking.type === 'other' ? 'other' : 'main';
    if (bankTypeSel) bankTypeSel.value = currentBankType;
    updateBankHint();

    // Show the previously-attached proof (the file itself can't be restored, but it still counts).
    bankProofBtn.classList.remove('field-error', 'busy');
    if (c.banking.proofName) {
      bankProofBtn.classList.add('has-file');
      bankProofBtn.innerHTML = uploadSvg + '<span class="pf-label">' + escapeHtml(c.banking.proofName) + ' (on file)</span>';
    }

    kmBody.innerHTML = '';
    if (c.km && c.km.length) c.km.forEach(r => { addRow('km'); fillKmRow(kmBody.lastElementChild, r); });
    else { addRow('km'); }

    otherBody.innerHTML = '';
    if (c.other && c.other.length) c.other.forEach(r => { addRow('other'); fillOtherRow(otherBody.lastElementChild, r); });
    else { addRow('other'); }

    recalc();
  }

  function startEdit(ref, proofName, proofFileId) {
    editingRef = ref;
    editingProofName = proofName || '';
    editingProofFileId = proofFileId || '';
    document.getElementById('editRef').textContent = ref;
    if (editBanner) editBanner.classList.remove('hidden');
    if (submitBtnEl) submitBtnEl.textContent = 'Update claim';
  }
  function endEdit() {
    editingRef = null;
    editingProofName = '';
    editingProofFileId = '';
    if (editBanner) editBanner.classList.add('hidden');
    if (submitBtnEl) submitBtnEl.textContent = 'Submit to HOD';
  }
  document.getElementById('cancelEdit').addEventListener('click', () => {
    // Nothing was changed, so put the claim back where it was rather than leaving it
    // withdrawn from the HOD.
    const c = claims.find(x => x.ref === editingRef);
    if (c && c.status === 'Recalled') {
      c.status = c.statusBeforeRecall || 'Pending HOD';
      c.stage = typeof c.stageBeforeRecall === 'number' ? c.stageBeforeRecall : 1;
      delete c.statusBeforeRecall; delete c.stageBeforeRecall; delete c.recalledAt;
      saveClaims();
      renderPrev();
      showToast('Edit cancelled. Disbursement ' + c.ref + ' is back with your HOD, unchanged.', 5000);
    }
    endEdit();
    resetForm();
    if (submitMsg) { submitMsg.textContent = ''; submitMsg.className = 'submit-msg'; }
    showView('previous');
  });

  function recallClaim(ref) {
    const c = claims.find(x => x.ref === ref);
    if (!c) return;
    if (c.deleted) { showToast('Disbursement ' + ref + ' was deleted and cannot be reopened. Its receipts are free, so submit a corrected claim as a new disbursement.', 6000); return; }
    if (isHodApproved(c)) { showToast('Disbursement ' + ref + ' has been approved by the HOD and can no longer be recalled.', 5000); return; }

    // Recalling withdraws the claim from the HOD there and then. What the HOD was asked to
    // approve is no longer what the employee is holding, so it may not sit in their queue
    // while it is being changed. Submitting again sends it back as a fresh request.
    c.statusBeforeRecall = c.status;
    c.stageBeforeRecall = typeof c.stage === 'number' ? c.stage : 1;
    c.status = 'Recalled';
    c.stage = 0; // back to "filled in" — no longer with the HOD
    c.recalledAt = new Date();
    saveClaims();
    renderPrev();

    populateForm(c);
    startEdit(ref, c.banking.proofName, c.banking.proofFileId);
    if (submitMsg) { submitMsg.textContent = ''; submitMsg.className = 'submit-msg'; }
    showView('new');
    showToast('Disbursement ' + ref + ' has been withdrawn from your HOD while you edit it. Submitting again sends it back to them for approval.', 7000);
  }

  // ---- Delete: retract the disbursement, never remove it ----
  // Reference numbers may not go missing from the sequence, so a deleted claim is greyed
  // out and pulled back from the HOD while the record stays on file for audit.
  function deleteClaim(ref) {
    const c = claims.find(x => x.ref === ref);
    if (!c || c.deleted) return;
    if (isHodApproved(c)) {
      showToast('Disbursement ' + ref + ' has been approved by the HOD and can no longer be deleted.', 5000);
      return;
    }
    showConfirm('Delete disbursement ' + ref + '? It will be retracted from the HOD and greyed out, and this '
      + 'cannot be undone — a deleted disbursement can never be brought back. The record and its reference '
      + 'number stay on file for audit, and the receipts on it are released.', () => {
      c.deleted = true;
      c.deletedAt = new Date();
      c.statusBefore = c.status;                              // where it stood when it was pulled
      c.stageBefore = typeof c.stage === 'number' ? c.stage : 1;
      c.status = 'Deleted';
      c.stage = 0; // retracted — back to "filled in", no longer with the HOD
      if (editingRef === ref) { endEdit(); resetForm(); }
      recomputeKmFlags();
      renderPrev();
      saveClaims();
      showToast('Disbursement ' + ref + ' deleted and retracted from the HOD for good. Its receipts are free to use on a new claim; the record stays on file for audit.', 7000);
    });
  }

  function collectClaim() {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const km = [];
    kmBody.querySelectorAll('tr').forEach(tr => {
      const date = tr.querySelector('input[type=date]').value;
      const texts = tr.querySelectorAll('input[type=text]');
      const dist = parseFloat(tr.querySelector('.km-input').value) || 0;
      const hasPhoto = !!tr.querySelector('.odo-thumb');
      if (dist > 0 || date || (texts[0] && texts[0].value)) {
        km.push({ date, from: texts[0] ? texts[0].value : '', to: texts[1] ? texts[1].value : '', km: dist, amount: dist * KM_RATE, hasPhoto, fileId: tr.dataset.fileId || '' });
      }
    });

    const other = [];
    otherBody.querySelectorAll('tr').forEach(tr => {
      const date = tr.querySelector('input[type=date]').value;
      const desc = tr.querySelector('input[type=text]').value;
      const cur = tr.querySelector('.cur-select').value;
      const amt = parseFloat(tr.querySelector('.amt-input').value) || 0;
      const hasProof = rowHasProof(tr);
      if (amt > 0 || date || desc) {
        other.push({ date, desc, currency: cur, amount: amt, rate: RATES[cur] || 1, zar: amt * (RATES[cur] || 1), hasProof, fileId: tr.dataset.fileId || '', hash: tr.dataset.fileHash || '', sig: tr.dataset.sig || '' });
      }
    });

    const kmTotal = km.reduce((s, r) => s + r.amount, 0);
    const otherTotal = other.reduce((s, r) => s + r.zar, 0);
    const proofFile = bankProofInput.files[0];

    return {
      ref: newRef(),
      submitted: new Date(),
      status: 'Pending HOD',
      stage: 1, // 0 filled in · 1 submitted to HOD · 2 submitted for payment · 3 paid
      employee: {
        name: val('empName'), surname: val('empSurname'), number: val('empNumber'), email: val('empEmail'),
        site: val('empSite'), machine: val('empMachine'), project: val('empProject'),
        costCentre: val('empCostCentre'), carReg: val('carReg')
      },
      banking: {
        holder: val('bankHolder'), bank: val('bankName'), acc: val('bankAcc'),
        type: currentBankType,
        proofName: proofFile ? proofFile.name : (readBankFields().proofName || ''),
        proofFileId: bankProofFileId || editingProofFileId || ''
      },
      km, other, kmTotal, otherTotal, grandTotal: kmTotal + otherTotal
    };
  }

  /* ===== Save draft =====
     Keeps a half-finished claim on the device so it survives closing the tab. Uploaded
     files cannot be stored, so a restored draft asks for its proofs again — the claim
     still cannot be submitted without them. */
  const DRAFT_KEY = 'mdg-draft';

  function collectDraft() {
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    // The uploaded files themselves are already kept (see keepFile); the draft only has to
    // remember which ones, along with the fingerprints that catch a duplicate receipt.
    const km = [...kmBody.querySelectorAll('tr')].map(tr => {
      const texts = tr.querySelectorAll('input[type=text]');
      return { date: tr.querySelector('input[type=date]').value,
               from: texts[0] ? texts[0].value : '', to: texts[1] ? texts[1].value : '',
               km: tr.querySelector('.km-input').value,
               fileId: tr.dataset.fileId || '' };
    });
    const other = [...otherBody.querySelectorAll('tr')].map(tr => ({
      date: tr.querySelector('input[type=date]').value,
      desc: tr.querySelector('input[type=text]').value,
      currency: tr.querySelector('.cur-select').value,
      amount: tr.querySelector('.amt-input').value,
      fileId: tr.dataset.fileId || '',
      hash: tr.dataset.fileHash || '',
      sig: tr.dataset.sig || ''
    }));
    return {
      savedAt: new Date().toISOString(),
      site: val('empSite'), machine: val('empMachine'), project: val('empProject'),
      costCentre: val('empCostCentre'), carReg: val('carReg'),
      bank: { holder: val('bankHolder'), bank: val('bankName'), acc: val('bankAcc'),
              type: currentBankType, proofFileId: bankProofFileId || '' },
      km, other,
      proofCount: km.concat(other).filter(r => r.fileId).length
    };
  }
  function draftHasContent(d) {
    // The currency box always holds ZAR, so it never counts as something typed in.
    const filled = (r, skip) => Object.keys(r).some(k => (skip || []).indexOf(k) === -1 && String(r[k] || '').trim() !== '');
    return !!(d.site || d.machine || d.project || d.costCentre || d.carReg
      || d.km.some(r => filled(r))
      || d.other.some(r => filled(r, ['currency'])));
  }
  function saveDraft() {
    const d = collectDraft();
    if (!draftHasContent(d)) { showToast('There is nothing to save yet — fill something in first.', 4000); return; }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      renderPrev();
      showToast(d.proofCount
        ? 'Draft saved on this device, with the ' + d.proofCount + ' file' + (d.proofCount > 1 ? 's' : '') + ' you attached. Reopen the app to carry on where you left off.'
        : 'Draft saved on this device. Reopen the app to carry on where you left off.', 6000);
    } catch (e) {
      showToast('Could not save the draft — this device is out of storage space.', 5000);
    }
  }
  function readDraft() {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return (d && d.km && d.other) ? d : null; }
    catch (e) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    if (draftBanner) draftBanner.classList.add('hidden');
    renderPrev();
  }
  function applyDraft(d) {
    setVal('empSite', d.site); setVal('empMachine', d.machine); setVal('empProject', d.project); setVal('empCostCentre', d.costCentre); setVal('carReg', d.carReg);
    if (d.bank) {
      setVal('bankHolder', d.bank.holder); setVal('bankName', d.bank.bank); setVal('bankAcc', d.bank.acc);
      currentBankType = d.bank.type === 'other' ? 'other' : 'main';
      if (bankTypeSel) bankTypeSel.value = currentBankType;
      if (d.bank.proofFileId) bankProofFileId = d.bank.proofFileId;
      updateBankHint();
    }
    kmBody.innerHTML = '';
    (d.km.length ? d.km : [{}]).forEach(r => { addRow('km'); fillKmRow(kmBody.lastElementChild, r); });
    otherBody.innerHTML = '';
    (d.other.length ? d.other : [{}]).forEach(r => { addRow('other'); fillOtherRow(otherBody.lastElementChild, r); });
    // The files were kept when they were uploaded, so put them back on their rows.
    restoreRowFiles(kmBody);
    restoreRowFiles(otherBody);
    recalc();
  }

  // Puts an already-kept file back onto its row: the thumbnail for a photograph, and either
  // way a mark that the row's proof is present, so the line is not asked for it again.
  async function restoreRowFiles(body) {
    for (const tr of body.querySelectorAll('tr')) {
      const id = tr.dataset.fileId;
      if (!id) continue;
      const rec = await readKeptFile(id);
      const btn = tr.querySelector('.odo-btn');
      if (!rec || !btn) continue;
      tr.dataset.proofOnFile = '1';
      if (/^image\//.test(rec.type)) {
        const url = URL.createObjectURL(rec.blob);
        btn.classList.remove('busy');
        btn.classList.add('has-photo');
        btn.innerHTML = '<img class="odo-thumb" src="' + url + '" alt="Attached proof">' +
          '<span class="odo-ok" title="Proof attached">&#10003;</span>';
      } else {
        btn.classList.add('has-file');
        btn.innerHTML = receiptProofSvg + 'On file';
      }
    }
  }

  const draftBanner = document.getElementById('draftBanner');
  function showDraftBanner(d) {
    if (!draftBanner) return;
    document.getElementById('draftBannerText').textContent =
      'You saved a draft on ' + fmtDateTime(d.savedAt) + '.'
      + (d.proofCount ? ' The ' + d.proofCount + ' file' + (d.proofCount > 1 ? 's' : '') + ' you attached ' + (d.proofCount > 1 ? 'are' : 'is') + ' still on it.' : '');
    draftBanner.classList.remove('hidden');
  }
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  if (saveDraftBtn) saveDraftBtn.addEventListener('click', saveDraft);
  const draftRestoreBtn = document.getElementById('draftRestore');
  if (draftRestoreBtn) draftRestoreBtn.addEventListener('click', () => {
    const d = readDraft();
    if (!d) { clearDraft(); return; }
    applyDraft(d);
    draftBanner.classList.add('hidden');
    showToast('Draft restored.', 3500);
  });
  const draftDiscardBtn = document.getElementById('draftDiscard');
  if (draftDiscardBtn) draftDiscardBtn.addEventListener('click', () => {
    showConfirm('Discard the saved draft? Anything in it that you have not restored will be lost.', () => {
      clearDraft();
      showToast('Draft discarded.', 3000);
    });
  });

  function resetForm() {
    bankProofFileId = '';
    kmBody.innerHTML = ''; addRow('km'); addRow('km');
    otherBody.innerHTML = ''; addRow('other'); addRow('other');
    const carReg = document.getElementById('carReg'); if (carReg) carReg.value = '';
    // Return to the saved main banking profile for the next claim.
    currentBankType = 'main';
    if (bankTypeSel) bankTypeSel.value = 'main';
    bankProfiles.main = loadMainBank();
    bankProfiles.other = blankBank();
    writeBankFields(bankProfiles.main);
    updateBankHint();
    recalc();
  }

  function showView(view) {
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.remove('hidden');
  }

  /* ---- Detail modal ---- */
  const modal = document.getElementById('claimModal');
  let modalClaim = null;

  function row2(a, b) { return '<tr><th>' + a + '</th><td>' + (b || '—') + '</td></tr>'; }
  function buildDetail(c) {
    let h = '';
    if (c.deleted) {
      h += '<div class="deleted-note">Deleted on ' + fmtDateTime(c.deletedAt || c.submitted) +
        '. This disbursement has been retracted from the HOD and will not be paid. It cannot be reopened or '
        + 'restored. It is kept on file, with its reference number, for audit purposes. The receipts on it '
        + 'have been released and may be claimed again on a new disbursement.</div>';
    }
    h += '<table class="detail-kv">' +
      row2('Employee', fullName(c.employee)) +
      row2('Employee number', c.employee.number) +
      row2('Email', c.employee.email) + row2('Site', c.employee.site) +
      row2('Machine', c.employee.machine) +
      row2('Project', c.employee.project) +
      row2('Cost centre', c.employee.costCentre) +
      row2('Car registration', c.employee.carReg) + '</table>';

    h += '<h4>Banking details</h4><table class="detail-kv">' +
      row2('Account holder', c.banking.holder) + row2('Bank', c.banking.bank) +
      row2('Account number', c.banking.acc) + row2('Proof of account', c.banking.proofName) + '</table>';

    if (c.km.length) {
      h += '<h4>Travelling claim</h4><table class="detail-tbl"><tr><th>Date</th><th>From</th><th>To</th><th>Km</th><th style="text-align:right">Amount</th></tr>';
      c.km.forEach(r => h += '<tr><td>' + (r.date || '—') + '</td><td>' + (r.from || '') + '</td><td>' + (r.to || '') + '</td><td>' + r.km + '</td><td style="text-align:right">' + money.format(r.amount) + '</td></tr>');
      h += '<tr class="tot"><td colspan="4">Total</td><td style="text-align:right">' + money.format(c.kmTotal) + '</td></tr></table>';
    }
    if (c.other.length) {
      h += '<h4>Other claims</h4><table class="detail-tbl"><tr><th>Date</th><th>Description</th><th>Cur</th><th style="text-align:right">Amount</th><th style="text-align:right">ZAR</th></tr>';
      c.other.forEach(r => h += '<tr><td>' + (r.date || '—') + '</td><td>' + (r.desc || '') + '</td><td>' + r.currency + '</td><td style="text-align:right">' + r.amount.toFixed(2) + '</td><td style="text-align:right">' + money.format(r.zar) + '</td></tr>');
      h += '<tr class="tot"><td colspan="4">Total</td><td style="text-align:right">' + money.format(c.otherTotal) + '</td></tr></table>';
    }
    h += attachmentsHtml(c);
    h += '<h4>Summary</h4><table class="detail-kv">' +
      row2('Travelling', money.format(c.kmTotal)) + row2('Other claims', money.format(c.otherTotal)) +
      '<tr class="tot"><th>Grand total</th><td>' + money.format(c.grandTotal) + '</td></tr></table>';
    // The duplicate-kilometres flag is not shown on the claim: the claimant opens this too.
    const age = claimAge(c);
    if (age && age.late) {
      h += '<div class="km-flag" style="margin-top:18px;">' + escapeHtml(ageTipText(age)) +
        ' Late submissions may be declined unless exceptional circumstances are justified and approved by a senior manager.</div>';
    }
    if (c.revision) {
      h += '<div class="km-flag" style="margin-top:18px;">' + escapeHtml(revisionTipText(c)) +
        ' Any approval it had before that falls away — it must be approved as it now stands.</div>';
    }
    if (isMaterial(c)) {
      h += '<div class="material-flag" style="margin-top:18px;"><strong>Material disbursement.</strong> ' +
        'At ' + money.format(c.grandTotal) + ' this claim is above ' + money.format(MATERIAL_LIMIT) +
        ', so it must be approved by the requestor’s HOD and by the CFO before it can be paid.</div>';
    }
    return h;
  }

  /* ---- Attachments on the claim detail ----
     Everything uploaded on the claim, so it can be checked before or after it goes to the
     HOD. Files kept on this device open in place; older claims kept only the file name. */
  function attachmentList(c) {
    const items = [];
    if (c.banking && (c.banking.proofFileId || c.banking.proofName)) {
      items.push({ id: c.banking.proofFileId || '', label: 'Proof of account', name: c.banking.proofName || 'Bank confirmation letter' });
    }
    (c.other || []).forEach((r, i) => {
      if (!r.fileId && !r.hasProof) return;
      items.push({ id: r.fileId || '', label: 'Proof — ' + (r.desc || 'other claim ' + (i + 1)), name: money.format(r.zar || 0) });
    });
    (c.km || []).forEach((r, i) => {
      if (!r.fileId && !r.hasPhoto) return;
      const trip = [r.from, r.to].filter(Boolean).join(' → ') || 'trip ' + (i + 1);
      items.push({ id: r.fileId || '', label: 'Odometer — ' + trip, name: (r.km || 0) + ' km' });
    });
    return items;
  }

  function attachmentsHtml(c) {
    const items = attachmentList(c);
    if (!items.length) return '';
    return '<h4>Attachments</h4><div class="attach-grid">' + items.map(it =>
      '<div class="attach' + (it.id ? '' : ' attach-missing') + '"' + (it.id ? ' data-file="' + it.id + '"' : '') + '>' +
        '<div class="attach-thumb" data-thumb="' + escapeHtml(it.id) + '">' + (it.id ? '' : '—') + '</div>' +
        '<div class="attach-meta"><span class="attach-label">' + escapeHtml(it.label) + '</span>' +
        '<span class="attach-name">' + escapeHtml(it.id ? it.name : 'file not kept on this device') + '</span></div>' +
      '</div>').join('') + '</div>';
  }

  // Fill in the thumbnails once the modal is on screen, and open a file when one is clicked.
  async function wireAttachments(root) {
    const cells = [...root.querySelectorAll('.attach[data-file]')];
    for (const cell of cells) {
      const rec = await readKeptFile(cell.dataset.file);
      const thumb = cell.querySelector('.attach-thumb');
      if (!rec) { cell.classList.add('attach-missing'); thumb.textContent = '—';
        cell.querySelector('.attach-name').textContent = 'file no longer on this device'; continue; }
      cell._rec = rec;
      if (/^image\//.test(rec.type)) {
        const url = URL.createObjectURL(rec.blob);
        thumb.innerHTML = '<img src="' + url + '" alt="">';
      } else {
        thumb.textContent = 'PDF';
      }
      cell.addEventListener('click', () => openAttachment(rec));
    }
  }

  function openAttachment(rec) {
    const url = URL.createObjectURL(rec.blob);
    if (/^image\//.test(rec.type)) {
      const box = document.getElementById('lightbox');
      document.getElementById('lightboxImg').src = url;
      document.getElementById('lightboxName').textContent = rec.name || '';
      box.classList.remove('hidden');
    } else {
      window.open(url, '_blank'); // a PDF opens in its own tab
    }
  }

  function openClaim(c) {
    if (!c) return;
    modalClaim = c;
    document.getElementById('mRef').textContent = c.ref;
    document.getElementById('mSub').textContent = 'Submitted ' + fmtDateTime(c.submitted) + '  ·  ' + statusLabel(c);
    document.getElementById('mBody').innerHTML = buildDetail(c);
    modal.classList.remove('hidden');
    wireAttachments(document.getElementById('mBody'));
  }
  const lightbox = document.getElementById('lightbox');
  function closeLightbox() {
    lightbox.classList.add('hidden');
    const img = document.getElementById('lightboxImg');
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.removeAttribute('src');
  }
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox(); });

  function closeModal() { modal.classList.add('hidden'); }
  document.getElementById('mClose').addEventListener('click', closeModal);
  document.getElementById('mCloseBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('mPdf').addEventListener('click', () => { if (modalClaim) generateFullPDF(modalClaim); });

  /* ---- Confirmation dialog ---- */
  const confirmModal = document.getElementById('confirmModal');
  let confirmCb = null;
  function showConfirm(message, onConfirm, opts) {
    opts = opts || {};
    document.getElementById('confirmMsg').textContent = message;
    const ok = document.getElementById('confirmOk');
    ok.textContent = opts.okText || 'Delete';
    ok.className = 'btn ' + (opts.okClass || 'btn-delete');
    confirmCb = onConfirm;
    confirmModal.classList.remove('hidden');
  }
  function hideConfirm() { confirmModal.classList.add('hidden'); confirmCb = null; }
  document.getElementById('confirmCancel').addEventListener('click', hideConfirm);
  document.getElementById('confirmOk').addEventListener('click', () => { const cb = confirmCb; hideConfirm(); if (cb) cb(); });
  confirmModal.addEventListener('click', e => { if (e.target === confirmModal) hideConfirm(); });

  /* ---- PDF (mirrors FRM-MDS-FIN-0002-E) ---- */
  function showToast(msg, ms) {
    let t = document.getElementById('mdgToast');
    if (!t) { t = document.createElement('div'); t.id = 'mdgToast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), ms || 6000);
  }

  /* ---- Attachments inside the PDF ----
     Everything uploaded on the claim is carried in the same file, so the form and the
     evidence for it cannot be separated once it leaves the app. */

  // pdf-lib is only needed when an attachment is itself a PDF, so it is fetched then
  // rather than loaded on every visit — it is half a megabyte.
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
      s.onload = () => resolve(window.PDFLib);
      s.onerror = () => reject(new Error('pdf-lib did not load'));
      document.head.appendChild(s);
    });
    return pdfLibPromise;
  }

  // Read an image at its own size, as JPEG, ready to place on a page.
  function imageForPdf(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: cv.toDataURL('image/jpeg', 0.9), w: cv.width, h: cv.height });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image did not load')); };
      img.src = url;
    });
  }

  function generatePDF(c, opts) {
    opts = opts || {};   // { defer: true } hands the document back instead of saving it
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('The PDF library hasn\u2019t loaded — this can happen offline or when the in-app preview blocks external libraries. Open the app in a browser and try again.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
      showToast('The PDF layout plugin didn\u2019t load. Open the app directly in a browser (not this in-app preview) and try again.');
      return;
    }
    const pageW = doc.internal.pageSize.getWidth();
    const M = 40;
    const NAVY = [30, 50, 90];
    let y = 40;

    if (LOGO_DATA) { try { doc.addImage(LOGO_DATA, 'PNG', M, y, 42, 42); } catch (e) {} }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('Master Drilling South Africa', M + 54, y + 14);
    doc.setFontSize(12); doc.text('Disbursement Form', M + 54, y + 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Form No: FRM-MDS-FIN-0002-E   Rev. 00   Page 1 of 1', M + 54, y + 43);

    doc.setFontSize(9);
    doc.text('Reference: ' + c.ref, pageW - M, y + 12, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text('Date submitted: ' + fmtDateTime(c.submitted), pageW - M, y + 26, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text('Status: ' + c.status, pageW - M, y + 40, { align: 'right' });

    y += 58;

    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 },
      body: [
        ['Employee Name', fullName(c.employee) || '—', 'Employee Number', c.employee.number || '—'],
        ['Email', c.employee.email || '—', 'Date', fmtDate(c.submitted)],
        ['Site', c.employee.site || '—', 'Machine', c.employee.machine || '—'],
        ['Project', c.employee.project || '—', 'Cost Centre', c.employee.costCentre || '—'],
        ['Car Registration Number', c.employee.carReg || '—', '', '']
      ],
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 245, 245] }, 2: { fontStyle: 'bold', fillColor: [245, 245, 245] } },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 16;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('1. Travelling Claim', M, y); y += 4;
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 },
      head: [['Date', 'From', 'To', 'Kilometres', 'Amount']],
      body: (c.km.length ? c.km : [null]).map(r => r ? [r.date || '', r.from || '', r.to || '', String(r.km || ''), money.format(r.amount || 0)] : ['', '', '', '', '']),
      foot: [['', '', '', 'Total', money.format(c.kmTotal || 0)]],
      headStyles: { fillColor: NAVY, textColor: 255 }, footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 14;

    doc.setFont('helvetica', 'bold'); doc.text('2. Other Claims', M, y); y += 4;
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 },
      head: [['Date', 'Description of Claim', 'Currency', 'Amount', 'Amount (ZAR)']],
      body: (c.other.length ? c.other : [null]).map(r => r ? [r.date || '', r.desc || '', r.currency || 'ZAR', (r.amount != null ? r.amount.toFixed(2) : ''), money.format(r.zar || 0)] : ['', '', '', '', '']),
      foot: [['', '', '', 'Total', money.format(c.otherTotal || 0)]],
      headStyles: { fillColor: NAVY, textColor: 255 }, footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 14;

    doc.setFont('helvetica', 'bold'); doc.text('3. Summary of Claims', M, y); y += 4;
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 },
      body: [
        ['3.1  Travelling', money.format(c.kmTotal || 0)],
        ['3.2  Other Claims', money.format(c.otherTotal || 0)],
        ['Grand Total', money.format(c.grandTotal || 0)]
      ],
      columnStyles: { 0: { cellWidth: (pageW - 2 * M) - 150 }, 1: { halign: 'right', cellWidth: 150 } },
      didParseCell: d => { if (d.row.index === 2) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [240, 240, 240]; } },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 16;

    doc.setFont('helvetica', 'bold'); doc.text('Banking Details', M, y); y += 4;
    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 },
      body: [
        ['Account Holder', c.banking.holder || '—'],
        ['Bank', c.banking.bank || '—'],
        ['Account Number', c.banking.acc || '—'],
        ['Proof of Account', c.banking.proofName || '—']
      ],
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 160 } },
      margin: { left: M, right: M }
    });
    y = doc.lastAutoTable.finalY + 18;

    doc.autoTable({
      startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 8 },
      head: [['Designation', 'Name', 'Signature', 'Date']],
      // A material disbursement needs the CFO's signature as well as the H.O.D's.
      body: [
        ['H.O.D / Site Manager', '', '', '']
      ].concat(isMaterial(c) ? [['CFO (material disbursement)', '', '', '']] : []).concat([
        ['Employee', fullName(c.employee) || '', '', fmtDate(c.submitted)]
      ]),
      headStyles: { fillColor: NAVY, textColor: 255 },
      margin: { left: M, right: M }
    });

    // The duplicate-kilometres flag stays off the PDF as well — the claimant prints this.
    const notes = [];
    if (c.revision) {
      notes.push('Note: ' + revisionTipText(c) + ' Any approval given before that falls away.');
    }
    if (isMaterial(c)) {
      notes.push('Note: Material disbursement — at ' + money.format(c.grandTotal) + ' this claim is above '
        + money.format(MATERIAL_LIMIT) + ' and must be approved by the requestor’s H.O.D and by the CFO before payment.');
    }
    const pdfAge = claimAge(c);
    if (pdfAge && pdfAge.late) {
      notes.push('Note: ' + ageTipText(pdfAge) + ' Late submissions may be declined unless exceptional circumstances are justified and approved by a senior manager.');
    }
    if (c.deleted) {
      notes.push('Note: This disbursement was deleted on ' + fmtDateTime(c.deletedAt || c.submitted)
        + ' and retracted from the HOD. It will not be paid. The record is retained for audit purposes.');
    }
    if (notes.length) {
      y = doc.lastAutoTable.finalY + 16;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(150, 100, 20);
      notes.forEach(note => {
        const lines = doc.splitTextToSize(note, pageW - 2 * M);
        doc.text(lines, M, y);
        y += lines.length * 11 + 6;
      });
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    }

    try {
      if (opts.defer) return doc;   // the caller is adding attachments and will save it
      doc.save(c.ref + '.pdf');
      showToast('Generated ' + c.ref + '.pdf. If no download started, this in-app preview is blocking it — open the app in a browser to save it.', 7000);
    } catch (e) {
      try { window.open(doc.output('bloburl'), '_blank'); } catch (e2) {}
      showToast('Your PDF is ready, but this preview blocked the download. Open the app in a browser to save ' + c.ref + '.pdf.', 7000);
    }
  }

  // The claim form plus every file attached to it, as one PDF.
  async function generateFullPDF(c) {
    if (!c) return;
    const items = attachmentList(c).filter(i => i.id);
    if (!items.length) { generatePDF(c); return; }   // nothing attached — the form on its own

    showToast('Building ' + c.ref + '.pdf with its ' + items.length + ' attachment' + (items.length > 1 ? 's' : '') + '…', 4000);

    const doc = generatePDF(c, { defer: true });
    if (!doc) return; // the libraries did not load; generatePDF has already said so

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const M = 40;
    // Images are drawn onto pages of their own; a PDF attachment's pages are copied in
    // whole and can only go at the end. Number them in that order, so "Attachment 2" is
    // the second thing after the form and not the second thing that was uploaded.
    const loaded = [];
    for (const it of items) {
      const rec = await readKeptFile(it.id);
      if (rec) loaded.push({ it: it, rec: rec, isImage: /^image\//.test(rec.type) });
    }
    const ordered = loaded.filter(x => x.isImage).concat(loaded.filter(x => !x.isImage));

    const pdfAttachments = [];
    let n = 0;

    for (const entry of ordered) {
      const it = entry.it, rec = entry.rec;
      n++;
      if (entry.isImage) {
        try {
          const img = await imageForPdf(rec.blob);
          doc.addPage();
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0);
          doc.text('Attachment ' + n + ': ' + it.label, M, 46);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120);
          doc.text([rec.name || '', c.ref].filter(Boolean).join('  ·  '), M, 60);
          doc.setTextColor(0);
          const top = 74;
          const scale = Math.min((pageW - 2 * M) / img.w, (pageH - top - M) / img.h);
          doc.addImage(img.dataUrl, 'JPEG', M, top, img.w * scale, img.h * scale);
        } catch (e) { /* an unreadable image is skipped rather than losing the whole PDF */ }
      } else {
        pdfAttachments.push({ rec: rec, label: it.label, n: n });
      }
    }

    // A PDF attachment cannot be drawn onto a page — its pages are copied in whole.
    if (!pdfAttachments.length) {
      try { doc.save(c.ref + '.pdf'); showToast('Saved ' + c.ref + '.pdf with ' + n + ' attachment' + (n > 1 ? 's' : '') + '.', 6000); }
      catch (e) { try { window.open(doc.output('bloburl'), '_blank'); } catch (e2) {} }
      return;
    }

    let PDFLib;
    try { PDFLib = await loadPdfLib(); } catch (e) {
      try { doc.save(c.ref + '.pdf'); } catch (e2) {}
      showToast('Saved ' + c.ref + '.pdf, but the PDF attachments could not be merged in — that needs a connection. Open them from View instead.', 8000);
      return;
    }

    try {
      const merged = await PDFLib.PDFDocument.create();
      const base = await PDFLib.PDFDocument.load(doc.output('arraybuffer'));
      (await merged.copyPages(base, base.getPageIndices())).forEach(p => merged.addPage(p));

      for (const att of pdfAttachments) {
        const src = await PDFLib.PDFDocument.load(await att.rec.blob.arrayBuffer(), { ignoreEncryption: true });
        (await merged.copyPages(src, src.getPageIndices())).forEach(p => merged.addPage(p));
      }

      const blob = new Blob([await merged.save()], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = c.ref + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      showToast('Saved ' + c.ref + '.pdf with ' + n + ' attachment' + (n > 1 ? 's' : '') + '.', 6000);
    } catch (e) {
      try { doc.save(c.ref + '.pdf'); } catch (e2) {}
      showToast('Saved ' + c.ref + '.pdf, but one of the PDF attachments could not be merged in. Open it from View instead.', 8000);
    }
  }

  /* ===== Admin: editable sites, machines and km rate (persisted in this browser) ===== */
  // Cost centres (cost-allocation dimension) — from Finance's cost centre list.
  const DEFAULT_COST_CENTRES = [
    "CC0000 - Balance Sheet",
    "CC1005 - Operational",
    "CC1010 - Establishment",
    "CC1015 - Piloting",
    "CC1020 - Reaming/Hook up",
    "CC1025 - Reaming",
    "CC1030 - Disasembly",
    "CC1035 - Transport",
    "CC1040 - Technology Sales",
    "CC1045 - Sales Rental Machine",
    "CC1050 - Sales Rental Crawler",
    "CC1055 - Sales of Stock",
    "CC1060 - Regional Activities",
    "CC1065 - Sales of Services",
    "CC1070 - Employees on Standby",
    "CC1100 - New Technology",
    "CC1101 - New Technologies - MTB",
    "CC1102 - New Technologies - SBS",
    "CC1103 - New Technologies - RBS",
    "CC1105 - AVA Solutions",
    "CC2005 - Cutters",
    "CC2010 - Depreciation, Amortization and Impairments",
    "CC2015 - Engineering Control and Instrumentation",
    "CC2020 - Engineering Design Office",
    "CC2025 - Engineering Support",
    "CC2027 - Technical Office",
    "CC2030 - Financial Value Adjustments",
    "CC2035 - Inventory Rework & Manufacturing",
    "CC2040 - Inventory Value Adjustments",
    "CC2045 - Motor Vehicles",
    "CC2050 - Operational Management",
    "CC2055 - Operational Overheads",
    "CC2056 - Operational Overheads-Employees suspended",
    "CC2057 - Procurement, warehouse and transport",
    "CC2060 - Research & Development",
    "CC2065 - Research & Development - Projects",
    "CC2070 - SHEQT - COS",
    "CC2075 - Training",
    "CC2080 - Yard",
    "CC2085 - WORKSHOP",
    "CC2090 - Scheduled Maintenance",
    "CC2095 - MD Namibia",
    "CC3010 - Business Development",
    "CC3020 - Centre of Excellence (Information Technology)",
    "CC3025 - ERP Project Expenses",
    "CC3030 - Corporate Social Investment",
    "CC3031 - Corporate Social Investment-Young Apprentice",
    "CC3040 - Finance Management",
    "CC3041 - Finance Management-General Manager",
    "CC3050 - Head Office & Administration",
    "CC3051 - Head Office & Administration - A&R",
    "CC3055 - Rancagua Office",
    "CC3056 - Head Office Travel Expenses",
    "CC3057 - Project Management Office",
    "CC3060 - Human Resources Management",
    "CC3065 - SHEQ-Overheads",
    "CC3070 - Commercial Office",
    "CC3075 - Marketing & Public Relations",
    "CC3080 - Profit and loss on sale of fixed assets",
    "CC3090 - Risk, Legal & Assurance",
    "CC3095 - Social Services Office",
    "CC3100 - Social Project-Safe House",
    "CC3110 - Transport",
    "CC3115 - Security Department",
    "CC3120 - Buildings",
    "CC4050 - Dividends Paid",
    "CC4100 - Equity Accounted Investment_Disposal of Associate",
    "CC4150 - Equity Accounted Investment_Share of (loss)/profit",
    "CC4200 - Fair Value Adjustment",
    "CC4250 - Finance Income & Charges",
    "CC4300 - Foreign Exchange",
    "CC4350 - Royalties Income",
    "CC4400 - Share of Profit in Joint Venture",
    "CC4450 - Taxes",
    "CC4455 - Taxes - Brazil",
    "CC5100 - Inter Company Accounting Transactions",
    "CC5200 - Intercompany Inventory",
    "CC5300 - Intercompany Recoveries",
    "CC5400 - Intercompany Transactions",
    "CC5500 - Related Parties",
    "CC5600 - Related Party Recoveries",
    "CC5700 - Rentals_Intercompany",
    "CC5800 - Intercompany Recoveries - Fixed Assets Transactions",
    "CC6005 - Retail - A&R",
    "CC6050 - 3rd Party Retail",
    "CC7100 - ZUBLIN INTERNATIONAL GMBH CHILE SPA",
    "CC7101 - ACCIONA CONSTRUCCION S.A. AGENCIA CHILE",
    "CC7102 - MAX RENTAL SPA",
    "CC7103 - GEOVIDA SPA",
    "CC7104 - FMT-BBOSCH SPA",
    "CC7105 - GEOROCK SPA",
    "CC7106 - CONSTRUCTORA GARDILCIC LTDA",
    "CC7107 - BORMAX SPA",
    "CC7108 - EMPRESA DE MONTAJES INDUSTRIALES SALFA S A",
    "CC7109 - COMUNICACIONES Y TECNOLOGIA S A",
    "CC7110 - ALMAR WATER SERVICIOS LATAM S.A.",
    "CC7111 - MAQUINARIAS Y EQUIPOS MAQSA S A",
    "CC7112 - FMT CHILE SPA",
    "CC7113 - BESALCO",
    "CC7114 - EMPRESA DE MANTENCIONES Y SERVICIOS SALFA S.A.",
    "CC7115 - SOCIEDAD COMERCIAL COLORADO LTDA",
    "CC7116 - MIES SERVICIOS INTEGRALES LIMITADAs (Chile)",
    "CC7117 - Master Drilling",
    "CC7118 - Besalco Maquinarias",
    "CC7119 - DMC Mining Service Chile",
    "CC7120 - SOCIEDAD AGRICOLA Y FORESTAL JIMENEZ Y MUNOZ LTDA",
    "CC7121 - SYNCORE MONTAJE",
    "CC7122 - BAILAC SERVICIOS EN AHORROS DE NEUMATICOS LIMITADA",
    "CC7123 - STAVIC ARRIENDOS LTDA"
  ];
  let COST_CENTRES = DEFAULT_COST_CENTRES.slice();

  // Projects (cost-allocation dimension) — kept apart from machines so a claim can be
  // booked against a project without pretending it belongs to a rig.
  const DEFAULT_PROJECTS = [
    'MTB-BOK-WV-001-OPE', 'MTB-BOK-WV-001-PMI', 'MTB-BOK-WV-001-SVI',
    'MTB-BOK-WV-002-OPE', 'MTB-BOK-WV-002-SEQ', 'MTB-BOK-WV-003-SEQ', 'MTB-BOK-WV-004-SEQ',
    'RBS-ETUN-00010', 'RBS-ETUN-00017',
    'SBS-ETUN-00004', 'SBS-ETUN-00005', 'SBS-ETUN-00005-1', 'SBS-ETUN-00016', 'SBS-ETUN-00018'
  ];
  let PROJECTS = DEFAULT_PROJECTS.slice();

  const DEFAULT_SITES = ['Venetia', 'ARM', 'Styldrift', 'Lonmin', 'Thembelani', 'PMC', 'Ivan Plats', 'Zondereinde', 'Cullinan', 'Finsch', 'South Deep', 'Evander', 'Sasol Kromdraai', 'Sasol Bokamoso', 'Rosh Pina', 'Fochville Head Office'];
  let SITES = DEFAULT_SITES.slice();
  const CONFIG_VERSION = 5; // bump when the built-in site or machine list changes so saved copies refresh

  // HR contacts shown on the Policy page and used by the policy assistant's fallback.
  const DEFAULT_CONTACTS = [
    { name: 'Jean Du Toit', role: 'CHRO', email: 'JDuToit@masterdrilling.com' },
    { name: 'Anneke Brink', role: 'HR Business Partner', email: 'AnnekeK@masterdrilling.com' },
    { name: 'Angelina Lira', role: 'HR Business Partner', email: 'AngelinaL@masterdrilling.com' }
  ];
  let CONTACTS = DEFAULT_CONTACTS.map(c => Object.assign({}, c));

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadConfig() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('mdg-config') || '{}'); } catch (e) {}
    // A browser that has used the app before holds its own copy of the site list, so a new
    // built-in site would never reach it. On a version bump, fold in the ones it is missing
    // rather than throwing the list away; the admin's own sites stay put.
    if (Array.isArray(cfg.sites) && cfg.sites.length) {
      const saved = cfg.sites.slice();
      if (cfg.version !== CONFIG_VERSION) {
        const have = new Set(saved.map(s => String(s).toLowerCase()));
        DEFAULT_SITES.forEach(s => { if (!have.has(s.toLowerCase())) saved.push(s); });
      }
      SITES = saved;
    } else {
      SITES = DEFAULT_SITES.slice();
    }
    if (Array.isArray(cfg.machines) && cfg.machines.length) {
      const saved = cfg.machines.slice();
      // A browser that has used the app before holds its own copy of the machine list, so new
      // built-in machines would never reach it. On a version bump, fold in the ones it is
      // missing; the admin's own additions stay, and from then on removals stick as usual.
      if (cfg.version !== CONFIG_VERSION) {
        const have = new Set(saved.map(m => String(m).toLowerCase()));
        MACHINES.forEach(m => { if (!have.has(m.toLowerCase())) saved.push(m); });
        // Codes that have since become projects must leave the machine list behind them.
        const isProject = new Set(DEFAULT_PROJECTS.map(p => p.toLowerCase()));
        for (let i = saved.length - 1; i >= 0; i--) {
          if (isProject.has(String(saved[i]).toLowerCase())) saved.splice(i, 1);
        }
      }
      MACHINES.length = 0; saved.forEach(m => MACHINES.push(m));
    }
    if (Array.isArray(cfg.projects) && cfg.projects.length) {
      const saved = cfg.projects.slice();
      if (cfg.version !== CONFIG_VERSION) {
        const have = new Set(saved.map(p => String(p).toLowerCase()));
        DEFAULT_PROJECTS.forEach(p => { if (!have.has(p.toLowerCase())) saved.push(p); });
      }
      PROJECTS = saved;
    }
    if (Array.isArray(cfg.costCentres) && cfg.costCentres.length) {
      const saved = cfg.costCentres.slice();
      if (cfg.version !== CONFIG_VERSION) {
        const have = new Set(saved.map(c => String(c).toLowerCase()));
        DEFAULT_COST_CENTRES.forEach(c => { if (!have.has(c.toLowerCase())) saved.push(c); });
      }
      COST_CENTRES = saved;
    }
    if (Array.isArray(cfg.contacts) && cfg.contacts.length) CONTACTS = cfg.contacts.map(c => Object.assign({}, c));
    if (typeof cfg.kmRate === 'number' && cfg.kmRate > 0) KM_RATE = cfg.kmRate;
    sortSites(); sortMachines(); sortProjects(); COST_CENTRES.sort(byName);
    saveConfig(); // re-save under the current version, in order
  }
  /* ---- Ordering ----
     Both lists are shown alphabetically so they can be found by scrolling, not only by
     typing. Numeric-aware, so SBS-ETUN-00005 comes before SBS-ETUN-00016. Overheads stays
     pinned at the top of the machines: it is the default when a claim has no machine. */
  // "N/A" heads the machine, project and cost centre lists: a claim may genuinely have
  // none of them. It is offered by the dropdowns but never stored in the lists themselves,
  // so it cannot be sorted away, saved into the config or deleted from the Admin page.
  const NA = "N/A";
  function withNA(list) { return [NA].concat(list); }

  const byName = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
  function sortSites() { SITES.sort(byName); }
  function sortProjects() { PROJECTS.sort(byName); }
  function sortMachines() {
    MACHINES.sort((a, b) => {
      const ao = String(a).toLowerCase() === 'overheads', bo = String(b).toLowerCase() === 'overheads';
      if (ao !== bo) return ao ? -1 : 1;
      return byName(a, b);
    });
  }

  function saveConfig() {
    try { localStorage.setItem('mdg-config', JSON.stringify({ version: CONFIG_VERSION, sites: SITES, machines: MACHINES, projects: PROJECTS, costCentres: COST_CENTRES, contacts: CONTACTS, kmRate: KM_RATE })); } catch (e) {}
  }

  // Render the contacts shown on the Policy page.
  function renderContacts() {
    const box = document.getElementById('contactsList');
    if (!box) return;
    box.innerHTML = CONTACTS.length
      ? CONTACTS.map(c =>
          '<div class="contact-item">' +
            '<span class="contact-name">' + escapeHtml(c.name) + '</span>' +
            (c.role ? '<span class="contact-role">' + escapeHtml(c.role) + '</span>' : '') +
            '<a class="contact-email" href="mailto:' + escapeHtml(c.email) + '">' + escapeHtml(c.email) + '</a>' +
          '</div>').join('')
      : '<div class="admin-empty">No contacts listed.</div>';
  }

  function renderAdminContacts() {
    const box = document.getElementById('adminContacts');
    if (!box) return;
    box.innerHTML = CONTACTS.length
      ? CONTACTS.map((c, i) =>
          '<div class="admin-item"><span>' + escapeHtml(c.name) +
          (c.role ? ' <span class="contact-role">' + escapeHtml(c.role) + '</span>' : '') +
          ' <span class="contact-dim">' + escapeHtml(c.email) + '</span></span>' +
          '<button class="admin-del" data-i="' + i + '" title="Remove">&times;</button></div>').join('')
      : '<div class="admin-empty">No contacts yet — add one below.</div>';
    box.querySelectorAll('.admin-del').forEach(b => b.addEventListener('click', () => {
      CONTACTS.splice(+b.dataset.i, 1); saveConfig(); renderAdminContacts(); renderContacts();
    }));
  }

  // Type-ahead combobox for Site, constrained to the SITES list (admin-editable).
  // Project and cost centre behave like the site and machine boxes, except that leaving
  // them blank is allowed — not every disbursement belongs to a project or a cost centre.
  function initListCombo(inputId, listId, getItems, emptyText) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    let shown = [];
    let activeIdx = -1;
    // Focus shows everything; typing narrows it.
    function render(showAll) {
      const q = showAll ? '' : input.value.trim().toLowerCase();
      const items = withNA(getItems());
      shown = q ? items.filter(p => p.toLowerCase().includes(q)) : items;
      activeIdx = -1;
      list.innerHTML = shown.length
        ? shown.map((p, i) => '<div class="combo-opt" data-i="' + i + '">' + escapeHtml(p) + '</div>').join('')
        : '<div class="combo-empty">' + emptyText + '</div>';
      list.classList.remove('hidden');
      if (showAll) showCurrentOption(list, shown, input.value);
    }
    function choose(p) { input.value = p; input.classList.remove('field-error'); list.classList.add('hidden'); }
    function highlight() {
      const opts = list.querySelectorAll('.combo-opt');
      opts.forEach((o, i) => o.classList.toggle('active', i === activeIdx));
      if (opts[activeIdx]) opts[activeIdx].scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', () => render(true));
    input.addEventListener('input', () => render(false));
    input.addEventListener('keydown', e => {
      const opts = list.querySelectorAll('.combo-opt');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!opts.length) return; activeIdx = Math.min(activeIdx + 1, opts.length - 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!opts.length) return; activeIdx = Math.max(activeIdx - 1, 0); highlight(); }
      else if (e.key === 'Enter') { if (activeIdx >= 0 && shown[activeIdx]) { e.preventDefault(); choose(shown[activeIdx]); } }
      else if (e.key === 'Escape') { list.classList.add('hidden'); }
    });
    list.addEventListener('mousedown', e => {
      const opt = e.target.closest('.combo-opt');
      if (!opt) return;
      e.preventDefault();
      choose(shown[+opt.dataset.i]);
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.classList.add('hidden');
        // Blank is allowed; anything that is not on the list is not.
        if (input.value && withNA(getItems()).indexOf(input.value) === -1) input.value = '';
      }, 150);
    });
  }

  function initSiteCombo() {
    const input = document.getElementById('empSite');
    const list = document.getElementById('siteList');
    if (!input || !list) return;
    let shown = [];
    let activeIdx = -1;
    function filter(q) {
      q = q.trim().toLowerCase();
      const src = q ? SITES.filter(s => s.toLowerCase().includes(q)) : SITES;
      // No cap: the whole list must be reachable by scrolling, not only by typing.
      return src;
    }
    // Focus opens the whole list even when the box already holds a site.
    function render(showAll) {
      shown = filter(showAll ? '' : input.value);
      activeIdx = -1;
      if (!shown.length) { list.innerHTML = '<div class="combo-empty">No matching site</div>'; list.classList.remove('hidden'); return; }
      list.innerHTML = shown.map((s, i) => '<div class="combo-opt" data-i="' + i + '">' + escapeHtml(s) + '</div>').join('');
      list.classList.remove('hidden');
      if (showAll) showCurrentOption(list, shown, input.value);
    }
    function choose(s) { input.value = s; input.classList.remove('field-error'); list.classList.add('hidden'); }
    function highlight() {
      const opts = list.querySelectorAll('.combo-opt');
      opts.forEach((o, i) => o.classList.toggle('active', i === activeIdx));
      if (opts[activeIdx]) opts[activeIdx].scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', () => render(true));
    input.addEventListener('input', () => render(false));
    input.addEventListener('keydown', e => {
      const opts = list.querySelectorAll('.combo-opt');
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!opts.length) return; activeIdx = Math.min(activeIdx + 1, opts.length - 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (!opts.length) return; activeIdx = Math.max(activeIdx - 1, 0); highlight(); }
      else if (e.key === 'Enter') { if (activeIdx >= 0 && shown[activeIdx]) { e.preventDefault(); choose(shown[activeIdx]); } }
      else if (e.key === 'Escape') { list.classList.add('hidden'); }
    });
    list.addEventListener('mousedown', e => {
      const opt = e.target.closest('.combo-opt');
      if (!opt) return;
      e.preventDefault();
      choose(shown[+opt.dataset.i]);
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.classList.add('hidden');
        if (input.value && !SITES.includes(input.value)) input.value = '';
      }, 150);
    });
  }

  function renderAdminSites() {
    const box = document.getElementById('adminSites');
    if (!box) return;
    box.innerHTML = SITES.length
      ? SITES.map((s, i) => '<div class="admin-item"><span>' + escapeHtml(s) + '</span><button class="admin-del" data-i="' + i + '" title="Remove">&times;</button></div>').join('')
      : '<div class="admin-empty">No sites yet — add one below.</div>';
    box.querySelectorAll('.admin-del').forEach(b => b.addEventListener('click', () => {
      SITES.splice(+b.dataset.i, 1); saveConfig(); renderAdminSites();
    }));
  }

  function renderAdminMachines(q) {
    const box = document.getElementById('adminMachines');
    const count = document.getElementById('machineCount');
    if (!box) return;
    if (count) count.textContent = MACHINES.length + ' in the list.';
    q = (q || '').trim().toLowerCase();
    const items = MACHINES.map((m, i) => ({ m, i })).filter(o => !q || o.m.toLowerCase().includes(q));
    const shown = items.slice(0, 200);
    if (!items.length) { box.innerHTML = '<div class="admin-empty">No matching machines.</div>'; return; }
    box.innerHTML = shown.map(o => '<div class="admin-item"><span>' + escapeHtml(o.m) + '</span><button class="admin-del" data-i="' + o.i + '" title="Remove">&times;</button></div>').join('') +
      (items.length > shown.length ? '<div class="admin-empty">Showing first ' + shown.length + ' of ' + items.length + ' — refine your search.</div>' : '');
    box.querySelectorAll('.admin-del').forEach(b => b.addEventListener('click', () => {
      MACHINES.splice(+b.dataset.i, 1); saveConfig(); renderAdminMachines(document.getElementById('machineFilter').value);
    }));
  }

  function adminFlash(msg, isErr) {
    const el = document.getElementById('adminMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = 'submit-msg ' + (isErr ? 'err' : 'ok');
  }

  function wireAdmin() {
    const addSiteBtn = document.getElementById('addSite');
    if (addSiteBtn) addSiteBtn.addEventListener('click', () => {
      const inp = document.getElementById('newSite');
      const v = inp.value.trim();
      if (!v) return;
      if (SITES.some(s => s.toLowerCase() === v.toLowerCase())) { adminFlash('“' + v + '” is already in the sites list.', true); return; }
      SITES.push(v); sortSites(); saveConfig(); renderAdminSites(); inp.value = ''; inp.focus();
    });

    const addMachineBtn = document.getElementById('addMachine');
    if (addMachineBtn) addMachineBtn.addEventListener('click', () => {
      const inp = document.getElementById('newMachine');
      const v = inp.value.trim();
      if (!v) return;
      if (MACHINES.some(m => m.toLowerCase() === v.toLowerCase())) { adminFlash('“' + v + '” is already in the machines list.', true); return; }
      MACHINES.push(v); sortMachines(); saveConfig(); renderAdminMachines(document.getElementById('machineFilter').value); inp.value = ''; inp.focus();
    });

    const filter = document.getElementById('machineFilter');
    if (filter) filter.addEventListener('input', () => renderAdminMachines(filter.value));

    const addContactBtn = document.getElementById('addContact');
    if (addContactBtn) addContactBtn.addEventListener('click', () => {
      const nameEl = document.getElementById('newContactName');
      const roleEl = document.getElementById('newContactRole');
      const emailEl = document.getElementById('newContactEmail');
      const name = nameEl.value.trim(), role = roleEl.value.trim(), email = emailEl.value.trim();
      if (!name || !email) { adminFlash('A contact needs at least a name and an email address.', true); return; }
      if (CONTACTS.some(c => c.email.toLowerCase() === email.toLowerCase())) { adminFlash(email + ' is already listed.', true); return; }
      CONTACTS.push({ name: name, role: role, email: email });
      saveConfig(); renderAdminContacts(); renderContacts();
      nameEl.value = ''; roleEl.value = ''; emailEl.value = ''; nameEl.focus();
      adminFlash('Contact added.', false);
    });

    const saveRateBtn = document.getElementById('saveRate');
    if (saveRateBtn) saveRateBtn.addEventListener('click', () => {
      const v = parseFloat(document.getElementById('kmRateInput').value);
      if (isNaN(v) || v <= 0) { adminFlash('Enter a valid rate greater than 0.', true); return; }
      KM_RATE = v; saveConfig(); recalc();
      adminFlash('Kilometre rate updated to R' + v.toFixed(2) + ' per km.', false);
    });
  }

  // seed each tab with two starter rows
  addRow('km'); addRow('km');
  addRow('other'); addRow('other');

  // load any saved admin config, then build the dependent UI
  loadConfig();
  applySessionUser();
  writeBankFields(bankProfiles.main);
  updateBankHint();
  initSiteCombo();
  initListCombo('empProject', 'projectList', () => PROJECTS, 'No matching project');
  initListCombo('empCostCentre', 'costCentreList', () => COST_CENTRES, 'No matching cost centre');
  renderContacts();
  renderAdminContacts();
  renderAdminSites();
  renderAdminMachines('');
  const kmRateInput = document.getElementById('kmRateInput');
  if (kmRateInput) kmRateInput.value = KM_RATE;
  wireAdmin();

  // load saved claim history (survives reloads on this device)
  loadClaims();
  recomputeKmFlags();
  saveClaims();

  recalc();

  // render the Previous Claims table (from saved history)
  renderPrev();

  // offer back any draft left from a previous visit
  const savedDraft = readDraft();
  if (savedDraft) showDraftBanner(savedDraft);

  // fetch today's currency rates
  fetchRates();
