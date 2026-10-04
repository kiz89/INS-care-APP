/* ============================================================
   INS Quotation App — UI controller
   ============================================================ */

'use strict';

const LS_DRAFT = 'insq_draft_v1';
const LS_LASTNO = 'insq_lastNo_v1';

function padNo(n) {
  n = parseInt(n, 10);
  if (!isFinite(n) || n < 0) n = 1;
  return String(n).padStart(4, '0');
}

function defaultState() {
  const last = parseInt(localStorage.getItem(LS_LASTNO) || '10', 10);
  const today = new Date();
  const iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  return {
    quoteNo: padNo(last + 1),
    date: iso,
    customer: { attention: '', name: '', address: '', phone: '', email: '' },
    project: '',
    items: [{ desc: '', unit: '', qty: '', rate: '' }],
    vatPercent: 0,
    terms: [
      'All prices are valid for 30 days from the date of submission of this quotation.',
      'Charges include work carried out at height using scaffolding and required safety equipment.'
    ],
    closing: 'Please do not hesitate to contact the undersigned should you require any further clarification.',
    signature: { name: 'Chathuranga Doolwala', designation: '', mobile: '+94 762946905' }
  };
}

let state = null;
let zoom = 1;
let saveTimer = null;

/* ---------- persistence ---------- */
function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_DRAFT, JSON.stringify(state));
      const el = document.getElementById('saveState');
      el.textContent = 'Draft saved \u2713';
      setTimeout(() => { el.textContent = 'Autosaved locally'; }, 1600);
      Store.markChanged();
    } catch (e) { /* storage unavailable */ }
  }, 300);
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.items)) return null;
    return d;
  } catch (e) { return null; }
}

/* ---------- DOM helpers ---------- */
const $ = id => document.getElementById(id);
function esc(s) { return String(s == null ? '' : s); }

/* ---------- items editor ---------- */
function itemRowHtml(it, idx, total) {
  const amt = (Number(it.qty) || 0) * (Number(it.rate) || 0);
  return `
  <div class="item-row" data-idx="${idx}">
    <div class="it-no">${idx + 1}</div>
    <textarea class="it-desc" data-f="desc" rows="1" placeholder="Description of work / materials">${esc(it.desc)}</textarea>
    <div class="it-ops">
      <label class="it-save" title="Tick this box, then press Add Item — the description and unit are saved to your library for future suggestions">
        <input type="checkbox" class="it-savecb"> Save
      </label>
      <button type="button" class="icon-btn" data-op="up" title="Move up" ${idx === 0 ? 'disabled' : ''}>&#8593;</button>
      <button type="button" class="icon-btn" data-op="down" title="Move down" ${idx === total - 1 ? 'disabled' : ''}>&#8595;</button>
      <button type="button" class="icon-btn danger" data-op="del" title="Remove">&#10005;</button>
    </div>
    <div class="it-sub">
      <label class="it-f f-unit"><span>Unit</span><input class="it-unit" data-f="unit" list="unitList" value="${esc(it.unit).replace(/"/g, '&quot;')}" placeholder="Point"></label>
      <label class="it-f f-qty"><span>Qty</span><input class="it-qty" data-f="qty" type="number" min="0" step="any" value="${esc(it.qty)}" placeholder="0"></label>
      <label class="it-f f-rate"><span>Rate (LKR)</span><input class="it-rate" data-f="rate" type="number" min="0" step="any" value="${esc(it.rate)}" placeholder="0.00"></label>
      <div class="it-f f-amt"><span>Amount (LKR)</span><div class="it-amt">${fmt2(amt)}</div></div>
    </div>
  </div>`;
}
function autoGrow(el) {
  if (!el || !el.classList.contains('it-desc')) return;
  el.style.height = 'auto';
  el.style.height = Math.max(38, el.scrollHeight + 2) + 'px'; // +2 = borders, prevents a 1px scroll bar
}
function renderItems() {
  const box = $('itemsBody');
  box.innerHTML = state.items.map((it, i) => itemRowHtml(it, i, state.items.length)).join('');
  box.querySelectorAll('.it-desc').forEach(autoGrow);
  updateTotalsBox();
}
function readItemRow(row) {
  return {
    desc: row.querySelector('[data-f=desc]').value,
    unit: row.querySelector('[data-f=unit]').value,
    qty: row.querySelector('[data-f=qty]').value,
    rate: row.querySelector('[data-f=rate]').value
  };
}
function updateTotalsBox() {
  const sub = state.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
  const vat = sub * ((Number(state.vatPercent) || 0) / 100);
  $('totSub').textContent = 'LKR ' + fmt2(sub);
  const vatRow = $('totVatRow');
  if (vat > 0) { vatRow.style.display = 'flex'; $('totVat').textContent = 'LKR ' + fmt2(vat); }
  else vatRow.style.display = 'none';
  $('totTotal').textContent = 'LKR ' + fmt2(sub + vat);
}

/* ---------- full form sync ---------- */
function syncFormFromState() {
  $('qNo').value = state.quoteNo;
  $('qDate').value = state.date;
  $('custAttention').value = state.customer.attention;
  $('custName').value = state.customer.name;
  $('custAddress').value = state.customer.address;
  $('custPhone').value = state.customer.phone;
  $('custEmail').value = state.customer.email;
  $('projectName').value = state.project;
  $('vatPercent').value = state.vatPercent || '';
  $('termsLines').value = state.terms.join('\n');
  $('closingText').value = state.closing;
  $('sigName').value = state.signature.name;
  $('sigDesignation').value = state.signature.designation;
  $('sigMobile').value = state.signature.mobile;
  renderItems();
}
function collectForm() {
  state.quoteNo = $('qNo').value.trim();
  state.date = $('qDate').value;
  state.customer.attention = $('custAttention').value;
  state.customer.name = $('custName').value;
  state.customer.address = $('custAddress').value;
  state.customer.phone = $('custPhone').value;
  state.customer.email = $('custEmail').value;
  state.project = $('projectName').value;
  state.vatPercent = Number($('vatPercent').value) || 0;
  state.terms = $('termsLines').value.split('\n').map(t => t.trim()).filter(Boolean);
  state.closing = $('closingText').value;
  state.signature.name = $('sigName').value;
  state.signature.designation = $('sigDesignation').value;
  state.signature.mobile = $('sigMobile').value;
}

/* ---------- preview ---------- */
function refreshPreview() {
  collectForm();
  const { pages } = buildPages(state);
  renderPreview($('pages'), pages, zoom);
  $('pageCount').textContent = pages.length + (pages.length === 1 ? ' page' : ' pages');
}
function setZoom(z, manual) {
  zoom = manual ? z : fitZoom($('pages'));
  if (manual) { /* fixed zoom */ }
  refreshPreview();
}

/* ---------- boot ---------- */
function bindEvents() {
  // any input change → state + preview + save
  document.getElementById('form').addEventListener('input', e => {
    if (e.target.closest('.item-row')) {
      const row = e.target.closest('.item-row');
      const idx = Number(row.dataset.idx);
      state.items[idx] = readItemRow(row);
      const amt = (Number(state.items[idx].qty) || 0) * (Number(state.items[idx].rate) || 0);
      row.querySelector('.it-amt').textContent = fmt2(amt);
      autoGrow(e.target);
      updateTotalsBox();
    }
    collectForm();
    refreshPreview();
    saveDraft();
  });

  // items operations (delegated)
  $('itemsBody').addEventListener('click', e => {
    const btn = e.target.closest('[data-op]');
    if (!btn) return;
    const row = btn.closest('.item-row');
    const idx = Number(row.dataset.idx);
    const op = btn.dataset.op;
    if (op === 'del') {
      state.items.splice(idx, 1);
      if (!state.items.length) state.items.push({ desc: '', unit: '', qty: '', rate: '' });
    } else if (op === 'up' && idx > 0) {
      [state.items[idx - 1], state.items[idx]] = [state.items[idx], state.items[idx - 1]];
    } else if (op === 'down' && idx < state.items.length - 1) {
      [state.items[idx + 1], state.items[idx]] = [state.items[idx], state.items[idx + 1]];
    }
    renderItems();
    refreshPreview();
    saveDraft();
  });

  $('btnAddItem').addEventListener('click', () => {
    // save any rows whose "Save" checkbox is ticked to the description library
    let saved = 0;
    document.querySelectorAll('.item-row').forEach(row => {
      const cb = row.querySelector('.it-savecb');
      if (cb && cb.checked) {
        const d = row.querySelector('[data-f=desc]').value;
        const u = row.querySelector('[data-f=unit]').value;
        if (d.trim()) { Store.addToCatalog(d, u); saved++; }
        cb.checked = false;
      }
    });
    if (saved) toast(saved + ' description' + (saved > 1 ? 's' : '') + ' saved to library \u2713');
    state.items.push({ desc: '', unit: '', qty: '', rate: '' });
    renderItems();
    refreshPreview();
    saveDraft();
    const rows = document.querySelectorAll('.item-row');
    rows[rows.length - 1].querySelector('[data-f=desc]').focus();
  });

  $('qNo').addEventListener('change', () => {
    const n = parseInt(state.quoteNo, 10);
    if (isFinite(n)) localStorage.setItem(LS_LASTNO, String(n));
  });

  /* view switching (mobile/tablet) */
  const setView = view => {
    document.body.dataset.view = view;
    document.querySelectorAll('.vs-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'preview') setZoom(fitZoom($('pages')));
    window.scrollTo({ top: 0 });
  };
  document.querySelectorAll('.vs-btn').forEach(b => {
    b.addEventListener('click', () => setView(b.dataset.view));
  });

  /* export / new actions — desktop buttons + mobile bar share these */
  const newQuotation = () => {
    const cur = parseInt(state.quoteNo, 10);
    const base = isFinite(cur) ? cur : parseInt(localStorage.getItem(LS_LASTNO) || '10', 10);
    const next = padNo(base + 1);
    localStorage.setItem(LS_LASTNO, String(parseInt(next, 10)));
    state = defaultState();
    state.quoteNo = next;
    syncFormFromState();
    refreshPreview();
    saveDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const exportPdf = () => {
    collectForm();
    const blob = buildPdfBlob(state);
    const rec = Store.archiveDocument(state, 'pdf');
    downloadBlob(blob, buildFilename(state, 'pdf'));
    toast('Quotation ' + rec.no + ' saved to Documents \u2713');
  };
  const exportDocx = () => {
    collectForm();
    const blob = buildDocxBlob(state);
    const rec = Store.archiveDocument(state, 'docx');
    downloadBlob(blob, buildFilename(state, 'docx'));
    toast('Quotation ' + rec.no + ' saved to Documents \u2713');
  };
  $('btnNew').addEventListener('click', newQuotation);
  $('btnNewM').addEventListener('click', newQuotation);
  $('btnPDF').addEventListener('click', exportPdf);
  $('btnPDFM').addEventListener('click', exportPdf);
  $('btnDOCX').addEventListener('click', exportDocx);
  $('btnDOCXM').addEventListener('click', exportDocx);

  $('btnRecords').addEventListener('click', () => openRecords('docs'));
  $('btnRecordsM').addEventListener('click', () => openRecords('docs'));

  $('zoomFit').addEventListener('click', () => setZoom(fitZoom($('pages'))));
  $('zoomIn').addEventListener('click', () => setZoom(Math.min(1.6, zoom + 0.15), true));
  $('zoomOut').addEventListener('click', () => setZoom(Math.max(0.4, zoom - 0.15), true));

  window.addEventListener('resize', () => {
    if ($('pages').clientWidth > 50) setZoom(fitZoom($('pages')));
  });
}

function boot() {
  state = loadDraft() || defaultState();
  document.body.dataset.view = 'edit';
  bindEvents();
  syncFormFromState();
  setZoom(fitZoom($('pages')));
  initCloud();
  wireRecordsModal();
  wireAutocomplete();
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = null;
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ============================================================
   Google Drive sync orchestration
   ============================================================ */
const Cloud = {
  connected: false,
  timer: null,

  isEnabled() {
    const s = Store.loadSettings();
    return s.autoSync && this.connected;
  },
  scheduleSync() {
    if (!this.isEnabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.syncNow(true), 4000);
  },
  async syncNow(silent) {
    if (!this.connected) return;
    try {
      collectForm();
      await Drive.upload(JSON.stringify(Store.buildBackup(state)));
      localStorage.setItem('insq_lastSync', String(Date.now()));
      updateCloudStatus();
      if (!silent) toast('Backed up to Google Drive \u2713');
    } catch (e) {
      this.connected = false;
      updateCloudStatus();
      if (!silent) toast('Drive sync failed: ' + e.message, 'error');
    }
  }
};

function updateCloudStatus() {
  const el = document.getElementById('cloudState');
  if (!el) return;
  if (Cloud.connected) {
    const last = parseInt(localStorage.getItem('insq_lastSync') || '0', 10);
    const t = last ? new Date(last).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    el.textContent = '\u00b7 Drive synced ' + t;
  } else if (Store.loadSettings().clientId) {
    el.textContent = '\u00b7 Drive: sign in from Records';
  } else {
    el.textContent = '';
  }
}

async function initCloud() {
  const s = Store.loadSettings();
  Drive.clientId = s.clientId || '';
  updateCloudStatus();
  if (!s.clientId) return;
  try {
    await Drive.connect(false);          // silent — works if the app was authorized before
    Cloud.connected = true;
    updateCloudStatus();
  } catch (e) { /* needs interactive sign-in — user connects from Records */ }
}
window.Cloud = Cloud;   // Store.markChanged reads it via window (const ≠ window property)

/* ============================================================
   Records modal — Documents | Descriptions | Backup & Sync
   ============================================================ */
let acState = { open: false, items: [], active: -1, target: null };

function openRecords(tab) {
  document.getElementById('overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  switchRecordsTab(tab || 'docs');
}
function closeRecords() {
  document.getElementById('overlay').classList.add('hidden');
  document.body.style.overflow = '';
}
function switchRecordsTab(tab) {
  document.querySelectorAll('.mtab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const body = document.getElementById('modalBody');
  if (tab === 'docs') renderDocsTab(body);
  else if (tab === 'lib') renderLibTab(body);
  else renderSyncTab(body);
}

function renderDocsTab(body) {
  body.innerHTML = `
    <input id="docSearch" class="searchbox" type="search" placeholder="Search by number, date (04/10/2026), customer or project">
    <div id="docsList" class="docslist"></div>`;
  const render = () => {
    const list = Store.searchDocs(document.getElementById('docSearch').value);
    const box = document.getElementById('docsList');
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + (Store.loadDocs().length
        ? 'No documents match your search.'
        : 'No saved documents yet — every time you download a PDF or Word file, the quotation is archived here automatically.') + '</div>';
      return;
    }
    box.innerHTML = list.map(d => `
      <div class="doc-row">
        <div class="doc-main">
          <div class="doc-l1"><b>${esc(d.no)}</b><span class="doc-date">${esc(fmtDateDisplay(d.date))}</span></div>
          <div class="doc-sub">${esc(d.customer || d.project || 'No customer set')}${d.project ? ' \u00b7 ' + esc(d.project) : ''}</div>
        </div>
        <div class="doc-right">
          <b>LKR ${fmt2(d.total)}</b>
          <div class="doc-sub">${new Date(d.exportedAt).toLocaleDateString()} ${(d.kinds || []).join(', ')}</div>
        </div>
        <div class="doc-acts">
          <button type="button" class="icon-btn" data-doc-open="${esc(d.no)}" title="Open this quotation in the editor">&#128193;</button>
          <button type="button" class="icon-btn danger" data-doc-del="${esc(d.no)}" title="Delete record">&#10005;</button>
        </div>
      </div>`).join('');
  };
  render();
  document.getElementById('docSearch').addEventListener('input', render);
}

function renderLibTab(body) {
  const list = Store.loadCatalog();
  body.innerHTML = `
    <p class="hintline">Tick <b>Save</b> on an item row and press <b>+ Add Item</b> — the description and its unit are kept here. Next time you type a matching word in any description box, it will be suggested automatically.</p>
    <div class="liblist" id="libList"></div>`;
  const box = document.getElementById('libList');
  if (!list.length) { box.innerHTML = '<div class="empty">The library is empty — save your first description from any item row.</div>'; return; }
  box.innerHTML = list.map((c, i) => `
    <div class="lib-row">
      <div class="lib-desc">${esc(c.desc)}</div>
      ${c.unit ? `<span class="ac-unit">${esc(c.unit)}</span>` : ''}
      <button type="button" class="icon-btn danger" data-lib-del="${i}" title="Remove from library">&#10005;</button>
    </div>`).join('');
}

function renderSyncTab(body) {
  const s = Store.loadSettings();
  const last = parseInt(localStorage.getItem('insq_lastSync') || '0', 10);
  const docs = Store.loadDocs().length, cat = Store.loadCatalog().length;
  body.innerHTML = `
    <div class="syncbox">
      <div class="sync-status">
        <div>
          <b>Google Drive ${Cloud.connected ? '\u2014 connected \u2713' : (s.clientId ? '\u2014 not signed in' : '\u2014 not set up')}</b>
          <div class="doc-sub">${Cloud.connected
            ? 'Records auto-upload to your Drive about 4 seconds after every change.'
            : last ? 'Last sync: ' + new Date(last).toLocaleString() : 'Connect to mirror all records (library, documents, drafts) to your Drive.'}</div>
        </div>
        <div class="sync-btns">
          ${Cloud.connected
            ? '<button type="button" class="btn add" id="btnSyncNow" style="width:auto;padding:10px 14px">Sync now</button><button type="button" class="icon-btn" id="btnDisconnect" title="Sign out">&#128274;</button>'
            : `<button type="button" class="btn add" id="btnConnect" style="width:auto;padding:10px 14px" ${s.clientId ? '' : 'disabled title="Set your Client ID first"'}>Connect Google Drive</button>`}
        </div>
      </div>
      <label class="field slim" style="max-width:none">
        <span>Google OAuth Client ID <em class="hint">required once — see steps below</em></span>
        <div class="cidrow">
          <input id="clientIdInput" type="text" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${esc(s.clientId)}">
          <button type="button" class="icon-btn wide" id="btnSaveClientId" title="Save Client ID">&#10003;</button>
        </div>
      </label>
      <details class="setup">
        <summary>One-time setup: how to get a Client ID (free)</summary>
        <ol>
          <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> and create a project (any name, e.g. "INS Quotations").</li>
          <li>APIs &amp; Services \u2192 <b>Google Drive API</b> \u2192 Enable.</li>
          <li>APIs &amp; Services \u2192 <b>OAuth consent screen</b> \u2192 External \u2192 fill your name/email \u2192 add your own Gmail as a <b>test user</b>.</li>
          <li>Credentials \u2192 <b>Create credentials \u2192 OAuth client ID</b> \u2192 type <b>Web application</b>.</li>
          <li>Under <b>Authorized JavaScript origins</b> add exactly the address you open this app from \u2014 e.g. <code>http://localhost:8770</code> or your hosted <code>https://...</code> URL. (Google does not allow <code>file://</code>.)</li>
          <li>Copy the Client ID (ends in <code>.apps.googleusercontent.com</code>) and paste it above, then Connect. Sign in with the Drive account you want the backup in.</li>
        </ol>
        <p class="doc-sub">A file named <b>${esc(Drive.FILE_NAME)}</b> will be kept in a Drive folder <b>${esc(Drive.FOLDER_NAME)}</b> and refreshed automatically. Use "Restore from Drive" on any other phone/PC to pull the same records.</p>
      </details>
      <div class="syncrow">
        <button type="button" class="btn add" id="btnRestoreDrive" style="width:auto;padding:10px 14px" ${Cloud.connected ? '' : 'disabled'}>\u21bb Restore from Drive</button>
        <label class="checkline"><input type="checkbox" id="autoSyncCb" ${s.autoSync ? 'checked' : ''}> Auto-upload changes to Drive</label>
      </div>
      <hr class="sep">
      <p class="hintline">No Drive? Manual backup works everywhere \u2014 keep the file safe (e.g. email it to yourself):</p>
      <div class="syncrow">
        <button type="button" class="btn add" id="btnBackupDl" style="width:auto;padding:10px 14px">\u2b07 Download backup file</button>
        <button type="button" class="btn add" id="btnBackupRestore" style="width:auto;padding:10px 14px">\u21cc Restore from file</button>
        <input type="file" id="restoreFile" accept=".json,application/json" hidden>
      </div>
      <hr class="sep">
      <div class="syncrow" style="justify-content:space-between">
        <span class="doc-sub">${docs} document${docs === 1 ? '' : 's'} \u00b7 ${cat} saved description${cat === 1 ? '' : 's'}</span>
        <button type="button" class="icon-btn danger wide" id="btnWipe" title="Delete all local data">Clear all data</button>
      </div>
    </div>`;
}

function refreshEditorFromStore() {
  state = loadDraft() || defaultState();
  syncFormFromState();
  refreshPreview();
  saveDraft();
}

function wireRecordsModal() {
  document.getElementById('modalClose').addEventListener('click', closeRecords);
  document.getElementById('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeRecords(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRecords(); });
  document.querySelectorAll('.mtab').forEach(b => b.addEventListener('click', () => switchRecordsTab(b.dataset.tab)));

  const body = document.getElementById('modalBody');
  body.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.docOpen !== undefined) {
      const doc = Store.loadDocs().find(d => d.no === t.dataset.docOpen);
      if (doc) {
        state = JSON.parse(JSON.stringify(doc.state));
        syncFormFromState();
        refreshPreview();
        saveDraft();
        closeRecords();
        toast('Quotation ' + doc.no + ' opened in the editor');
      }
    } else if (t.dataset.docDel !== undefined) {
      if (confirm('Delete the record of quotation ' + t.dataset.docDel + '? (Exported files on disk are not affected.)')) {
        Store.deleteDocument(t.dataset.docDel);
        renderDocsTab(body);
        toast('Document record deleted');
      }
    } else if (t.dataset.libDel !== undefined) {
      Store.removeFromCatalog(Number(t.dataset.libDel));
      renderLibTab(body);
    } else if (t.id === 'btnSaveClientId') {
      const v = document.getElementById('clientIdInput').value.trim();
      const s = Store.loadSettings();
      s.clientId = v;
      Store.saveSettings(s);
      Drive.clientId = v;
      Drive.tokenClient = null;
      updateCloudStatus();
      toast(v ? 'Client ID saved \u2713' : 'Client ID cleared');
      renderSyncTab(body);
    } else if (t.id === 'btnConnect') {
      t.disabled = true; t.textContent = 'Signing in\u2026';
      try {
        await Drive.connect(true);
        Cloud.connected = true;
        updateCloudStatus();
        await Cloud.syncNow(true);
        toast('Google Drive connected \u2713 backup uploaded');
      } catch (err) { toast('Connect failed: ' + err.message, 'error'); }
      renderSyncTab(body);
    } else if (t.id === 'btnDisconnect') {
      Drive.disconnect();
      Cloud.connected = false;
      updateCloudStatus();
      renderSyncTab(body);
      toast('Signed out of Google Drive');
    } else if (t.id === 'btnSyncNow') {
      t.disabled = true; t.textContent = 'Syncing\u2026';
      await Cloud.syncNow(false);
      renderSyncTab(body);
    } else if (t.id === 'btnRestoreDrive') {
      t.disabled = true; t.textContent = 'Checking Drive\u2026';
      try {
        const remote = await Drive.download();
        if (!remote) { toast('No backup found on Google Drive yet'); renderSyncTab(body); return; }
        const info = { docs: (remote.docs || []).length, cat: (remote.catalog || []).length, savedAt: remote.savedAt };
        body.innerHTML = `
          <div class="syncbox">
            <h3 style="margin:0 0 8px;color:var(--navy)">Restore from Google Drive?</h3>
            <p class="hintline">Backup saved ${esc(new Date(info.savedAt).toLocaleString())} \u00b7 ${info.docs} documents \u00b7 ${info.cat} library descriptions.<br>
            This replaces everything currently on this device.</p>
            <div class="syncrow">
              <button type="button" class="btn add" id="btnRestoreYes" style="width:auto;padding:10px 16px">Restore now</button>
              <button type="button" class="icon-btn wide" id="btnRestoreNo">Cancel</button>
            </div>
          </div>`;
        document.getElementById('btnRestoreYes').addEventListener('click', () => {
          const r = Store.restoreBackup(remote);
          refreshEditorFromStore();
          updateCloudStatus();
          closeRecords();
          toast('Restored ' + r.docs + ' documents and ' + r.catalog + ' descriptions \u2713');
        });
        document.getElementById('btnRestoreNo').addEventListener('click', () => renderSyncTab(body));
      } catch (err) { toast('Restore failed: ' + err.message, 'error'); renderSyncTab(body); }
    } else if (t.id === 'btnBackupDl') {
      Store.downloadBackupFile();
      toast('Backup file downloading \u2014 keep it safe');
    } else if (t.id === 'btnBackupRestore') {
      document.getElementById('restoreFile').click();
    } else if (t.id === 'btnWipe') {
      if (confirm('Delete ALL local data (draft, library, documents, settings)? This cannot be undone. A Drive backup, if connected, is not touched.')) {
        localStorage.clear();
        location.reload();
      }
    }
  });
  body.addEventListener('change', e => {
    if (e.target.id === 'autoSyncCb') {
      const s = Store.loadSettings();
      s.autoSync = e.target.checked;
      Store.saveSettings(s);
      toast(s.autoSync ? 'Auto-upload to Drive is ON' : 'Auto-upload paused');
    } else if (e.target.id === 'restoreFile') {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const r = Store.restoreBackup(JSON.parse(rd.result));
          refreshEditorFromStore();
          updateCloudStatus();
          closeRecords();
          toast('Restored ' + r.docs + ' documents and ' + r.catalog + ' descriptions \u2713');
        } catch (err) { toast('Restore failed: ' + err.message, 'error'); }
      };
      rd.readAsText(f);
    }
  });
}

/* ============================================================
   Description autocomplete (library suggestions)
   ============================================================ */
function wireAutocomplete() {
  const box = document.getElementById('acBox');
  const itemsBody = document.getElementById('itemsBody');

  const hide = () => { acState.open = false; acState.active = -1; box.classList.add('hidden'); };
  const show = (target) => {
    const q = target.value;
    const items = Store.searchCatalog(q);
    const rect = target.getBoundingClientRect();
    if (!items.length) { hide(); return; }
    acState = { open: true, items, active: -1, target };
    box.innerHTML = items.map((c, i) => `
      <div class="ac-item${i === 0 ? ' sel' : ''}" data-i="${i}">
        <span>${esc(c.desc)}</span>${c.unit ? `<span class="ac-unit">${esc(c.unit)}</span>` : ''}
      </div>`).join('');
    box.classList.remove('hidden');
    box.style.left = rect.left + 'px';
    box.style.top = (rect.bottom + 4) + 'px';
    box.style.minWidth = Math.max(260, rect.width) + 'px';
    acState.active = 0;
    markActive();
  };
  const markActive = () => {
    box.querySelectorAll('.ac-item').forEach((el, i) => el.classList.toggle('sel', i === acState.active));
  };
  const pick = (i) => {
    const c = acState.items[i];
    if (!c || !acState.target) { hide(); return; }
    acState.target.value = c.desc;
    const row = acState.target.closest('.item-row');
    const unit = row ? row.querySelector('[data-f=unit]') : null;
    if (unit && c.unit) unit.value = c.unit;
    acState.target.dispatchEvent(new Event('input', { bubbles: true }));
    hide();
    acState.target.focus();
  };

  itemsBody.addEventListener('input', e => {
    if (e.target.classList.contains('it-desc')) show(e.target);
  });
  itemsBody.addEventListener('keydown', e => {
    if (!acState.open || e.target !== acState.target) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); acState.active = (acState.active + 1) % acState.items.length; markActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acState.active = (acState.active - 1 + acState.items.length) % acState.items.length; markActive(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (acState.active >= 0) { e.preventDefault(); pick(acState.active); } else hide(); }
    else if (e.key === 'Escape') hide();
  });
  box.addEventListener('pointerdown', e => {
    e.preventDefault();                       // keep focus in the textarea
    const it = e.target.closest('.ac-item');
    if (it) pick(Number(it.dataset.i));
  });
  document.addEventListener('click', e => {
    if (acState.open && !box.contains(e.target) && e.target !== acState.target) hide();
  });
  document.querySelector('.formpane').addEventListener('scroll', hide, { passive: true });
}

document.addEventListener('DOMContentLoaded', boot);
