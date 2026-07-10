  const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', currencyDisplay: 'narrowSymbol' });

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
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('mdg-theme', t); } catch (e) { /* storage unavailable */ }
    if (themeSelect) themeSelect.value = t;
    document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.themeVal === t));
  }

  // Initialise controls to the current theme (from storage or default).
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
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
  if (setLogoutBtn) setLogoutBtn.addEventListener('click', function () {
    if (window.mdgAuth) window.mdgAuth.signOut(); else showPoster();
  });

  // Account-menu logout signs the user out
  const menuLogout = document.querySelector('.btn-logout');
  if (menuLogout) menuLogout.addEventListener('click', function () {
    if (window.mdgAuth) window.mdgAuth.signOut(); else showPoster();
  });

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
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('tab-km').classList.toggle('hidden', which !== 'km');
      document.getElementById('tab-other').classList.toggle('hidden', which !== 'other');
    });
  });

  /* ---- Rows ---- */
  function kmRow() {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="date"></td>' +
      '<td><input type="text" placeholder="From"></td>' +
      '<td><input type="text" placeholder="To"></td>' +
      '<td><input type="number" min="0" step="1" placeholder="0" class="km-input"></td>' +
      '<td class="col-amt"><span class="amt-cell">R 0,00</span></td>' +
      '<td class="col-odo">' +
        '<input type="file" accept="image/*" class="odo-input" hidden>' +
        '<button type="button" class="odo-btn" title="Upload odometer photo">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/></svg>' +
          'Photo' +
        '</button>' +
      '</td>' +
      '<td><button class="row-del" title="Remove row">&times;</button></td>';
    return tr;
  }
  function otherRow() {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="date"></td>' +
      '<td><input type="text" placeholder="Description of claim"></td>' +
      '<td class="col-amt">' +
        '<div class="cur-row">' +
          '<select class="cur-select">' + curOptions() + '</select>' +
          '<input type="number" min="0" step="0.01" placeholder="0.00" class="amt-input">' +
        '</div>' +
        '<div class="zar-line"><span class="zar-eq">R 0,00</span><span class="rate-note"></span></div>' +
      '</td>' +
      '<td class="col-odo">' +
        '<input type="file" accept="image/*" class="odo-input" hidden>' +
        '<button type="button" class="odo-btn" title="Upload proof of claim">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>' +
          'Proof' +
        '</button>' +
      '</td>' +
      '<td><button class="row-del" title="Remove row">&times;</button></td>';
    return tr;
  }

  const kmBody = document.getElementById('km-rows');
  const otherBody = document.getElementById('other-rows');

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

    updateKmFlag();
  }

  // Show the soft disclaimer if any travelling line repeats a previous disbursement's route + distance.
  function updateKmFlag() {
    const rows = [];
    kmBody.querySelectorAll('tr').forEach(tr => {
      const texts = tr.querySelectorAll('input[type=text]');
      rows.push({ from: texts[0] ? texts[0].value : '', to: texts[1] ? texts[1].value : '', km: tr.querySelector('.km-input').value });
    });
    const flagged = kmMatchesPrevious(rows, typeof editingRef !== 'undefined' ? editingRef : null);
    const el = document.getElementById('kmFlag');
    if (el) el.classList.toggle('hidden', !flagged);
  }

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
          '<img class="odo-thumb" src="' + url + '" alt="Attached photo">' +
          '<span class="odo-ok" title="Photo attached">&#10003;</span>';
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
  /* ---- Secure AI proxy (Supabase Edge Function) — no API key lives in the app ---- */
  const AI_PROXY_URL = 'https://gvdrncjdveldpjiecspv.supabase.co/functions/v1/gemini-proxy';
  // Public Supabase "anon" key — designed for browser use, not a secret.
  const AI_PROXY_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2ZHJuY2pkdmVsZHBqaWVjc3B2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjUwMzQsImV4cCI6MjA5ODU0MTAzNH0._q3DG9_mELkAHETVymtfwi9-swm2QL91TrKEXo6AaLU';

  // Sends a file + prompt to the backend proxy and returns the AI's raw text result.
  async function callAIProxy(base64Data, mimeType, prompt) {
    const resp = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + AI_PROXY_ANON,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mimeType: mimeType || 'image/jpeg', base64Data, prompt })
    });
    if (!resp.ok) throw new Error('AI proxy returned ' + resp.status);
    const data = await resp.json();
    return (data && data.result) ? String(data.result) : '';
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
  // Is this receipt fingerprint already used on another line or a previous claim?
  function isReceiptUsed(fp, exceptTr) {
    const rows = otherBody.querySelectorAll('tr');
    for (const r of rows) {
      if (r === exceptTr) continue;
      if (fp.hash && r.dataset.fileHash === fp.hash) return true;
      if (fp.sig && r.dataset.sig && r.dataset.sig === fp.sig) return true;
    }
    for (const c of claims) {
      if (editingRef && c.ref === editingRef) continue;
      for (const it of (c.other || [])) {
        if (fp.hash && it.hash && it.hash === fp.hash) return true;
        if (fp.sig && it.sig && it.sig === fp.sig) return true;
      }
    }
    return false;
  }
  const receiptProofSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>';
  function rejectReceipt(tr, btn, msg) {
    if (btn) { btn.classList.remove('has-photo', 'busy'); btn.innerHTML = receiptProofSvg + 'Proof'; }
    const input = tr.querySelector('.odo-input'); if (input) input.value = '';
    delete tr.dataset.fileHash; delete tr.dataset.sig;
    showToast(msg, 6500);
  }
  // Signature of a whole disbursement (employee + all line items + total) to catch re-submissions.
  // A claim is "late" if any Other-claim slip's purchase date is more than 90 days
  // before the claim was submitted (policy 5.4: submit within 90 calendar days).
  function isLateClaim(c) {
    if (!c || !c.submitted || !Array.isArray(c.other)) return false;
    const sub = new Date(c.submitted);
    if (isNaN(sub)) return false;
    return c.other.some(o => {
      if (!o || !o.date) return false;
      const d = new Date(o.date);
      if (isNaN(d)) return false;
      return (sub - d) / 86400000 > 90;   // 86,400,000 ms in a day
    });
  }

  function claimSig(d) {
    const km = (d.km || []).map(r => [r.date, r.from, r.to, r.km, (+r.amount).toFixed(2)].join(',')).sort().join(';');
    const oth = (d.other || []).map(r => [r.date, (r.desc || '').toLowerCase().trim(), r.currency, (+r.amount).toFixed(2)].join(',')).sort().join(';');
    return [(d.employee.name || '').toLowerCase().trim(), km, oth, (+d.grandTotal).toFixed(2)].join('||');
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
      for (const c of claims) {
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
  function recomputeKmFlags() {
    const inOrder = claims.slice().sort((a, b) => new Date(a.submitted) - new Date(b.submitted));
    const seen = [];
    for (const c of inOrder) {
      c.kmFlagged = kmMatchesList(c.km, seen);
      seen.push(c);
    }
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

      // Accept: fingerprint the row, then fill the details.
      tr.dataset.fileHash = fileHash;
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
  const MACHINES = ["Overheads", "009-A", "009-B", "009-C", "009-D", "009-E", "009-F", "009-G", "009-H", "009-I", "009-J", "009-P", "73R-DC", "24R", "41R", "41R-A", "41R-B", "41R-S", "43R-A ATL", "52R-A", "52R-B", "52R-C", "52R-E", "LP200-E", "LP200-F", "52R-I", "52R-J", "52R-K", "52R-M", "53R", "61R-A", "61R-B", "61R-C", "61R-D", "61R-E BALUBA", "61R-K", "61R-M", "61R-N", "61R-S", "61R-Z", "61R-ZC", "61R-ZD", "71R-A", "71R-B", "71R-BOESMAN", "71R-GATIEP", "71R-GHANA", "71R-M", "71R-N", "71R-O", "71R-P", "71R-Q", "71R-S", "71R-T", "71R-TS", "71R-Y (PAT)", "72R-A", "72R-L", "RD3-250LG", "73R-MUGABE", "DD52", "Bauer BG20 ADD", "BHB", "LP200-G", "LP200-I", "LP200-J", "Bauer BG28", "DD39 (M)", "MDX-308", "MDX-302", "MDX-309", "MDX-400", "MDX-311", "MDX-312", "MDX-314", "MDX-315", "MDX-316", "MDX-317", "MDX-318", "MDX-319", "MDX-320", "MDX-310", "MDX-321", "MDX-401", "DRESSER", "DTH-A", "DTH-B", "Gripper", "HG380", "LM-90-1", "LM-90-2", "LP200-A", "MD150-B", "MD150-C", "MD150-D", "MD150-E", "LM-90-3", "LM-90-4", "Orelyzer", "RBM6", "RBM6-M", "RBM7-1", "RBM7-2", "MDX-600", "MDX-601", "MDX-603", "RD1000", "RD2000-A", "RD2000-B", "RD2000-C", "RD2000-D", "RD3-250 LENA", "RD3-250A", "RD3-250B", "RD3-250C", "RD3-250D", "RD3-250E", "RD3-250F", "RD3-250G", "RD3-250H", "RD3A-250I", "RD3A-250J", "RD3A-250K", "RD3A-250L", "RD3A-250N", "RD3A-250O", "RD3A-250P", "RD3A-250Q", "RD3A-250R", "RD3A-250S", "RD3A-250T", "RD3A-250U", "RD3A-250V", "RD5-550D", "RD5-550E", "RD5-550G", "RD7-150B", "RD7-150C", "RD8-1500", "Stage", "ROBOT AMBILICAL - Spinnekop", "ROBOT SELF SUPPORT_ROSS & ROSIE", "ROBOT SHOTCRETE - Rabobi", "MDX-701", "MDX-702", "MDX-700", "UG60-001", "UG60-010", "UG60-015", "UG60-003", "RD3A-250MX", "43R-B", "RD11D-A", "RD11D-B ATL", "LM-30-1", "RD5-550H", "52R-F", "52R-N ATL", "52R-O ATL", "61R-O ATL", "71R-D ATL", "71R-E ATL", "RHINO 1000 2006 ATL", "RHINO 1000 2007 ATL", "RHINO 1000 2008 ATL", "RM12 ATL", "71R-C ATL", "61R-F", "MTB 0550-01", "LP200-B", "190 AMV", "43R", "LP200-C", "61R-R ATL", "82R-A ATL", "RD11D-C ATL", "Indau 250 HYD H1", "Indau 250 HYD H2", "Indau 500H M1", "Indau 500H M2", "Indau 500H M3", "Indau 500H M4", "Indau 90", "Rhino 1000 DC Bregenz", "Rhino 1000 DC Hoijer", "Rhino 1000 DC Kiruna", "Rhino 2000 DC", "RM10 ATL", "RM8 ATL", "RM7 ATL", "Robbins 61 AC", "Robbins R91 R1", "Robbins R91 R2", "Robbins R91 R3", "Robbins R91 R5", "LP200-D", "009-K", "MDX LY40", "MDX-322", "61R-P ATL", "61R-Q ATL", "RD6-A", "Robbins R91 R4", "RD3A-250M", "SBM11.5-2000", "MDX-324-UG", "009-L", "RC-01", "RC-02", "MDX-602", "RC-04", "RC-05", "MDX LY17", "MDX LY19", "MDX LY20", "MDX-324", "MDX-328", "MDX V013", "MDX-329", "MDX C45", "MDX C46", "MDX-327", "MDX LY32", "MDX LY26", "MDX LY34", "MDX LY23", "MDX LY27", "MDX LY24", "MDX LY44", "MDX-331", "MDX LY29", "MDX LY41", "UG-MEA002", "UG-MEH003", "SD-750 - Cargill", "009-M", "DD02", "MDX C03", "MDX LY06", "MDX V011", "MDX LY12", "MDX LY14", "MDX B015", "MDX V018", "MDX LY21", "MDX LY22", "MDX V025", "MDX LY31", "MDX LY33", "MDX LY38", "MDX LY42", "MDX DD043-AC01", "MDX LY47", "MDX L048", "MDX 604", "MDX 703-001", "MDX 704-002", "MDX 705-003", "MDX 706-004", "MDX 707-005", "Robot Shotcrete Doble Boquilla", "Robot Shotcrete Centrifugo 1", "MDX-708", "RD6-B", "MDX-323", "MDX-709", "MDX-900", "MDX-901", "DD039", "MDX-402", "MDX-403", "SCMREC-001", "SCMREC-002", "SCMREC-003", "SCMREC-004", "SCMREC-005", "91R-3", "91R-4", "RUCDR", "SBS", "ARM-Machine", "RBR 900", "009-O", "RD7-1000-A", "RD7-1000-B", "LP200-K", "LP200-L", "LP200-M", "LP200-N", "VectorZIEL800", "VectorEXAKT900", "LM-110-01", "LM-110-02", "LM-110-03", "53R-GH-1", "Shotcrete Robot - Spinnekop", "Shotcrete Robot - Mass 1", "73R-GH-1", "73R-GH-2", "73R-GH-3", "LM-110-04", "LM-110-05", "53R-GH-2", "RD8-1000-B", "LP100-A", "RD7-1000-C", "MDX-434", "MDX-711", "MDX-712", "RD3A-250W", "THOR 1200", "97R-GH-01", "RD6-DC-A", "RD6-DC-B", "RD6-DC-C", "VIP-01", "VIP-02", "009-N", "MDX-713", "SCMREC-006", "MDX-705", "RD5-550F", "MDX-714", "MDX-717", "All Machines 2020", "HCU01", "HCU02", "HCU03", "HCU04", "HCU05", "HC22", "HC33", "HC34", "HC35", "HC41", "HC43", "HC45", "HC48", "HC52", "HC60", "HC70", "HC17", "HC23", "HC31", "HC32", "HC42", "HC46", "HC50", "HC53", "HC59", "HC68", "HC69", "HC71", "Crawler-3 - CRW-20/3 (Chile)", "Crawler-4 - CRW-20/4 (Chile)", "DumperCrawler - Dump-01 (Chile)", "Crawler-6 - CRW20/6 (Chile)", "HC71 (Hall Core)", "ARM Project", "PCD", "Komatsu Project", "Consortium", "MDX-408", "73R_Anglo Gold Ashanti", "MDX-404", "MDX-405", "Van Zyl-Sonic Drilling", "Van Zyl-Reverse Circulation Drilling", "Van Zyl-Percussion Drilling", "Van Zyl-Diamond Drilling", "MDX-325", "MDX-326", "GOB PD01", "MDX-710", "Trio Drilling", "LP200-H"];
  (function () {
    const input = document.getElementById('empMachine');
    const list = document.getElementById('machineList');
    if (!input || !list) return;
    let shown = [];
    let activeIdx = -1;

    function filter(q) {
      q = q.trim().toLowerCase();
      const src = q ? MACHINES.filter(m => m.toLowerCase().includes(q)) : MACHINES;
      return src.slice(0, 50);
    }
    function render() {
      shown = filter(input.value);
      activeIdx = -1;
      if (!shown.length) { list.innerHTML = '<div class="combo-empty">No matching machine</div>'; list.classList.remove('hidden'); return; }
      list.innerHTML = shown.map((m, i) => '<div class="combo-opt" data-i="' + i + '">' + m + '</div>').join('');
      list.classList.remove('hidden');
    }
    function choose(m) { input.value = m; input.classList.remove('field-error'); list.classList.add('hidden'); }
    function highlight() {
      const opts = list.querySelectorAll('.combo-opt');
      opts.forEach((o, i) => o.classList.toggle('active', i === activeIdx));
      if (opts[activeIdx]) opts[activeIdx].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('focus', render);
    input.addEventListener('input', render);
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
        if (input.value && !MACHINES.includes(input.value)) input.value = '';
      }, 150);
    });
  })();
  const uploadSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/></svg>';
  const bankProofInput = document.getElementById('bankProofInput');
  const bankProofBtn = document.getElementById('bankProofBtn');

  bankProofBtn.addEventListener('click', () => bankProofInput.click());
  bankProofInput.addEventListener('change', () => {
    const f = bankProofInput.files[0];
    if (!f) return;
    bankProofBtn.classList.add('has-file');
    bankProofBtn.classList.remove('field-error');
    bankProofBtn.innerHTML = uploadSvg + '<span class="pf-label">' + f.name + '</span>';
    readBankLetter(f);
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
    } catch (e) {
      /* leave fields for manual entry */
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
  document.getElementById('submitBtn').addEventListener('click', async () => {
    let missing = 0;
    document.querySelectorAll('[data-required]').forEach(el => {
      const ok = el.value && el.value.trim() !== '';
      el.classList.toggle('field-error', !ok);
      if (!ok) missing++;
    });
    const proofOk = (bankProofInput.files && bankProofInput.files.length > 0) || (editingRef && editingProofName);
    bankProofBtn.classList.toggle('field-error', !proofOk);
    if (!proofOk) missing++;

    if (missing > 0) {
      submitMsg.textContent = 'Please complete the required fields (marked *) and attach your proof of account before submitting.';
      submitMsg.className = 'submit-msg err';
      return;
    }

    const data = collectClaim();

    if (editingRef) {
      // Update the recalled claim in place, preserving its reference, date, status and progress.
      const c = claims.find(x => x.ref === editingRef);
      if (c) {
        c.employee = data.employee;
        c.banking = data.banking;
        if (!(bankProofInput.files && bankProofInput.files.length) && editingProofName) c.banking.proofName = editingProofName;
        c.km = data.km; c.other = data.other;
        c.kmTotal = data.kmTotal; c.otherTotal = data.otherTotal; c.grandTotal = data.grandTotal;
        await withSubmitBusy(function () { return uploadClaimProofs(c); });
        recomputeKmFlags();
        renderPrev(c.ref);
        submitMsg.textContent = 'Claim ' + c.ref + ' updated. Its progress was kept.';
        submitMsg.className = 'submit-msg ok';
        saveClaims();
      }
      endEdit();
      resetForm();
      showView('previous');
    } else {
      // Whole-disbursement duplicate check
      const sig = claimSig(data);
      const dup = claims.find(c => claimSig(c) === sig);
      if (dup) {
        submitMsg.textContent = 'This disbursement is identical to ' + dup.ref + ', which has already been submitted. Duplicate submissions are not allowed.';
        submitMsg.className = 'submit-msg err';
        return;
      }
      data.kmFlagged = kmMatchesPrevious(data.km, null);
      await withSubmitBusy(function () { return uploadClaimProofs(data); });
      claims.unshift(data);
      renderPrev(data.ref);
      saveClaims();
      submitMsg.textContent = 'Claim ' + data.ref + ' submitted — it now appears under Previous Claims.';
      submitMsg.className = 'submit-msg ok';
      resetForm();
      showView('previous');
    }
  });

  /* ===== Claims: store, Previous Claims table, detail modal, PDF ===== */
  const LOGO_DATA = (document.querySelector('.logo img') || {}).src || null;
  const claims = [];
  let refSeq = 43; // next reference number

  // A stable unique id for each claim, so it maps to exactly one database row.
  function newId() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // Claims live in the Supabase "disbursements" table. Row Level Security means a
  // person's queries only ever touch their own rows — the isolation is enforced by
  // the database, not by this code.
  async function saveClaims() {
    const sb   = window.mdgAuth && window.mdgAuth.client;
    const user = window.mdgAuth && window.mdgAuth.user;
    if (!sb || !user) return;                       // not signed in yet
    const rows = claims.map(c => ({
      id: c.id,
      owner_id: user.id,                            // stamps the claim with its owner
      ref: c.ref,
      status: c.status,
      amount: (typeof c.grandTotal === 'number') ? c.grandTotal : null,
      data: c                                       // the whole claim, stored as JSON
    }));
    if (!rows.length) return;
    const { error } = await sb.from('disbursements').upsert(rows, { onConflict: 'id' });
    if (error) console.error('Could not save claims:', error.message);
  }

  async function loadClaims() {
    const sb = window.mdgAuth && window.mdgAuth.client;
    if (!sb) return;
    const { data, error } = await sb
      .from('disbursements')
      .select('data, created_at')
      .order('created_at', { ascending: false });   // newest first
    if (error) { console.error('Could not load claims:', error.message); return; }
    claims.length = 0;
    (data || []).forEach(row => { if (row && row.data) claims.push(row.data); });
    // Continue reference numbering from this user's highest existing claim.
    let maxSeq = 42;
    claims.forEach(c => {
      const m = /(\d+)\s*$/.exec(c.ref || '');
      if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; }
    });
    refSeq = maxSeq + 1;
    // The old per-device history is no longer used; clear it so it can't cause confusion.
    try { localStorage.removeItem('mdg-claims'); } catch (e) {}
    recomputeKmFlags();
    renderPrev();
  }

  async function deleteClaimRow(id) {
    const sb = window.mdgAuth && window.mdgAuth.client;
    if (!sb || !id) return;
    const { error } = await sb.from('disbursements').delete().eq('id', id);
    if (error) console.error('Could not delete claim:', error.message);
  }

  // Upload any newly-attached proof images to the private "claim-proofs" bucket and
  // record each file's path on the claim. Rows with no new file keep their existing path.
  async function uploadClaimProofs(claim) {
    const sb   = window.mdgAuth && window.mdgAuth.client;
    const user = window.mdgAuth && window.mdgAuth.user;
    if (!sb || !user || !claim) return;
    const base = user.id + '/' + claim.id + '/';
    async function up(file, slot) {
      if (!file) return null;                                   // nothing new attached
      const safe = (file.name || 'file').replace(/[^\w.\-]+/g, '_');
      const path = base + slot + '-' + safe;
      const { error } = await sb.storage.from('claim-proofs')
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (error) { console.error('Proof upload failed:', error.message); return null; }
      return path;
    }
    if (Array.isArray(claim.km)) {
      for (let i = 0; i < claim.km.length; i++) {
        const p = await up(claim.km[i]._file, 'km-' + i);
        if (p) claim.km[i].proofPath = p;
        delete claim.km[i]._file;                               // never store the File itself
      }
    }
    if (Array.isArray(claim.other)) {
      for (let i = 0; i < claim.other.length; i++) {
        const p = await up(claim.other[i]._file, 'other-' + i);
        if (p) claim.other[i].proofPath = p;
        delete claim.other[i]._file;
      }
    }
    if (claim.banking) {
      const p = await up(claim.banking._file, 'bank');
      if (p) claim.banking.proofPath = p;
      delete claim.banking._file;
    }
  }

  // Show a busy state on the submit button while proofs upload.
  async function withSubmitBusy(fn) {
    const btn = document.getElementById('submitBtn');
    const prev = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    try { await fn(); }
    finally { if (btn) { btn.disabled = false; btn.textContent = prev; } }
  }

  function fmtDate(d)     { return new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }); }
  function fmtDateTime(d) { return new Date(d).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function newRef() { return 'DSB-' + new Date().getFullYear() + '-' + String(refSeq++).padStart(4, '0'); }

  function typeLabel(c) {
    const k = c.kmTotal > 0, o = c.otherTotal > 0;
    if (k && o) return 'Travelling + Other';
    if (k) return 'Travelling';
    if (o) return 'Other claims';
    return '—';
  }
  function pillFor(status) {
    const cls = status === 'Approved' ? 'pill-ok' : (status === 'Rejected' ? 'pill-no' : (status === 'Recalled' ? 'pill-recalled' : 'pill-wait'));
    return '<span class="pill ' + cls + '">' + status + '</span>';
  }

  const STEPS = ['Filled in disbursement', 'Submitted to HOD', 'Submitted for payment', 'Disbursement paid'];
  function stepperHtml(stage) {
    const nodes = STEPS.map((s, i) =>
      '<div class="step' + (i <= stage ? ' done' : '') + '"><span class="node"></span><span class="step-lbl">' + s + '</span></div>'
    ).join('');
    return '<div class="stepper"><div class="stepper-nodes">' + nodes + '</div></div>';
  }

  function renderPrev(highlightRef) {
    const tb = document.getElementById('prevRows');
    if (!tb) return;
    const sorted = claims.slice().sort((a, b) => new Date(b.submitted) - new Date(a.submitted));
    tb.innerHTML = '';
    if (!sorted.length) {
      tb.innerHTML = '<tr><td colspan="6" class="prev-empty">No claims submitted yet — a submitted claim will appear here.</td></tr>';
      return;
    }
    sorted.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'claim-row' + (c.ref === highlightRef ? ' row-new' : '');
      const flagBadge = c.kmFlagged
        ? ' <span class="km-flag-badge" title="The kilometres and/or the route reflects a previous disbursement. Please ensure accuracy and integrity of disbursement.">!</span>'
        : '';
      const lateBadge = isLateClaim(c)
        ? ' <span title="Disbursement submitted 90 days after initial day of purchase. Falls outside policy terms." style="display:inline-block;background:#f5a623;color:#3a2c00;font-weight:700;border-radius:4px;padding:0 6px;font-size:12px;cursor:help;">&#9888;</span>'
        : '';
      tr.innerHTML =
        '<td class="ref">' + c.ref + flagBadge + lateBadge + '</td>' +
        '<td>' + fmtDate(c.submitted) + '</td>' +
        '<td>' + typeLabel(c) + '</td>' +
        '<td style="text-align:right">' + money.format(c.grandTotal) + '</td>' +
        '<td>' + pillFor(c.status) + '</td>' +
        '<td style="text-align:right"><button class="mini-btn" data-view="' + c.ref + '">View</button> ' +
          '<button class="mini-btn" data-pdf="' + c.ref + '">PDF</button> ' +
          '<button class="mini-btn" data-recall="' + c.ref + '">Recall</button> ' +
          '<button class="mini-btn danger" data-delete="' + c.ref + '">Delete</button></td>';
      tb.appendChild(tr);

      const pr = document.createElement('tr');
      pr.className = 'progress-row';
      pr.innerHTML = '<td colspan="6">' + stepperHtml(typeof c.stage === 'number' ? c.stage : 1) + '</td>';
      tb.appendChild(pr);
    });
    tb.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => openClaim(claims.find(x => x.ref === b.dataset.view))));
    tb.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => generatePDF(claims.find(x => x.ref === b.dataset.pdf))));
    tb.querySelectorAll('[data-recall]').forEach(b => b.addEventListener('click', () => recallClaim(b.dataset.recall)));
    tb.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteClaim(b.dataset.delete)));
  }

  // ---- Recall: reopen a claim into New Claim for editing (progress is preserved) ----
  let editingRef = null;
  let editingProofName = '';
  let editingProofPath = '';
  const editBanner = document.getElementById('editBanner');
  const submitBtnEl = document.getElementById('submitBtn');

  function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; }

  // Show a "proof already on file" marker on a recalled row's upload button.
  function markRowProofOnFile(tr) {
    const b = tr.querySelector('.odo-btn');
    if (b) {
      b.classList.add('has-photo');
      b.innerHTML = '<span class="odo-ok" title="Proof on file">&#10003;</span>';
    }
  }

  function fillKmRow(tr, r) {
    tr.querySelector('input[type=date]').value = r.date || '';
    const texts = tr.querySelectorAll('input[type=text]');
    if (texts[0]) texts[0].value = r.from || '';
    if (texts[1]) texts[1].value = r.to || '';
    tr.querySelector('.km-input').value = r.km || '';
    tr.dataset.proofPath = r.proofPath || '';
    if (r.proofPath) markRowProofOnFile(tr);
  }
  function fillOtherRow(tr, r) {
    tr.querySelector('input[type=date]').value = r.date || '';
    tr.querySelector('input[type=text]').value = r.desc || '';
    const sel = tr.querySelector('.cur-select'); if (sel) sel.value = r.currency || 'ZAR';
    tr.querySelector('.amt-input').value = (r.amount != null ? r.amount : '');
    if (r.hash) tr.dataset.fileHash = r.hash;
    if (r.sig) tr.dataset.sig = r.sig;
    tr.dataset.proofPath = r.proofPath || '';
    if (r.proofPath) markRowProofOnFile(tr);
  }

  function populateForm(c) {
    setVal('empName', c.employee.name);
    setVal('empEmail', c.employee.email);
    setVal('empSite', c.employee.site);
    setVal('empMachine', c.employee.machine);
    setVal('carReg', c.employee.carReg);
    setVal('bankHolder', c.banking.holder);
    setVal('bankName', c.banking.bank);
    setVal('bankAcc', c.banking.acc);

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

  function startEdit(ref, proofName, proofPath) {
    editingRef = ref;
    editingProofName = proofName || '';
    editingProofPath = proofPath || '';
    document.getElementById('editRef').textContent = ref;
    if (editBanner) editBanner.classList.remove('hidden');
    if (submitBtnEl) submitBtnEl.textContent = 'Update claim';
  }
  function endEdit() {
    editingRef = null;
    editingProofName = '';
    editingProofPath = '';
    if (editBanner) editBanner.classList.add('hidden');
    if (submitBtnEl) submitBtnEl.textContent = 'Submit to HOD';
  }
  document.getElementById('cancelEdit').addEventListener('click', () => {
    endEdit();
    resetForm();
    if (submitMsg) { submitMsg.textContent = ''; submitMsg.className = 'submit-msg'; }
    showView('previous');
  });

  function recallClaim(ref) {
    const c = claims.find(x => x.ref === ref);
    if (!c) return;
    populateForm(c);
    startEdit(ref, c.banking.proofName, c.banking.proofPath);
    if (submitMsg) { submitMsg.textContent = ''; submitMsg.className = 'submit-msg'; }
    showView('new');
    showToast('Disbursement ' + ref + ' reopened for editing. Its progress is unchanged.', 5000);
  }

  function deleteClaim(ref) {
    showConfirm('Are you sure that you want to delete this submitted disbursement? Once deleted, it cannot be retrieved.', () => {
      const i = claims.findIndex(x => x.ref === ref);
      let removedId = null;
      if (i >= 0) { removedId = claims[i].id; claims.splice(i, 1); }
      if (editingRef === ref) { endEdit(); resetForm(); }
      recomputeKmFlags();
      renderPrev();
      saveClaims();
      if (removedId) deleteClaimRow(removedId);
      showToast('Disbursement ' + ref + ' deleted.', 4000);
    });
  }

  function collectClaim() {
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const km = [];
    kmBody.querySelectorAll('tr').forEach(tr => {
      const date = tr.querySelector('input[type=date]').value;
      const texts = tr.querySelectorAll('input[type=text]');
      const dist = parseFloat(tr.querySelector('.km-input').value) || 0;
      const kmFile = (tr.querySelector('.odo-input') && tr.querySelector('.odo-input').files[0]) || null;
      const kmPath = tr.dataset.proofPath || '';
      const hasPhoto = !!(kmFile || kmPath || tr.querySelector('.odo-thumb'));
      if (dist > 0 || date || (texts[0] && texts[0].value)) {
        km.push({ date, from: texts[0] ? texts[0].value : '', to: texts[1] ? texts[1].value : '', km: dist, amount: dist * KM_RATE, hasPhoto, proofPath: kmPath, _file: kmFile });
      }
    });

    const other = [];
    otherBody.querySelectorAll('tr').forEach(tr => {
      const date = tr.querySelector('input[type=date]').value;
      const desc = tr.querySelector('input[type=text]').value;
      const cur = tr.querySelector('.cur-select').value;
      const amt = parseFloat(tr.querySelector('.amt-input').value) || 0;
      const otherFile = (tr.querySelector('.odo-input') && tr.querySelector('.odo-input').files[0]) || null;
      const otherPath = tr.dataset.proofPath || '';
      const hasProof = !!(otherFile || otherPath || tr.querySelector('.odo-thumb'));
      if (amt > 0 || date || desc) {
        other.push({ date, desc, currency: cur, amount: amt, rate: RATES[cur] || 1, zar: amt * (RATES[cur] || 1), hasProof, hash: tr.dataset.fileHash || '', sig: tr.dataset.sig || '', proofPath: otherPath, _file: otherFile });
      }
    });

    const kmTotal = km.reduce((s, r) => s + r.amount, 0);
    const otherTotal = other.reduce((s, r) => s + r.zar, 0);
    const proofFile = bankProofInput.files[0];

    return {
      id: newId(),
      ref: newRef(),
      submitted: new Date(),
      status: 'Pending HOD',
      stage: 1, // 0 filled in · 1 submitted to HOD · 2 submitted for payment · 3 paid
      employee: {
        name: val('empName'), email: val('empEmail'),
        site: val('empSite'), machine: val('empMachine'), carReg: val('carReg')
      },
      banking: {
        holder: val('bankHolder'), bank: val('bankName'), acc: val('bankAcc'),
        proofName: proofFile ? proofFile.name : (editingProofName || ''),
        proofPath: editingProofPath || '',
        _file: proofFile || null
      },
      km, other, kmTotal, otherTotal, grandTotal: kmTotal + otherTotal
    };
  }

  function resetForm() {
    kmBody.innerHTML = ''; addRow('km'); addRow('km');
    otherBody.innerHTML = ''; addRow('other'); addRow('other');
    ['bankHolder', 'bankName', 'bankAcc', 'carReg'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    bankProofInput.value = '';
    bankProofBtn.classList.remove('has-file', 'field-error', 'busy');
    bankProofBtn.innerHTML = uploadSvg + '<span class="pf-label">Upload bank confirmation letter</span>';
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
  // ---- Proof documents: download / print stored images via short-lived signed URLs ----
  async function getSignedUrl(path, opts) {
    const sb = window.mdgAuth && window.mdgAuth.client;
    if (!sb || !path) return null;
    const { data, error } = await sb.storage.from('claim-proofs').createSignedUrl(path, 300, opts || {});
    if (error) { console.error('Could not open proof:', error.message); return null; }
    return data ? data.signedUrl : null;
  }

  async function downloadProof(path) {
    const name = (path || '').split('/').pop() || 'proof';
    const url = await getSignedUrl(path, { download: name });   // forces a download with the original filename
    if (!url) { showToast('Could not open that file. Please try again.', 4000); return; }
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function printProof(path) {
    const url = await getSignedUrl(path);
    if (!url) { showToast('Could not open that file. Please try again.', 4000); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Please allow pop-ups so the proof can open for printing.', 5000); return; }
    if (/\.pdf(\?|$)/i.test(path)) {
      w.location = url;                          // the browser's PDF viewer handles printing
    } else {
      w.document.write('<html><head><title>Print proof</title>' +
        '<style>html,body{margin:0;padding:0}img{display:block;max-width:100%;margin:0 auto}</style></head>' +
        '<body><img src="' + url + '" onload="setTimeout(function(){window.focus();window.print();},150)"></body></html>');
      w.document.close();
    }
  }

  // The "Proof documents" section shown in the claim detail.
  function buildProofs(c) {
    const items = [];
    if (c.banking && c.banking.proofPath) {
      items.push({ path: c.banking.proofPath, label: 'Bank confirmation letter' });
    }
    (c.km || []).forEach((r, i) => {
      if (r.proofPath) {
        const route = (r.from || '') + (r.to ? ' \u2192 ' + r.to : '');
        items.push({ path: r.proofPath, label: 'Odometer photo' + (route ? ' (' + route + ')' : ' (row ' + (i + 1) + ')') });
      }
    });
    (c.other || []).forEach((r, i) => {
      if (r.proofPath) items.push({ path: r.proofPath, label: 'Receipt' + (r.desc ? ' (' + r.desc + ')' : ' (row ' + (i + 1) + ')') });
    });
    if (!items.length) return '';
    let h = '<h4>Proof documents</h4><table class="detail-kv">';
    items.forEach(it => {
      h += '<tr><td>' + escapeHtml(it.label) + '</td>' +
        '<td style="text-align:right; white-space:nowrap;">' +
        '<button class="mini-btn" data-proof-action="download" data-proof-path="' + it.path + '">Download</button> ' +
        '<button class="mini-btn" data-proof-action="print" data-proof-path="' + it.path + '">Print</button>' +
        '</td></tr>';
    });
    h += '</table>';
    return h;
  }

  function buildDetail(c) {
    let h = '<table class="detail-kv">' +
      row2('Employee', c.employee.name) +
      row2('Email', c.employee.email) + row2('Site', c.employee.site) +
      row2('Machine', c.employee.machine) +
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
    h += '<h4>Summary</h4><table class="detail-kv">' +
      row2('Travelling', money.format(c.kmTotal)) + row2('Other claims', money.format(c.otherTotal)) +
      '<tr class="tot"><th>Grand total</th><td>' + money.format(c.grandTotal) + '</td></tr></table>';
    if (c.kmFlagged) {
      h += '<div class="km-flag" style="margin-top:18px;">The kilometres and/or route on this claim reflect a previous disbursement. Please ensure the accuracy and integrity of this disbursement.</div>';
    }
    if (isLateClaim(c)) {
      h += '<div style="margin-top:14px;background:#fff4e0;border:1px solid #f5a623;color:#7a5300;border-radius:8px;padding:10px 12px;font-size:14px;">&#9888; Disbursement submitted 90 days after initial day of purchase. Falls outside policy terms.</div>';
    }
    h += '<h4>Proof documents</h4><div id="proofDocs" class="proof-list">Loading…</div>';
    return h;
  }

  // ---- Proof documents: view / download / print (private, via short-lived signed links) ----
  function proofIsImage(path) {
    return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(path || '');
  }
  async function proofSignedUrl(path) {
    const sb = window.mdgAuth && window.mdgAuth.client;
    if (!sb || !path) return null;
    const { data, error } = await sb.storage.from('claim-proofs').createSignedUrl(path, 300);
    if (error) { console.error('Could not create link:', error.message); return null; }
    return data ? data.signedUrl : null;
  }
  function collectProofs(c) {
    const list = [];
    (c.km || []).forEach((r, i) => { if (r.proofPath) list.push({ label: 'Odometer photo — travelling row ' + (i + 1), path: r.proofPath }); });
    (c.other || []).forEach((r, i) => { if (r.proofPath) list.push({ label: 'Receipt — other claim row ' + (i + 1), path: r.proofPath }); });
    if (c.banking && c.banking.proofPath) list.push({ label: 'Bank confirmation letter', path: c.banking.proofPath, filename: c.banking.proofName });
    return list;
  }
  async function downloadProof(path, filename) {
    const url = await proofSignedUrl(path);
    if (!url) { showToast('Could not open that file.', 4000); return; }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj; a.download = filename || path.split('/').pop();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 5000);
    } catch (e) { console.error('Download failed:', e); showToast('Could not download that file.', 4000); }
  }
  async function printProof(path) {
    const url = await proofSignedUrl(path);
    if (!url) { showToast('Could not open that file.', 4000); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups for this site to print the proof.', 5000); return; }
    if (proofIsImage(path)) {
      w.document.write('<html><head><title>Proof</title><style>@page{margin:12mm}body{margin:0}img{max-width:100%;display:block;margin:0 auto}</style></head><body><img src="' + url + '" onload="setTimeout(function(){window.focus();window.print();},250)"></body></html>');
      w.document.close();
    } else {
      w.location.href = url;   // PDFs open in the browser's own viewer, which has a print button
    }
  }
  async function renderProofDocs(c) {
    const wrap = document.getElementById('proofDocs');
    if (!wrap) return;
    const proofs = collectProofs(c);
    if (!proofs.length) {
      wrap.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">No proof documents were attached to this claim.</div>';
      return;
    }
    wrap.innerHTML = '';
    proofs.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--border);';
      const name = document.createElement('span');
      name.textContent = p.label;
      name.style.cssText = 'flex:1;font-size:13px;';
      const dl = document.createElement('button');
      dl.className = 'mini-btn'; dl.type = 'button'; dl.textContent = 'Download';
      dl.addEventListener('click', () => downloadProof(p.path, p.filename));
      const pr = document.createElement('button');
      pr.className = 'mini-btn'; pr.type = 'button'; pr.textContent = 'Print';
      pr.addEventListener('click', () => printProof(p.path));
      row.appendChild(name); row.appendChild(dl); row.appendChild(pr);
      wrap.appendChild(row);
    });
  }

  function openClaim(c) {
    if (!c) return;
    modalClaim = c;
    document.getElementById('mRef').textContent = c.ref;
    document.getElementById('mSub').textContent = 'Submitted ' + fmtDateTime(c.submitted) + '  ·  ' + c.status;
    document.getElementById('mBody').innerHTML = buildDetail(c);
    modal.classList.remove('hidden');
    renderProofDocs(c);
  }
  function closeModal() { modal.classList.add('hidden'); }
  document.getElementById('mClose').addEventListener('click', closeModal);
  document.getElementById('mCloseBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.getElementById('mPdf').addEventListener('click', () => { if (modalClaim) generatePDF(modalClaim); });

  /* ---- Confirmation dialog ---- */
  const confirmModal = document.getElementById('confirmModal');
  let confirmCb = null;
  function showConfirm(message, onConfirm) {
    document.getElementById('confirmMsg').textContent = message;
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

  function generatePDF(c) {
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
        ['Employee Name', c.employee.name || '—', 'Date', fmtDate(c.submitted)],
        ['Email', c.employee.email || '—', 'Car Registration Number', c.employee.carReg || '—'],
        ['Site', c.employee.site || '—', 'Machine', c.employee.machine || '—']
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
      body: [
        ['H.O.D / Site Manager', '', '', ''],
        ['Employee', c.employee.name || '', '', fmtDate(c.submitted)]
      ],
      headStyles: { fillColor: NAVY, textColor: 255 },
      margin: { left: M, right: M }
    });

    if (c.kmFlagged) {
      y = doc.lastAutoTable.finalY + 16;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(150, 100, 20);
      const note = 'Note: The kilometres and/or route on this claim reflect a previous disbursement. Please ensure the accuracy and integrity of this disbursement.';
      doc.text(doc.splitTextToSize(note, pageW - 2 * M), M, y);
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
    }

    try {
      doc.save(c.ref + '.pdf');
      showToast('Generated ' + c.ref + '.pdf. If no download started, this in-app preview is blocking it — open the app in a browser to save it.', 7000);
    } catch (e) {
      try { window.open(doc.output('bloburl'), '_blank'); } catch (e2) {}
      showToast('Your PDF is ready, but this preview blocked the download. Open the app in a browser to save ' + c.ref + '.pdf.', 7000);
    }
  }

  /* ===== Admin: editable sites, machines and km rate (persisted in this browser) ===== */
  const DEFAULT_SITES = ['Venetia', 'ARM', 'Styldrift', 'Lonmin', 'Thembelani', 'PMC', 'Ivan Plats', 'Zondereinde', 'Cullinan', 'Finsch', 'South Deep', 'Evander', 'Sasol Kromdraai', 'Sasol Bokamoso', 'Rosh Pina'];
  let SITES = DEFAULT_SITES.slice();
  const CONFIG_VERSION = 2; // bump when the built-in site list changes so saved copies refresh

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function loadConfig() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('mdg-config') || '{}'); } catch (e) {}
    // Only trust saved sites from a config built on the current site list; otherwise use the new defaults.
    if (cfg.version === CONFIG_VERSION && Array.isArray(cfg.sites)) SITES = cfg.sites.slice();
    else SITES = DEFAULT_SITES.slice();
    if (Array.isArray(cfg.machines) && cfg.machines.length) { MACHINES.length = 0; cfg.machines.forEach(m => MACHINES.push(m)); }
    if (typeof cfg.kmRate === 'number' && cfg.kmRate > 0) KM_RATE = cfg.kmRate;
    saveConfig(); // re-save under the current version
  }
  function saveConfig() {
    try { localStorage.setItem('mdg-config', JSON.stringify({ version: CONFIG_VERSION, sites: SITES, machines: MACHINES, kmRate: KM_RATE })); } catch (e) {}
  }

  // Type-ahead combobox for Site, constrained to the SITES list (admin-editable).
  function initSiteCombo() {
    const input = document.getElementById('empSite');
    const list = document.getElementById('siteList');
    if (!input || !list) return;
    let shown = [];
    let activeIdx = -1;
    function filter(q) {
      q = q.trim().toLowerCase();
      const src = q ? SITES.filter(s => s.toLowerCase().includes(q)) : SITES;
      return src.slice(0, 50);
    }
    function render() {
      shown = filter(input.value);
      activeIdx = -1;
      if (!shown.length) { list.innerHTML = '<div class="combo-empty">No matching site</div>'; list.classList.remove('hidden'); return; }
      list.innerHTML = shown.map((s, i) => '<div class="combo-opt" data-i="' + i + '">' + escapeHtml(s) + '</div>').join('');
      list.classList.remove('hidden');
    }
    function choose(s) { input.value = s; input.classList.remove('field-error'); list.classList.add('hidden'); }
    function highlight() {
      const opts = list.querySelectorAll('.combo-opt');
      opts.forEach((o, i) => o.classList.toggle('active', i === activeIdx));
      if (opts[activeIdx]) opts[activeIdx].scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
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
      SITES.push(v); saveConfig(); renderAdminSites(); inp.value = ''; inp.focus();
    });

    const addMachineBtn = document.getElementById('addMachine');
    if (addMachineBtn) addMachineBtn.addEventListener('click', () => {
      const inp = document.getElementById('newMachine');
      const v = inp.value.trim();
      if (!v) return;
      if (MACHINES.some(m => m.toLowerCase() === v.toLowerCase())) { adminFlash('“' + v + '” is already in the machines list.', true); return; }
      MACHINES.push(v); saveConfig(); renderAdminMachines(document.getElementById('machineFilter').value); inp.value = ''; inp.focus();
    });

    const filter = document.getElementById('machineFilter');
    if (filter) filter.addEventListener('input', () => renderAdminMachines(filter.value));

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
  initSiteCombo();
  renderAdminSites();
  renderAdminMachines('');
  const kmRateInput = document.getElementById('kmRateInput');
  if (kmRateInput) kmRateInput.value = KM_RATE;
  wireAdmin();

  /* ---- Policy assistant: answers questions using the Disbursement Policy ---- */
  const POLICY_FALLBACK_HTML =
    'Unfortunately your query is not supported by the disbursement policy. If you require further assistance, please contact:<br><br>' +
    '&bull; Jean Du Toit (CHRO) <a href="mailto:JDuToit@masterdrilling.com">JDuToit@masterdrilling.com</a><br>' +
    '&bull; Anneke Brink (HR Business Partner) <a href="mailto:AnnekeK@masterdrilling.com">AnnekeK@masterdrilling.com</a><br>' +
    '&bull; Angelina Lira (HR Business Partner) <a href="mailto:AngelinaL@masterdrilling.com">AngelinaL@masterdrilling.com</a>';

  function policyChatAdd(role, text, isHtml) {
    const box = document.getElementById('policyChat');
    if (!box) return null;
    const b = document.createElement('div');
    b.className = 'chat-msg ' + (role === 'q' ? 'chat-q' : 'chat-a');
    if (isHtml) b.innerHTML = text; else b.textContent = text;   // AI/user text is set as textContent (safe)
    box.appendChild(b);
    box.scrollTop = box.scrollHeight;
    return b;
  }

  async function askPolicy() {
    const input = document.getElementById('policyQuestion');
    const btn = document.getElementById('policyAskBtn');
    const policyEl = document.getElementById('policyText');
    if (!input || !policyEl) return;
    const question = (input.value || '').trim();
    if (!question) return;

    policyChatAdd('q', question);
    input.value = '';
    if (btn) btn.disabled = true;
    const thinking = policyChatAdd('a', 'Thinking…');

    // The policy shown on the page IS the assistant's only source of truth.
    const policyText = policyEl.innerText;
    const prompt =
      "You are an assistant that answers Master Drilling Group employees' questions about the company Disbursement Policy. " +
      'Use ONLY the policy text provided below to answer. Be concise, clear, and helpful, and do not invent rules that are not in the policy. ' +
      'If the question cannot be answered from the policy text, reply with exactly this token and nothing else: NOT_IN_POLICY\n\n' +
      '--- POLICY START ---\n' + policyText + '\n--- POLICY END ---\n\n' +
      'Question: ' + question;

    try {
      const resp = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + AI_PROXY_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!resp.ok) throw new Error('proxy ' + resp.status);
      const data = await resp.json();
      const raw = (data && data.result ? String(data.result) : '').trim();
      if (thinking) thinking.remove();
      if (!raw || /NOT_IN_POLICY/i.test(raw)) {
        policyChatAdd('a', POLICY_FALLBACK_HTML, true);
      } else {
        policyChatAdd('a', raw);
      }
    } catch (e) {
      console.error('Policy assistant error:', e);
      if (thinking) thinking.remove();
      policyChatAdd('a', 'Sorry, something went wrong reaching the assistant. Please try again.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  (function wirePolicyAssistant() {
    const btn = document.getElementById('policyAskBtn');
    const input = document.getElementById('policyQuestion');
    if (btn) btn.addEventListener('click', askPolicy);
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askPolicy(); } });
  })();

  // Claims now live in the database and belong to whoever is signed in. script.js
  // runs before sign-in resolves, so we expose a hook the auth code calls once the
  // user is authenticated (see enterApp in index.html).
  // After sign-in, find out whether this user is an admin and, if so, reveal the
  // admin-only tabs. Note: this only affects what's SHOWN — the real protection is
  // the database RLS, which blocks non-admins from other people's data regardless.
  async function checkAdmin() {
    const sb = window.mdgAuth && window.mdgAuth.client;
    const user = window.mdgAuth && window.mdgAuth.user;
    if (!sb || !user) return;
    const { data, error } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
    if (error) { console.error('Admin check failed:', error.message); return; }
    window.mdgIsAdmin = !!(data && data.is_admin);
    if (window.mdgIsAdmin) {
      document.querySelectorAll('.nav-admin').forEach(el => el.classList.remove('hidden'));
    }
  }

  /* ---- Dashboard (admin only): company-wide disbursement control ---- */
  let dashRecords = [];

  function dashEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function loadDashboard() {
    const sb = window.mdgAuth && window.mdgAuth.client;
    if (!sb || !window.mdgIsAdmin) return;   // admins only; RLS enforces this too
    const { data, error } = await sb.from('disbursements')
      .select('data, created_at').order('created_at', { ascending: false });
    if (error) { console.error('Dashboard load failed:', error.message); return; }
    dashRecords = (data || []).map(row => {
      const c = row.data || {};
      const emp = c.employee || {};
      return {
        site: emp.site || '—',
        machine: emp.machine || '—',
        employee: emp.name || '—',
        total: (typeof c.grandTotal === 'number') ? c.grandTotal : 0,
        date: c.submitted || row.created_at,
        km: c.km || [],
        other: c.other || [],
        claim: c
      };
    });
    populateDashFilters();
    renderDashboard();
  }

  function dashUnique(arr) { return Array.from(new Set(arr)).filter(Boolean).sort(); }
  function dashFilters() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    return { site: g('dSite'), machine: g('dMachine'), employee: g('dEmployee'), from: g('dFrom'), to: g('dTo') };
  }
  function dashInRange(dateStr, from, to) {
    const d = new Date(dateStr);
    if (from && d < new Date(from + 'T00:00:00')) return false;
    if (to && d > new Date(to + 'T23:59:59')) return false;
    return true;
  }
  function dashFiltered() {
    const f = dashFilters();
    return dashRecords.filter(r =>
      (!f.site || r.site === f.site) &&
      (!f.machine || r.machine === f.machine) &&
      (!f.employee || r.employee === f.employee) &&
      dashInRange(r.date, f.from, f.to));
  }
  function dashFillSelect(id, options, allLabel, keep) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">' + allLabel + '</option>' +
      options.map(o => '<option>' + dashEsc(o) + '</option>').join('');
    sel.value = (keep && options.indexOf(keep) >= 0) ? keep : '';
  }
  // Cascade: machines shown depend on the chosen site; employees on site + machine.
  function populateDashFilters() {
    const f = dashFilters();
    dashFillSelect('dSite', dashUnique(dashRecords.map(r => r.site)), 'All sites', f.site);
    const siteScope = dashRecords.filter(r => !f.site || r.site === f.site);
    dashFillSelect('dMachine', dashUnique(siteScope.map(r => r.machine)), 'All machines', f.machine);
    const machScope = siteScope.filter(r => !f.machine || r.machine === f.machine);
    dashFillSelect('dEmployee', dashUnique(machScope.map(r => r.employee)), 'All employees', f.employee);
  }

  function dashBreakdown(tableId, rows, key, label) {
    const map = {};
    rows.forEach(r => { const k = r[key] || '—'; (map[k] = map[k] || { count: 0, total: 0 }); map[k].count++; map[k].total += r.total || 0; });
    const entries = Object.keys(map).map(k => ({ k: k, count: map[k].count, total: map[k].total }))
      .sort((a, b) => b.total - a.total);   // biggest first — the ones worth questioning
    const tb = document.querySelector('#' + tableId + ' tbody');
    if (!tb) return;
    if (!entries.length) { tb.innerHTML = '<tr><td style="color:var(--text-dim)">No claims in view.</td></tr>'; return; }
    tb.innerHTML = '<tr><th>' + label + '</th><th style="text-align:right">Claims</th><th style="text-align:right">Total</th></tr>' +
      entries.map(e => '<tr><td>' + dashEsc(e.k) + '</td><td style="text-align:right">' + e.count + '</td><td style="text-align:right">' + money.format(e.total) + '</td></tr>').join('');
  }

  function dashDetail(rows) {
    const box = document.getElementById('dDetail');
    if (!box) return;
    if (!rows.length) { box.innerHTML = '<p style="color:var(--text-dim)">No claims match these filters.</p>'; return; }
    const sorted = rows.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    box.innerHTML = sorted.map((r, i) => {
      const items = [];
      (r.km || []).forEach(k => items.push('Travel: ' + (k.from || '?') + ' → ' + (k.to || '?') + ' (' + (k.km || 0) + ' km)'));
      (r.other || []).forEach(o => items.push((o.desc || 'Other') + ' — ' + (o.currency || 'ZAR') + ' ' + (o.amount != null ? (+o.amount).toFixed(2) : '')));
      return '<div class="dash-claim">' +
        '<div class="dash-claim-head"><strong>' + dashEsc(r.employee) + '</strong>' +
        '<span>' + dashEsc(r.site) + ' · ' + dashEsc(r.machine) + '</span>' +
        '<span>' + fmtDate(r.date) + '</span>' +
        '<span class="dash-claim-total">' + money.format(r.total) + '</span>' +
        '<button class="mini-btn" data-dash-idx="' + i + '">View</button></div>' +
        '<div class="dash-claim-items">' + (items.length ? items.map(dashEsc).join('  ·  ') : 'No line items') + '</div>' +
        '</div>';
    }).join('');
    box.querySelectorAll('[data-dash-idx]').forEach(b => {
      b.addEventListener('click', () => {
        const rec = sorted[parseInt(b.dataset.dashIdx, 10)];
        if (rec && rec.claim) openClaim(rec.claim);   // full detail incl. banking
      });
    });
  }

  function renderDashboard() {
    const rows = dashFiltered();
    const total = rows.reduce((s, r) => s + (r.total || 0), 0);
    const tEl = document.getElementById('dTotal'); if (tEl) tEl.textContent = money.format(total);
    const cEl = document.getElementById('dCount'); if (cEl) cEl.textContent = String(rows.length);
    dashBreakdown('dBySite', rows, 'site', 'Site');
    dashBreakdown('dByMachine', rows, 'machine', 'Machine');
    dashBreakdown('dByEmployee', rows, 'employee', 'Employee');
    dashDetail(rows);
  }

  (function wireDashboard() {
    ['dSite', 'dMachine', 'dEmployee', 'dFrom', 'dTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => { populateDashFilters(); renderDashboard(); });
    });
    const reset = document.getElementById('dReset');
    if (reset) reset.addEventListener('click', () => {
      ['dSite', 'dMachine', 'dEmployee', 'dFrom', 'dTo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      populateDashFilters(); renderDashboard();
    });
    // Refresh the data every time the Dashboard tab is opened.
    const navDash = document.querySelector('.nav-item[data-view="dashboard"]');
    if (navDash) navDash.addEventListener('click', loadDashboard);
  })();

  window.mdgApp = window.mdgApp || {};
  window.mdgApp.onAuthed = function () { loadClaims(); checkAdmin(); };

  recalc();

  // Empty Previous Claims table until this user's claims arrive from the database.
  renderPrev();

  // fetch today's currency rates
  fetchRates();
