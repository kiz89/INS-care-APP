/* ============================================================
   INS Quotation App — Google Drive sync (drive.js)
   Uses Google Identity Services (OAuth token client) + Drive
   REST v3. Data lives in a single JSON file inside a visible
   Drive folder "INS Quotation Builder", so the user can also
   see it in their Drive.

   One-time setup (user): create an OAuth *Web application*
   Client ID in Google Cloud Console and add the app's URL
   (e.g. http://localhost:8770 or the hosted https URL) as an
   Authorized JavaScript origin. file:// origins are NOT
   supported by Google — serve the app over http(s) for sync.
   ============================================================ */

'use strict';

const Drive = {
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  FOLDER_NAME: 'INS Quotation Builder',
  FILE_NAME: 'ins-quotation-data.json',
  DOC: 'https://developers.google.com/identity/gsi/web/guides/get-google-client-id',

  accessToken: null,
  tokenClient: null,
  clientId: '',
  _gisPromise: null,

  /* --- load the GIS script lazily (app stays offline-capable) --- */
  ensureGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (!this._gisPromise) {
      this._gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { this._gisPromise = null; reject(new Error('Could not load Google sign-in (check internet)')); };
        document.head.appendChild(s);
      });
    }
    return this._gisPromise;
  },

  isReady() { return !!(this.clientId && this.tokenClient); },

  /* --- request an access token (silent first, popup if needed) --- */
  connect(interactive) {
    if (!this.clientId) return Promise.reject(new Error('No Client ID set — open Records → Backup & Sync'));
    return this.ensureGis().then(() => new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: this.SCOPE,
          callback: (resp) => {
            if (resp && resp.access_token) { this.accessToken = resp.access_token; resolve(resp); }
            else reject(new Error(resp && resp.error ? resp.error : 'Sign-in failed'));
          },
          error_callback: (err) => reject(new Error(err && err.message ? err.message : 'Sign-in popup closed'))
        });
      }
      this.tokenClient.requestAccessToken({ prompt: interactive ? 'consent ' : '' });
    }));
  },

  disconnect() {
    if (this.accessToken) {
      try { google.accounts.oauth2.revoke(this.accessToken, () => {}); } catch (e) { /* noop */ }
    }
    this.accessToken = null;
  },

  async _authFetch(url, opts = {}, retried) {
    if (!this.accessToken) throw new Error('Not connected to Google Drive');
    opts.headers = Object.assign({ Authorization: 'Bearer ' + this.accessToken }, opts.headers || {});
    const resp = await fetch(url, opts);
    if (resp.status === 401 && !retried) {
      // token expired (~1h) — silent re-auth, then retry once
      await this.connect(false);
      return this._authFetch(url, opts, true);
    }
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('Drive error ' + resp.status + ': ' + body.slice(0, 140));
    }
    return resp;
  },

  /* --- folder + file management --- */
  async findFolder() {
    const q = encodeURIComponent(
      `name = '${this.FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const r = await this._authFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
    const j = await r.json();
    return j.files && j.files[0] ? j.files[0].id : null;
  },
  async createFolder() {
    const r = await this._authFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    return (await r.json()).id;
  },
  async ensureFolder() { return (await this.findFolder()) || (await this.createFolder()); },

  async findFileId(folderId) {
    const q = encodeURIComponent(
      `name = '${this.FILE_NAME}' and '${folderId}' in parents and trashed = false`);
    const r = await this._authFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
    const j = await r.json();
    return j.files && j.files[0] ? j.files[0].id : null;
  },

  /* --- upload the backup JSON (create or overwrite) --- */
  async upload(jsonText) {
    const folderId = await this.ensureFolder();
    const fileId = await this.findFileId(folderId);
    const meta = JSON.stringify({ name: this.FILE_NAME, parents: fileId ? undefined : [folderId] });
    const boundary = 'insqb' + Date.now();
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonText}\r\n--${boundary}--`;
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const r = await this._authFetch(url, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    return r.json();
  },

  /* --- download the remote backup --- */
  async download() {
    const folderId = await this.ensureFolder();
    const fileId = await this.findFileId(folderId);
    if (!fileId) return null;
    const r = await this._authFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return r.json();
  }
};
