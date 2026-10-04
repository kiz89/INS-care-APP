/* ============================================================
   INS Quotation App — data store
   Catalog (saved descriptions), documents archive (exported
   quotations), settings, and full backup/restore. Everything
   lives in localStorage; Cloud (drive.js) mirrors it to Drive.
   ============================================================ */

'use strict';

const Store = {
  K: {
    draft: 'insq_draft_v1',
    lastNo: 'insq_lastNo_v1',
    catalog: 'insq_catalog_v1',
    docs: 'insq_docs_v1',
    settings: 'insq_settings_v1'
  },

  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  _write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {
      toast('Storage full — could not save locally', 'error');
      return false;
    }
  },

  /* ----- settings ----- */
  loadSettings() {
    return Object.assign({ clientId: '', autoSync: true }, this._read(this.K.settings, {}));
  },
  saveSettings(s) { this._write(this.K.settings, s); this.markChanged(); },

  /* ----- description catalog ----- */
  loadCatalog() { return this._read(this.K.catalog, []); },
  saveCatalog(list) {
    this._write(this.K.catalog, list);
    this.markChanged();
  },
  addToCatalog(desc, unit) {
    const d = String(desc || '').trim();
    if (!d) return false;
    const list = this.loadCatalog();
    const u = String(unit || '').trim();
    const i = list.findIndex(c => c.desc.toLowerCase() === d.toLowerCase());
    if (i >= 0) {
      if (u && list[i].unit !== u) { list[i].unit = u; this.saveCatalog(list); return 'updated'; }
      return false;
    }
    list.unshift({ desc: d, unit: u, savedAt: Date.now() });
    if (list.length > 400) list.length = 400; // cap the library
    this.saveCatalog(list);
    return 'added';
  },
  removeFromCatalog(idx) {
    const list = this.loadCatalog();
    list.splice(idx, 1);
    this.saveCatalog(list);
  },
  searchCatalog(q) {
    q = String(q || '').trim().toLowerCase();
    const list = this.loadCatalog();
    if (!q) return list.slice(0, 8);
    return list.filter(c => c.desc.toLowerCase().includes(q)).slice(0, 8);
  },

  /* ----- documents archive ----- */
  loadDocs() { return this._read(this.K.docs, []); },
  saveDocs(list) { this._write(this.K.docs, list); this.markChanged(); },
  // Called on every export — one record per quotation number (updated on re-export)
  archiveDocument(st, kind) {
    const docs = this.loadDocs();
    const now = Date.now();
    const rec = docs.find(d => String(d.no) === String(st.quoteNo).trim());
    const stateCopy = JSON.parse(JSON.stringify(st));
    const total = stateCopy.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)
      * (1 + ((Number(stateCopy.vatPercent) || 0) / 100));
    const entry = {
      no: String(st.quoteNo || '').trim(),
      date: st.date,
      customer: st.customer.name || '',
      project: st.project || '',
      total,
      savedAt: rec ? rec.savedAt : now,
      exportedAt: now,
      kinds: rec ? Array.from(new Set([...(rec.kinds || []), kind])) : [kind],
      state: stateCopy
    };
    if (rec) Object.assign(rec, entry);
    else docs.unshift(entry);
    docs.sort((a, b) => b.exportedAt - a.exportedAt);
    if (docs.length > 300) docs.length = 300;
    this.saveDocs(docs);
    return entry;
  },
  deleteDocument(no) {
    const docs = this.loadDocs().filter(d => String(d.no) !== String(no));
    this.saveDocs(docs);
  },
  searchDocs(q) {
    q = String(q || '').trim().toLowerCase();
    const docs = this.loadDocs();
    if (!q) return docs;
    return docs.filter(d =>
      String(d.no).toLowerCase().includes(q) ||
      String(d.customer || '').toLowerCase().includes(q) ||
      String(d.project || '').toLowerCase().includes(q) ||
      fmtDateDisplay(d.date).includes(q) ||
      String(d.date || '').includes(q)
    );
  },

  /* ----- whole-app backup / restore ----- */
  buildBackup(currentDraft) {
    return {
      app: 'INS Quotation Builder',
      version: 1,
      savedAt: new Date().toISOString(),
      lastNo: parseInt(localStorage.getItem(this.K.lastNo) || '10', 10),
      draft: currentDraft || this._read(this.K.draft, null),
      catalog: this.loadCatalog(),
      docs: this.loadDocs(),
      settings: this.loadSettings()
    };
  },
  restoreBackup(b) {
    if (!b || b.app !== 'INS Quotation Builder' || !b.version) throw new Error('Not an INS Quotation backup file');
    if (b.lastNo) localStorage.setItem(this.K.lastNo, String(b.lastNo));
    if (b.draft) this._write(this.K.draft, b.draft);
    this._write(this.K.catalog, Array.isArray(b.catalog) ? b.catalog : []);
    this._write(this.K.docs, Array.isArray(b.docs) ? b.docs : []);
    if (b.settings) this._write(this.K.settings, this.loadSettings() && b.settings);
    return {
      docs: (b.docs || []).length,
      catalog: (b.catalog || []).length,
      savedAt: b.savedAt
    };
  },
  downloadBackupFile() {
    const b = this.buildBackup();
    const blob = new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' });
    const d = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `INS-quotation-backup-${d}.json`);
  },

  /* ----- change notification → cloud auto-sync ----- */
  _cloudTimer: null,
  markChanged() {
    if (window.Cloud && Cloud.isEnabled()) Cloud.scheduleSync();
  }
};
