/* ============================================================
   INS Quotation App — exporters
   • buildPdfBlob(state)  → vector PDF (jsPDF), letterhead on every page
   • buildDocxBlob(state) → fully editable Word file (raw OOXML),
     letterhead embedded as a behind-text page image from the header
   ============================================================ */

'use strict';

/* ---------- shared helpers ---------- */
function hexRGB(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
}
function dataUriToBytes(uri) {
  const b64 = uri.split(',')[1];
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function sanitizeFilename(s) {
  return String(s || '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
}
function buildFilename(st, ext) {
  const isInv = st.docType === 'invoice';
  const parts = [isInv ? 'Invoice' : 'Quotation', String((isInv ? st.invNo : st.quoteNo) || 'Draft').trim()];
  if (st.customer.name) parts.push(st.customer.name);
  const d = fmtDateDisplay(st.date).replace(/\//g, '-');
  if (d) parts.push(d);
  return sanitizeFilename(parts.join(' - ')) + '.' + ext;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ============================================================
   PDF export
   ============================================================ */
function buildPdfBlob(st) {
  const { pages } = buildPages(st);
  const doc = new jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: [PAGE_W, PAGE_H], compress: true });
  const lh = dataUriToBytes(LETTERHEAD_IMG);
  pages.forEach((prims, pi) => {
    if (pi > 0) doc.addPage([PAGE_W, PAGE_H], 'p');
    doc.addImage(lh, 'JPEG', 0, 0, PAGE_W, PAGE_H);
    prims.forEach(p => {
      if (p.t === 't') {
        doc.setFont('helvetica', p.b ? 'bold' : (p.i ? 'italic' : 'normal'));
        doc.setFontSize(p.z);
        const c = hexRGB(p.c);
        doc.setTextColor(c.r, c.g, c.b);
        doc.text(p.s, p.x, p.y, { align: p.a, baseline: 'alphabetic', charSpace: p.cs || 0 });
      } else if (p.t === 'r') {
        const f = hexRGB(p.fill);
        doc.setFillColor(f.r, f.g, f.b);
        if (p.stroke) {
          const s = hexRGB(p.stroke);
          doc.setDrawColor(s.r, s.g, s.b);
          doc.setLineWidth(p.sw || 0.6);
          doc.rect(p.x, p.y, p.w, p.h, 'FD');
        } else {
          doc.rect(p.x, p.y, p.w, p.h, 'F');
        }
      } else if (p.t === 'l') {
        const c = hexRGB(p.color);
        doc.setDrawColor(c.r, c.g, c.b);
        doc.setLineWidth(p.sw || 0.7);
        doc.line(p.x1, p.y1, p.x2, p.y2);
      }
    });
  });
  return doc.output('blob');
}

/* ============================================================
   Minimal ZIP writer (store method) for the DOCX package
   ============================================================ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(entries) { // entries: [{name, data:Uint8Array}]
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const u16 = v => [v & 255, (v >>> 8) & 255];
  const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  entries.forEach(e => {
    const nameB = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0x6000), ...u16(0x2A98),
      ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(nameB.length), ...u16(0),
      ...nameB
    ]);
    chunks.push(local, e.data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0x6000), ...u16(0x2A98),
      ...u32(crc), ...u32(e.data.length), ...u32(e.data.length), ...u16(nameB.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameB
    ]));
    offset += local.length + e.data.length;
  });
  const cdStart = offset;
  let cdSize = 0;
  central.forEach(c => cdSize += c.length);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0)
  ]);
  return new Blob([...chunks, ...central, eocd], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ============================================================
   DOCX (WordprocessingML) generation
   ============================================================ */
function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/[^\x00-\x7F]/g, ch => '&#' + ch.codePointAt(0) + ';');
}
// Word runs — rPr child order must follow the CT_RPr schema sequence:
// b, i, caps, color, spacing, sz, szCs
function wR(text, o = {}) {
  if (text === '' || text == null) return '';
  const rpr =
    (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') +
    (o.caps ? '<w:caps/>' : '') +
    (o.color ? '<w:color w:val="' + o.color + '"/>' : '') +
    (o.spacing ? '<w:spacing w:val="' + o.spacing + '"/>' : '') +
    (o.sz ? '<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>' : '');
  return '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') +
    '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
}
function wBr() { return '<w:r><w:br/></w:r>'; }
// paragraph — pPr child order must follow CT_PPr: pBdr, spacing, ind, jc
function wP(parts, o = {}) {
  const ppr =
    '<w:pPr>' +
    (o.pBdr ? '<w:pBdr><w:bottom w:val="single" w:sz="' + o.pBdr[0] + '" w:space="4" w:color="' + o.pBdr[1] + '"/></w:pBdr>' : '') +
    (o.before || o.after || o.line ? '<w:spacing ' + (o.before ? 'w:before="' + o.before + '" ' : '') + (o.after != null ? 'w:after="' + o.after + '" ' : 'w:after="0" ') + (o.line ? 'w:line="' + o.line + '" w:lineRule="auto"' : '') + '/>' : '') +
    (o.ind || o.indR ? '<w:ind ' + (o.ind ? 'w:left="' + o.ind[0] + '" w:hanging="' + o.ind[1] + '" ' : '') + (o.indR ? 'w:right="' + o.indR + '"' : '') + '/>' : '') +
    (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') +
    '</w:pPr>';
  const runs = (Array.isArray(parts) ? parts : [parts]).join('');
  return '<w:p>' + ppr + (runs || '') + '</w:p>';
}
function wCell(w, content, o = {}) {
  // tcPr child order must follow CT_TcPr: tcW, tcBorders, shd, vAlign
  const tcpr =
    '<w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' +
    (o.borders || '') +
    (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '') +
    '<w:vAlign w:val="' + (o.vAlign || 'center') + '"/></w:tcPr>';
  const ps = (Array.isArray(content) ? content : [content]).join('');
  return '<w:tc>' + tcpr + ps + '</w:tc>';
}
function wTable(gridW, cells, o = {}) {
  const borderXml = o.borders === false ? '<w:tblBorders><w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/><w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/><w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/></w:tblBorders>' :
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="C9D6E6"/><w:left w:val="single" w:sz="4" w:color="C9D6E6"/><w:bottom w:val="single" w:sz="4" w:color="C9D6E6"/><w:right w:val="single" w:sz="4" w:color="C9D6E6"/><w:insideH w:val="single" w:sz="4" w:color="C9D6E6"/><w:insideV w:val="single" w:sz="4" w:color="C9D6E6"/></w:tblBorders>';
  const grid = gridW.map(w => '<w:gridCol w:w="' + w + '"/>').join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="' + gridW.reduce((a, b) => a + b, 0) + '" w:type="dxa"/>' +
    (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + borderXml +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
    '</w:tblPr><w:tblGrid>' + grid + '</w:tblGrid>' + cells.join('') + '</w:tbl>';
}
function wRow(cellsXml, o = {}) {
  // trPr child order must follow CT_TrPr: cantSplit, tblHeader
  return '<w:tr><w:trPr><w:cantSplit/>' + (o.header ? '<w:tblHeader/>' : '') + '</w:trPr>' + cellsXml + '</w:tr>';
}

function buildDocxBlob(st) {
  const { subtotal, vat, total } = buildPages(st);
  const NAVY = '002D7B', MUT = '5A6E84', INK = '1E2A38', ZEB = 'F3F8FD', WORDSC = '44586E';
  const CPW = 503; // content width pt

  /* ---- body assembly ---- */
  const body = [];

  // title + meta
  const isInv = st.docType === 'invoice';
  const docNo = isInv ? String(st.invNo || '').trim() : String(st.quoteNo || '').trim();
  const titleCell = wCell(6200, wP([wR(isInv ? 'INVOICE' : 'QUOTATION', { b: 1, color: NAVY, sz: 40, spacing: '10' })], { after: 0 }));
  const metaParas = isInv ? [
    wP([wR('Invoice No: ', { color: MUT, sz: 20 }), wR(docNo, { b: 1, color: NAVY, sz: 22 })], { jc: 'right', after: 40 }),
    wP([wR('Quotation Ref: ', { color: MUT, sz: 20 }), wR(String(st.quoteNo || '').trim(), { b: 1, color: NAVY, sz: 22 })], { jc: 'right', after: 40 }),
    wP([wR('Invoice Date: ', { color: MUT, sz: 20 }), wR(fmtDateDisplay(st.date), { b: 1, color: NAVY, sz: 22 })], { jc: 'right', after: 0 })
  ] : [
    wP([wR('Quotation No: ', { color: MUT, sz: 20 }), wR(docNo, { b: 1, color: NAVY, sz: 22 })], { jc: 'right', after: 40 }),
    wP([wR('Quotation Date: ', { color: MUT, sz: 20 }), wR(fmtDateDisplay(st.date), { b: 1, color: NAVY, sz: 22 })], { jc: 'right', after: 0 })
  ];
  const metaCell = wCell(3866, metaParas);
  body.push(wTable([6200, 3866], [wRow(titleCell + metaCell)], { borders: false }));
  body.push(wP([wR('')], { pBdr: [12, '0055B5'], after: 220 }));

  // bill to / project
  const custBits = [];
  if (st.customer.attention) custBits.push(st.customer.attention);
  if (st.customer.name) custBits.push(st.customer.name);
  String(st.customer.address || '').split('\n').forEach(l => { if (l.trim()) custBits.push(l.trim()); });
  const contactBits = [];
  if (st.customer.phone) contactBits.push('Tel: ' + st.customer.phone);
  if (st.customer.email) contactBits.push('Email: ' + st.customer.email);
  if (contactBits.length) custBits.push(contactBits.join('   |   '));

  const custParas = [wP([wR('BILL TO', { b: 1, color: MUT, sz: 17, caps: 1, spacing: '24' })], { after: 80 })];
  custBits.forEach((ln, i) => {
    custParas.push(wP([wR(ln, { b: i === 1 ? 1 : 0, color: i === 1 ? NAVY : INK, sz: i === 1 ? 22 : 20 })], { after: 20, line: 264 }));
  });
  const projParas = [wP([wR('PROJECT', { b: 1, color: MUT, sz: 17, caps: 1, spacing: '24' })], { after: 80 })];
  if (st.project) projParas.push(wP([wR(st.project, { b: 1, color: INK, sz: 21 })], { after: 20, line: 264 }));
  body.push(wTable([6200, 3866], [wRow(wCell(6200, custParas) + wCell(3866, projParas, { vAlign: 'top' }))], { borders: false }));
  body.push(wP([wR('')], { after: 60 }));

  // items table
  const colW = [520, 4740, 960, 800, 1480, 1560];
  const headLabels = ['No', 'Description', 'Unit', 'Qty', 'Rate (LKR)', 'Amount (LKR)'];
  const headAlign = ['center', 'left', 'center', 'center', 'right', 'right'];
  const headCells = headLabels.map((lb, i) =>
    wCell(colW[i], wP([wR(lb, { b: 1, color: 'FFFFFF', sz: 19 })], { jc: headAlign[i], after: 0 }), { fill: NAVY })
  ).join('');
  const rowsXml = [wRow(headCells, { header: true })];
  const items = st.items.map(it => ({ ...it, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0, amount: (Number(it.qty) || 0) * (Number(it.rate) || 0) }));
  items.forEach((it, idx) => {
    const descRuns = [wR(it.desc || '', { sz: 19 })];
    const cells =
      wCell(colW[0], wP([wR(String(idx + 1), { sz: 19 })], { jc: 'center', after: 0 })) +
      wCell(colW[1], wP(descRuns, { after: 0, line: 252 }), { vAlign: 'center' }) +
      wCell(colW[2], wP([wR(it.unit || '', { sz: 19 })], { jc: 'center', after: 0 })) +
      wCell(colW[3], wP([wR(fmtQty(it.qty), { sz: 19 })], { jc: 'center', after: 0 })) +
      wCell(colW[4], wP([wR(fmt2(it.rate), { sz: 19 })], { jc: 'right', after: 0 })) +
      wCell(colW[5], wP([wR(fmt2(it.amount), { b: 1, sz: 19 })], { jc: 'right', after: 0 }));
    rowsXml.push(wRow(cells, {}));
  });
  body.push(wTable(colW, rowsXml, {}));

  // totals (right aligned mini-table)
  const totRows = [];
  totRows.push(wRow(
    wCell(2300, wP([wR('Subtotal', { b: 1, color: MUT, sz: 19 })], { jc: 'right', after: 0 }), { borders: '<w:tcBorders><w:top w:val="single" w:sz="6" w:color="B9CADD"/></w:tcBorders>' }) +
    wCell(1500, wP([wR(fmt2(subtotal), { b: 1, color: INK, sz: 19 })], { jc: 'right', after: 0 }), { borders: '<w:tcBorders><w:top w:val="single" w:sz="6" w:color="B9CADD"/></w:tcBorders>' })
  ));
  if (vat > 0) {
    totRows.push(wRow(
      wCell(2300, wP([wR('VAT (' + (Number(st.vatPercent) || 0) + '%)', { b: 1, color: MUT, sz: 19 })], { jc: 'right', after: 0 })) +
      wCell(1500, wP([wR(fmt2(vat), { b: 1, color: INK, sz: 19 })], { jc: 'right', after: 0 }))
    ));
  }
  totRows.push(wRow(
    wCell(2300, wP([wR('TOTAL', { b: 1, color: 'FFFFFF', sz: 21, spacing: '10' })], { jc: 'right', after: 0 }), { fill: NAVY }) +
    wCell(1500, wP([wR(fmt2(total), { b: 1, color: 'FFFFFF', sz: 23 })], { jc: 'right', after: 0 }), { fill: NAVY })
  ));
  body.push(wP([wR('')], { after: 40 }));
  body.push(wTable([2300, 1500], totRows, { borders: false, jc: 'right' }));

  // amount in words
  if (items.length) {
    body.push(wP([wR('Amount in Words: ', { i: 1, color: WORDSC, sz: 18 }), wR(amountWords(total), { i: 1, color: WORDSC, sz: 18 })], { before: 120, after: 160 }));
  }

  // terms
  const terms = (Array.isArray(st.terms) ? st.terms : []).map(t => String(t).trim()).filter(Boolean);
  if (terms.length) {
    body.push(wP([wR('TERMS & CONDITIONS', { b: 1, color: NAVY, sz: 23, spacing: '8' })], { before: 160, after: 100 }));
    terms.forEach(t => {
      body.push(wP([wR('\u2022  ', { b: 1, color: '0055B5', sz: 19 }), wR(t, { sz: 19 })], { ind: [340, 227], after: 60, line: 264 }));
    });
  }

  // closing + signature
  if (st.closing) body.push(wP([wR(st.closing, { sz: 19 })], { before: 160, after: 200, line: 264 }));
  body.push(wP([wR('Thank you,', { sz: 20 })], { after: 40 }));
  body.push(wP([wR('Yours Faithfully,', { sz: 20 })], { after: 0 }));
  body.push(wP([wR('')], { after: 0 }));
  body.push(wP([wR('')], { after: 0 }));
  body.push(wP([wR('')], { after: 0 }));
  if (st.signature.name) body.push(wP([wR('')], { pBdr: [6, 'B9CADD'], after: 60, indR: 7060 }));
  if (st.signature.name) body.push(wP([wR(st.signature.name, { b: 1, color: NAVY, sz: 21 })], { after: 20 }));
  if (st.signature.designation) body.push(wP([wR(st.signature.designation, { color: MUT, sz: 19 })], { after: 20 }));
  if (st.signature.mobile) body.push(wP([wR('Mobile No: ' + st.signature.mobile, { color: MUT, sz: 19 })], { after: 0 }));

  const sectPr =
    '<w:sectPr>' +
    '<w:headerReference w:type="default" r:id="rIdH"/>' +
    '<w:footerReference w:type="default" r:id="rIdF"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="3400" w:right="920" w:bottom="2440" w:left="920" w:header="20" w:footer="300" w:gutter="0"/>' +
    '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>' +
    '</w:sectPr>';

  const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' + NS_W + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:body>' + body.join('') + sectPr + '</w:body></w:document>';

  /* ---- header (letterhead image behind text) ---- */
  const EMU_W = 7556500, EMU_H = 10680700; // 595 x 841 pt
  const headerXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:hdr xmlns:w="' + NS_W + '"' +
    ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr><w:r>' +
    '<w:drawing>' +
    '<wp:anchor behindDoc="1" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" locked="0" layoutInCell="1" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>' +
    '<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
    '<wp:extent cx="' + EMU_W + '" cy="' + EMU_H + '"/>' +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    '<wp:wrapNone/>' +
    '<wp:docPr id="10" name="INS Letterhead"/>' +
    '<wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="10" name="INS Letterhead"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rIdI"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + EMU_W + '" cy="' + EMU_H + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p></w:hdr>';

  /* ---- footer (page x of y) ---- */
  const footerXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="' + NS_W + '">' +
    '<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="right"/></w:pPr>' +
    '<w:r><w:rPr><w:color w:val="6A7C90"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Page </w:t></w:r>' +
    '<w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:color w:val="6A7C90"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>' +
    '<w:r><w:rPr><w:color w:val="6A7C90"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r>' +
    '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:rPr><w:color w:val="6A7C90"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>' +
    '</w:p></w:ftr>';

  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="' + NS_W + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:color w:val="1E2A38"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr/></w:style>' +
    '</w:styles>';

  // Word requires a settings part (referenced from document.xml.rels) — without it,
  // documents that reference header/footer parts are rejected as unreadable.
  const settingsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:settings xmlns:w="' + NS_W + '">' +
    '<w:zoom w:percent="100"/>' +
    '<w:proofState w:spelling="clean" w:grammar="clean"/>' +
    '<w:defaultTabStop w:val="720"/>' +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
    '</w:settings>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const relsRoot =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const relsDoc =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
    '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
    '<Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
    '</Relationships>';

  const relsHeader =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdI" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>' +
    '</Relationships>';

  const coreXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>Quotation ' + xmlEsc(String(st.quoteNo || '')) + '</dc:title>' +
    '<dc:creator>Integrated Network Solution</dc:creator><cp:lastModifiedBy>Integrated Network Solution</cp:lastModifiedBy>' +
    '</cp:coreProperties>';

  const appXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Microsoft Office Word</Application></Properties>';

  const enc = new TextEncoder();
  const imgBytes = dataUriToBytes(LETTERHEAD_IMG);
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(relsRoot) },
    { name: 'docProps/core.xml', data: enc.encode(coreXml) },
    { name: 'docProps/app.xml', data: enc.encode(appXml) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(relsDoc) },
    { name: 'word/header1.xml', data: enc.encode(headerXml) },
    { name: 'word/_rels/header1.xml.rels', data: enc.encode(relsHeader) },
    { name: 'word/footer1.xml', data: enc.encode(footerXml) },
    { name: 'word/styles.xml', data: enc.encode(stylesXml) },
    { name: 'word/settings.xml', data: enc.encode(settingsXml) },
    { name: 'word/media/image1.jpeg', data: imgBytes }
  ]);
}
