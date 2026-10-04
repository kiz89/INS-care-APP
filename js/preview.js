/* ============================================================
   INS Quotation App — preview renderer
   Draws the layout primitives into absolutely-positioned DOM
   inside scaled A4 sheets (WYSIWYG with the PDF export).
   ============================================================ */

'use strict';

const PT = 96 / 72;                 // pt -> css px
const SHEET_W = PAGE_W * PT;        // 793.3 px
const SHEET_H = PAGE_H * PT;        // 1121.3 px
const ASC = 0.846;                  // baseline offset inside a line-height:1 box (Arial)

function renderPreview(container, pages, zoom) {
  container.innerHTML = '';
  pages.forEach(prims => {
    const wrap = document.createElement('div');
    wrap.className = 'sheetWrap';
    wrap.style.width = (SHEET_W * zoom) + 'px';
    wrap.style.height = (SHEET_H * zoom) + 'px';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.style.width = SHEET_W + 'px';
    sheet.style.height = SHEET_H + 'px';
    sheet.style.transform = 'scale(' + zoom + ')';
    sheet.style.backgroundImage = 'url("' + LETTERHEAD_IMG + '")';

    prims.forEach(p => {
      if (p.t === 't') {
        const d = document.createElement('div');
        d.className = 'pline';
        d.textContent = p.s;
        d.style.fontSize = (p.z * PT) + 'px';
        d.style.fontWeight = p.b ? '700' : '400';
        d.style.fontStyle = p.i ? 'italic' : 'normal';
        d.style.color = p.c;
        d.style.whiteSpace = 'pre';
        if (p.cs) d.style.letterSpacing = (p.cs * PT) + 'px';
        const top = (p.y - ASC * p.z) * PT;
        if (p.a === 'right') {
          d.style.right = ((PAGE_W - p.x) * PT) + 'px';
        } else if (p.a === 'center') {
          d.style.left = (p.x * PT) + 'px';
          d.style.transform = 'translateX(-50%)';
        } else {
          d.style.left = (p.x * PT) + 'px';
        }
        d.style.top = top + 'px';
        sheet.appendChild(d);
      } else if (p.t === 'r') {
        const d = document.createElement('div');
        d.className = 'prect';
        d.style.left = (p.x * PT) + 'px';
        d.style.top = (p.y * PT) + 'px';
        d.style.width = (p.w * PT) + 'px';
        d.style.height = (p.h * PT) + 'px';
        d.style.background = p.fill;
        if (p.stroke) {
          d.style.border = (p.sw * PT) + 'px solid ' + p.stroke;
          d.style.boxSizing = 'border-box';
        }
        sheet.appendChild(d);
      } else if (p.t === 'l') {
        const d = document.createElement('div');
        d.className = 'pline-h';
        const horizontal = Math.abs(p.y2 - p.y1) < 0.01;
        if (horizontal) {
          d.style.left = (Math.min(p.x1, p.x2) * PT) + 'px';
          d.style.top = (p.y1 * PT - (p.sw * PT) / 2) + 'px';
          d.style.width = (Math.abs(p.x2 - p.x1) * PT) + 'px';
          d.style.height = Math.max(1, p.sw * PT) + 'px';
        } else {
          d.style.left = (p.x1 * PT - (p.sw * PT) / 2) + 'px';
          d.style.top = (Math.min(p.y1, p.y2) * PT) + 'px';
          d.style.width = Math.max(1, p.sw * PT) + 'px';
          d.style.height = (Math.abs(p.y2 - p.y1) * PT) + 'px';
        }
        d.style.background = p.color;
        sheet.appendChild(d);
      }
    });
    wrap.appendChild(sheet);
    container.appendChild(wrap);
  });
}

function fitZoom(container) {
  const avail = container.clientWidth - 76;   // margin: page shadow + late vertical scrollbar
  return Math.min(1, Math.max(0.35, avail / SHEET_W));
}
