/* ============================================================
   INS Quotation App — shared layout engine
   Computes the full page layout (A4 pt) once; the same output
   feeds the on-screen preview AND the PDF export, so the two
   are pixel-identical. All coordinates are page points (1/72").
   ============================================================ */

'use strict';

const PAGE_W = 595, PAGE_H = 841;          // letterhead art is authored at 595x841
const BOX = { x: 46, r: 549, top: 170, bottom: 720 };  // safe area between header/footer art

const C = {
  navy:   '#002D7B',
  royal:  '#0055B5',
  azure:  '#0A84C8',
  ink:    '#1E2A38',
  mut:    '#5A6E84',
  headTx: '#FFFFFF',
  line:   '#D9E3F0',
  line2:  '#B9CADD',
  zebra:  '#F3F8FD',
  wordsC: '#44586E'
};

// Table geometry (sums to 503 = BOX width)
const COLS = [
  { key: 'no',     w: 26,  align: 'center' },
  { key: 'desc',   w: 237, align: 'left'   },
  { key: 'unit',   w: 48,  align: 'center' },
  { key: 'qty',    w: 40,  align: 'center' },
  { key: 'rate',   w: 74,  align: 'right'  },
  { key: 'amount', w: 78,  align: 'right'  }
];

/* ---------- metrics (Helvetica via jsPDF AFM widths; Arial-compatible) ---------- */
let __metricDoc = null;
function metrics() {
  if (!__metricDoc) {
    __metricDoc = new jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: [PAGE_W, PAGE_H] });
  }
  return __metricDoc;
}
function textWidth(str, size, bold, italic) {
  if (!str) return 0;
  if (typeof jspdf === 'undefined') return str.length * size * 0.5; // rough estimate until the lib loads
  const style = bold ? 'bold' : (italic ? 'italic' : 'normal');
  return metrics().getStringUnitWidth(str, { fontName: 'helvetica', fontStyle: style }) * size;
}
function wrapText(str, size, maxW, bold, italic) {
  const out = [];
  String(str || '').split('\n').forEach(par => {
    const words = par.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); return; }
    let line = '';
    for (const w of words) {
      const probe = line ? line + ' ' + w : w;
      if (textWidth(probe, size, bold, italic) <= maxW) { line = probe; continue; }
      if (line) out.push(line);
      // break words longer than the column by characters
      if (textWidth(w, size, bold, italic) > maxW) {
        let chunk = '';
        for (const ch of w) {
          if (textWidth(chunk + ch, size, bold, italic) <= maxW) chunk += ch;
          else { out.push(chunk); chunk = ch; }
        }
        line = chunk;
      } else line = w;
    }
    if (line) out.push(line);
  });
  return out.length ? out : [''];
}

/* ---------- formatting helpers ---------- */
function fmt2(n) {
  n = Number(n) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtQty(n) {
  n = Number(n) || 0;
  return String(Number(n.toFixed(2)));
}
function fmtDateDisplay(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function numToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function under1000(n) {
    let s = '';
    if (n >= 100) { s += ones[Math.floor(n / 100)] + ' Hundred'; n %= 100; if (n) s += ' '; }
    if (n >= 20) { s += tens[Math.floor(n / 10)]; if (n % 10) s += '-' + ones[n % 10]; }
    else if (n > 0) s += ones[n];
    return s;
  }
  function intWords(n) {
    if (n === 0) return 'Zero';
    const parts = [];
    const scales = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
    for (const [v, name] of scales) {
      if (n >= v) { parts.push(intWords(Math.floor(n / v)) + ' ' + name); n %= v; }
    }
    if (n > 0) parts.push(under1000(n));
    return parts.join(' ');
  }
  const neg = num < 0; num = Math.abs(num);
  let whole = Math.floor(num);
  let cents = Math.round((num - whole) * 100);
  if (cents === 100) { whole += 1; cents = 0; }
  let s = intWords(whole);
  if (cents > 0) s += ' and ' + under1000(cents) + (cents === 1 ? ' Cent' : ' Cents');
  return (neg ? 'Minus ' : '') + s;
}
function amountWords(total) {
  return 'Sri Lankan Rupees ' + numToWords(Number(total) || 0) + ' Only';
}

/* ---------- layout ---------- */
const LINE_H = 12.4;        // leading for table description lines
const ROW_PAD = 5.2;

function buildPages(st) {
  const items = st.items.map(it => {
    const qty = Number(it.qty) || 0, rate = Number(it.rate) || 0;
    return { ...it, qty, rate, amount: qty * rate };
  });
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const vat = subtotal * ((Number(st.vatPercent) || 0) / 100);
  const total = subtotal + vat;

  const pages = [];
  const isInv = st.docType === 'invoice';
  const docNo = isInv ? String(st.invNo || '').trim() : String(st.quoteNo || '').trim();
  let prims = null, y = 0;
  const newPage = () => {
    prims = [];
    pages.push(prims);
    if (pages.length > 1) {
      prims.push({ t: 't', x: BOX.x, y: BOX.top + 3, s: (isInv ? 'Invoice ' : 'Quotation ') + docNo + ' (continued)', z: 8.4, b: true, c: C.mut });
      prims.push({ t: 'l', x1: BOX.x, y1: BOX.top + 8, x2: BOX.r, y2: BOX.top + 8, color: C.line, sw: 0.7 });
      y = BOX.top + 24;
    } else {
      y = BOX.top;
    }
  };
  const need = h => { if (y + h > BOX.bottom) newPage(); };
  const T = (x, yy, s, o = {}) => prims.push({ t: 't', x, y: yy, s: String(s), z: o.z || 9.8, b: !!o.b, i: !!o.i, c: o.c || C.ink, a: o.a || 'left', cs: o.cs || 0 });
  const R = (x, yy, w, h, fill, stroke, sw) => prims.push({ t: 'r', x, y: yy, w, h, fill, stroke, sw });
  const L = (x1, y1, x2, y2, color, sw) => prims.push({ t: 'l', x1, y1, x2, y2, color, sw });

  newPage();

  /* ----- title + meta (page 1) ----- */
  T(BOX.x, 191, isInv ? 'INVOICE' : 'QUOTATION', { z: 20, b: true, c: C.navy, cs: 0.5 });
  const metaRows = isInv ? [
    ['Invoice No', docNo],
    ['Quotation Ref', String(st.quoteNo || '').trim()],
    ['Invoice Date', fmtDateDisplay(st.date)]
  ] : [
    ['Quotation No', docNo],
    ['Quotation Date', fmtDateDisplay(st.date)]
  ];
  metaRows.forEach((mrow, idx) => {
    const yy = (isInv ? 165 : 176) + idx * 17;
    T(392, yy, mrow[0], { z: 8.6, b: true, c: C.mut, cs: 0.4 });
    T(BOX.r, yy, mrow[1], { z: 11, b: true, c: C.navy, a: 'right' });
  });
  L(BOX.x, 205, BOX.r, 205, C.line, 1);
  L(BOX.x, 205, BOX.x + 96, 205, C.royal, 2.2);
  y = 224;

  /* ----- bill to / project ----- */
  const custLines = [];
  if (st.customer.attention) custLines.push(st.customer.attention);
  if (st.customer.name) custLines.push(st.customer.name);
  String(st.customer.address || '').split('\n').forEach(l => { if (l.trim()) custLines.push(l.trim()); });
  const contactBits = [];
  if (st.customer.phone) contactBits.push('Tel: ' + st.customer.phone);
  if (st.customer.email) contactBits.push('Email: ' + st.customer.email);
  if (contactBits.length) custLines.push(contactBits.join('   |   '));

  const projWrapW = 208;
  const projLines = st.project ? wrapText(st.project, 10.6, projWrapW, true) : [];
  const custY0 = y, projY0 = y;
  let cy = custY0 + 12;
  T(BOX.x, custY0, 'BILL TO', { z: 8.6, b: true, c: C.mut, cs: 1.2 });
  custLines.forEach((ln, idx) => {
    const bold = idx === 1; // company/customer name emphasized
    T(BOX.x, cy, ln, { z: idx === 1 ? 10.8 : 9.9, b: bold, c: idx === 1 ? C.navy : C.ink });
    cy += 14.6;
  });
  let py = projY0 + 12;
  if (projLines.length) {
    T(334, projY0, 'PROJECT', { z: 8.6, b: true, c: C.mut, cs: 1.2 });
    projLines.forEach(ln => { T(334, py, ln, { z: 10.6, b: true, c: C.ink }); py += 14.6; });
  }
  y = Math.max(cy, projLines.length ? py : projY0 + 12) + 8;

  /* ----- items table ----- */
  const colX = []; let acc = BOX.x;
  COLS.forEach(cdef => { colX.push(acc); acc += cdef.w; });
  const descW = COLS[1].w - 12;

  const emitTableHeader = () => {
    const h = 20;
    R(BOX.x, y, 503, h, C.navy);
    COLS.forEach((cdef, i) => {
      const labels = { no: 'No', desc: 'Description', unit: 'Unit', qty: 'Qty', rate: 'Rate (LKR)', amount: 'Amount (LKR)' };
      const cx = cdef.align === 'left' ? colX[i] + 6 : (cdef.align === 'right' ? colX[i] + cdef.w - 6 : colX[i] + cdef.w / 2);
      T(cx, y + 13.4, labels[cdef.key], { z: 9.4, b: true, c: C.headTx, a: cdef.align === 'left' ? 'left' : cdef.align });
    });
    y += h;
  };
  const tableStarted = { on: false };
  const startTableIfNeeded = firstRowH => {
    if (!tableStarted.on) {
      if (y + 20 + firstRowH > BOX.bottom) newPage();
      emitTableHeader();
      tableStarted.on = true;
    }
  };

  items.forEach((it, idx) => {
    const descLines = wrapText(it.desc || '', 9.7, descW);
    const rowH = ROW_PAD * 2 + Math.max(1, descLines.length) * LINE_H;
    if (tableStarted.on && y + rowH > BOX.bottom) { newPage(); emitTableHeader(); }
    startTableIfNeeded(rowH);
    if (idx % 2 === 1) R(BOX.x, y, 503, rowH, C.zebra);
    // texts
    const firstBase = y + ROW_PAD + 8.2;
    const cx = c => c.align === 'left' ? colX[COLS.indexOf(c)] + 6
      : c.align === 'right' ? colX[COLS.indexOf(c)] + c.w - 6
      : colX[COLS.indexOf(c)] + c.w / 2;
    T(cx(COLS[0]), y + rowH / 2 + 3.3, idx + 1, { z: 9.4, a: 'center', c: C.ink });
    descLines.forEach((ln, li) => T(colX[1] + 6, firstBase + li * LINE_H, ln, { z: 9.7, c: C.ink }));
    T(cx(COLS[2]), y + rowH / 2 + 3.3, it.unit || '', { z: 9.4, a: 'center', c: C.ink });
    T(cx(COLS[3]), y + rowH / 2 + 3.3, fmtQty(it.qty), { z: 9.4, a: 'center', c: C.ink });
    T(cx(COLS[4]), y + rowH / 2 + 3.3, fmt2(it.rate), { z: 9.4, a: 'right', c: C.ink });
    T(cx(COLS[5]), y + rowH / 2 + 3.3, fmt2(it.amount), { z: 9.4, b: true, a: 'right', c: C.ink });
    L(BOX.x, y + rowH, BOX.r, y + rowH, C.line, 0.6);
    y += rowH;
  });

  const totalsH = 8 + (vat > 0 ? 17 : 0) + 22 + 8 + 13 * 2;
  if (tableStarted.on && y + totalsH > BOX.bottom) { newPage(); emitTableHeader(); }

  if (items.length) {
    L(BOX.x, y, BOX.r, y, C.line2, 0.8);
    y += 8;
    if (vat > 0) {
      T(BOX.r - 88 - 10, y + 12, 'VAT (' + (Number(st.vatPercent) || 0) + '%)', { z: 9.4, b: true, c: C.mut, a: 'right' });
      T(BOX.r, y + 12, fmt2(vat), { z: 9.6, b: true, c: C.ink, a: 'right' });
      y += 17;
    }
    // total band
    R(BOX.x, y, 503, 22, C.navy);
    T(BOX.x + 8, y + 15, 'TOTAL', { z: 10.4, b: true, c: C.headTx, cs: 0.6 });
    T(BOX.r - 8, y + 15, fmt2(total), { z: 11.2, b: true, c: C.headTx, a: 'right' });
    y += 22 + 12;
    // amount in words
    const wordsLines = wrapText('Amount in Words: ' + amountWords(total), 8.8, 400, false, true);
    wordsLines.forEach(ln => { T(BOX.x, y, ln, { z: 8.8, i: true, c: C.wordsC }); y += 11.6; });
    y += 8;
  }

  /* ----- terms ----- */
  const terms = (Array.isArray(st.terms) ? st.terms : []).map(t => String(t).trim()).filter(Boolean);
  if (terms.length) {
    need(46);
    T(BOX.x, y + 10, 'TERMS & CONDITIONS', { z: 11, b: true, c: C.navy, cs: 0.4 });
    y += 22;
    terms.forEach(term => {
      const lines = wrapText(term, 9.6, 503 - 18);
      if (y + 6 + lines.length * 13.6 > BOX.bottom) newPage();
      T(BOX.x + 2, y + 10, '\u2022', { z: 9.6, b: true, c: C.royal });
      lines.forEach((ln, li) => { T(BOX.x + 16, y + 10 + li * 13.6, ln, { z: 9.6, c: C.ink }); });
      y += lines.length * 13.6 + 4.6;
    });
    y += 6;
  }

  /* ----- closing + signature (keep together) ----- */
  const closingLines = st.closing ? wrapText(st.closing, 9.7, 503) : [];
  const sigBlockH = closingLines.length * 14 + (closingLines.length ? 12 : 0) + 15 + 44 + 13.5 + 13 + 13 + 6;
  if (y + sigBlockH > BOX.bottom) newPage();
  closingLines.forEach(ln => { T(BOX.x, y, ln, { z: 9.7, c: C.ink }); y += 14; });
  if (closingLines.length) y += 12;
  T(BOX.x, y, 'Thank you,', { z: 10.2, c: C.ink }); y += 15;
  T(BOX.x, y, 'Yours Faithfully,', { z: 10.2, c: C.ink }); y += 44;
  if (st.signature.name) { L(BOX.x, y - 14, BOX.x + 150, y - 14, C.line2, 0.9); T(BOX.x, y, st.signature.name, { z: 10.6, b: true, c: C.navy }); y += 13.5; }
  if (st.signature.designation) T(BOX.x, y, st.signature.designation, { z: 9.4, c: C.mut }), y += 13;
  if (st.signature.mobile) T(BOX.x, y, 'Mobile No: ' + st.signature.mobile, { z: 9.4, c: C.mut }), y += 13;

  /* ----- page numbers (right edge clears the bottom-right corner art at x≈547) ----- */
  const n = pages.length;
  pages.forEach((p, i) => {
    if (n > 1) p.push({ t: 't', x: 535, y: 731, s: 'Page ' + (i + 1) + ' of ' + n, z: 8.2, c: C.mut, a: 'right' });
  });

  return { pages, subtotal, vat, total };
}
