# INS Quotation Builder

A small web app for **Integrated Network Solution (INS)** that creates professional
quotations on the company letterhead and exports them as **PDF** and **editable
Microsoft Word (.docx)** files.

Everything runs locally in your browser — no internet, no server, no installation.

---

## How to start

Double-click **`Open Quotation App.bat`** (or open **`index.html`** directly) — it
opens in your default browser (Chrome or Edge recommended). That's it.

## How to use

1. **Quotation Details** — the Quotation No is generated automatically
   (continues from your last quotation, e.g. 0011, 0012, …) and the date defaults
   to today. Both stay editable.
2. **Customer Details** — attention line, company name, address (one line per
   row), telephone and email go into the "BILL TO" block.
3. **Project** — the project name appears next to the customer block.
4. **Items** — enter Description, Unit, Qty and Rate (LKR). The Amount is
   calculated automatically. Add, reorder (↑ ↓) or remove (✕) rows freely.
5. **VAT %** — optional (e.g. 18 for Sri Lanka VAT). Leave blank for no tax row.
6. **Terms & Conditions** — one term per line (pre-filled with the standard terms).
7. **Closing & Signature** — closing note and signatory details
   (defaults kept from the old quotation format).
8. Watch the **live A4 preview** on the right — it is exactly what gets exported.
   Everything you type is **autosaved** in the browser, so you can close the app
   and continue later.
9. Export with the buttons in the top bar:
   - **Download PDF** — print-ready, selectable text, letterhead on every page.
   - **Word** — a real, fully editable .docx with the letterhead behind the text.

"**+ New Quotation**" clears the form for the next customer and automatically
increases the quotation number.

## Records — documents, library & backup

Open **☰ Records** (or **Records** in the mobile bottom bar) for everything saved:

- **Documents** — every time you download a PDF or Word file, the quotation is
  archived automatically. Search by number, date (e.g. `04/10/2026`), customer or
  project, then **open** a past quotation back into the editor (and re-export it).
- **Descriptions** — your item library. On any item row, tick **Save** and press
  **+ Add Item**: the description and its unit are kept. Next time you type a
  matching word in any description box it is suggested — picking one fills the
  description *and* the unit.
- **Backup & Sync** — mirror everything to Google Drive:
  1. Paste your free **Google OAuth Client ID** (steps are written in the panel).
  2. **Connect Google Drive** and sign in.
  3. From then on, all records auto-upload ~4 s after each change into a Drive
     folder **INS Quotation Builder**, and **Restore from Drive** pulls them onto
     any other phone or PC.
  
  Google requires a Client ID tied to the web address the app is opened from, so
  sync needs the app served over http(s) (e.g. free hosting or
  `python -m http.server 8770` with `http://localhost:8770` as the origin) —
  `file://` is not accepted by Google. No Drive? **Download backup file** /
  **Restore from file** works everywhere.

## Tips

- **On a phone or tablet**: open the app in the mobile browser and it switches to
  a touch layout — an **Edit / Preview** switch on top and a **+ New / Word / PDF**
  bar fixed at the bottom (thumb reach). You can keep the app open in the browser
  while at a client site; drafts autosave on the device. "Add to Home Screen" in
  Chrome/Safari makes it behave like an app icon.
- The Word file re-flows naturally — if you edit it in Word afterwards, the
  table header repeats on every page and page numbers update themselves.
- To reset everything (including the quotation counter), clear the site data for
  this page in your browser settings.
- If the PDF/Word buttons do nothing, make sure `js/vendor/jspdf.umd.min.js`,
  `js/letterhead.js` and `assets_build/` are still next to `index.html`.

## Folder contents

| Path | Purpose |
|---|---|
| `index.html` | The app — open this |
| `css/style.css` | UI styling |
| `js/app.js` | Form logic, autosave, numbering |
| `js/layout.js` | Shared A4 layout engine (preview + PDF) |
| `js/export.js` | PDF + Word export generators |
| `js/preview.js` | On-screen page renderer |
| `js/letterhead.js` | Letterhead image (generated from `full hd letterhead.jfif`) |
| `js/vendor/` | jsPDF library (offline copy) |
| `assets_build/` | Rendered letterhead + logo images |
| `samples/` | Example exports, including one rendered by MS Word |

## For developers

Regenerate the letterhead asset from the source image at any time (the app
embeds it as base64 JPEG inside `js/letterhead.js`):

```bash
python -c "
from PIL import Image
import base64, io
im = Image.open('../full hd letterhead.jfif').convert('RGB')
buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90, optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()
open('js/letterhead.js', 'w').write('const LETTERHEAD_IMG = \"data:image/jpeg;base64,' + b64 + '\";\n')
"
```
