/* ============================================================
   INS Quotation App — Project Management (pm.js)
   Income (full / partial invoice amounts) and expenses
   (salary + purchasing), per-project, monthly and weekly
   reports with PDF export on the letterhead.
   ============================================================ */

'use strict';

const PM = {
  d: { projects: [], entries: [], workers: [] },
  ui: {
    tab: 'main',                      // 'main' | 'workers'
    filterProject: 'all', filterFrom: '', filterTo: '', typeFilter: 'all',
    form: null,                       // 'project' | 'income' | 'expense'
    reportScope: 'project', repFrom: '', repTo: '',
    wForm: null,                      // 'worker' (add worker) | 'pay' (pay worker)
    payWorker: '',                    // preselected worker in the pay form
    wr: { workerId: '', scope: 'weekly' }
  },

  /* ---------- data ---------- */
  load() {
    const d = Store.loadPm();
    d.projects = d.projects || [];
    d.entries = d.entries || [];
    d.workers = d.workers || [];
    this.d = d;
  },
  save() { Store.savePm(this.d); },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  today() {
    const t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  },

  filteredEntries() {
    const u = this.ui;
    return this.d.entries.filter(e =>
      (u.filterProject === 'all' ? true :
        u.filterProject === 'general' ? !e.projectId : e.projectId === u.filterProject))
      .filter(e => (!u.filterFrom || e.date >= u.filterFrom) && (!u.filterTo || e.date <= u.filterTo))
      .filter(e => {
        if (u.typeFilter === 'income') return e.type === 'income';
        if (u.typeFilter !== 'all') return e.type === 'expense' && e.category === u.typeFilter;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  },

  totals(entries) {
    let income = 0, salary = 0, purchasing = 0, meals = 0, accommodation = 0, other = 0;
    for (const e of entries) {
      if (e.type === 'income') income += e.amount;
      else if (e.category === 'salary') salary += e.amount;
      else if (e.category === 'purchasing') purchasing += e.amount;
      else if (e.category === 'meals') meals += e.amount;
      else if (e.category === 'accommodation') accommodation += e.amount;
      else other += e.amount;
    }
    const welfare = meals + accommodation + other;
    return { income, salary, purchasing, meals, accommodation, other, welfare, expense: salary + purchasing + welfare, profit: income - (salary + purchasing + welfare) };
  },
  projectStats(pid) {
    return this.totals(this.d.entries.filter(e => pid === null ? !e.projectId : e.projectId === pid));
  },
  projectName(pid) {
    if (!pid) return 'General';
    const p = this.d.projects.find(x => x.id === pid);
    return p ? p.name : '(deleted project)';
  },
  workerName(wid) {
    const w = this.d.workers.find(x => x.id === wid);
    return w ? w.name : '(deleted worker)';
  },
  workerPaid(wid) {
    return this.d.entries.filter(e => e.workerId === wid).reduce((s, e) => s + e.amount, 0);
  },
  PAY_CATS: ['salary', 'meals', 'accommodation', 'other'],
  payCatLabel(c) {
    return { salary: 'Salary', meals: 'Meals', accommodation: 'Accommodation', other: 'Other' }[c] || c;
  },

  /* project names found on generated invoices that are NOT yet added as projects */
  invoiceProjectOptions() {
    const existing = new Set(this.d.projects.map(p => p.name.trim().toLowerCase()));
    const map = new Map();
    for (const iv of Store.loadInvoices()) {
      const name = String(iv.project || '').trim();
      if (!name || existing.has(name.toLowerCase())) continue;
      if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), { name, customer: String(iv.customer || '').trim() });
    }
    return Array.from(map.values());
  },

  /* ---------- report grouping ---------- */
  isoWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;                      // Mon = 0
    const monday = new Date(d); monday.setDate(d.getDate() - day);
    const thursday = new Date(monday); thursday.setDate(monday.getDate() + 3);
    const jan1 = new Date(thursday.getFullYear(), 0, 1);
    const week = Math.ceil((((thursday - jan1) / 86400000) + 1) / 7);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { key: monday.toISOString().slice(0, 10), week, year: thursday.getFullYear(), monday, sunday };
  },
  shortD(d) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); },
  monthLabel(ym) {
    const [y, m] = ym.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  },

  reportRows() {
    const scope = this.ui.reportScope;
    const from = this.ui.repFrom, to = this.ui.repTo;
    const inRange = e => (!from || e.date >= from) && (!to || e.date <= to);
    const entries = this.d.entries.filter(inRange);
    const groups = new Map();
    const put = (key, label, sortKey, entry) => {
      if (!groups.has(key)) groups.set(key, { key, label, sortKey, entries: [] });
      groups.get(key).entries.push(entry);
    };
    if (scope === 'project') {
      for (const e0 of entries) put(e0.projectId || 'general', this.projectName(e0.projectId), e0.projectId || 'zzz', e0);
    } else if (scope === 'monthly') {
      for (const e0 of entries) { const k = e0.date.slice(0, 7); put(k, this.monthLabel(k), k, e0); }
    } else {
      for (const e0 of entries) {
        const w = this.isoWeek(e0.date);
        put(w.key, 'W' + String(w.week).padStart(2, '0') + ' \u00b7 ' + this.shortD(w.monday) + '\u2013' + this.shortD(w.sunday), w.key, e0);
      }
    }
    const rows = Array.from(groups.values())
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)))
      .map(g => {
        const t = this.totals(g.entries);
        return { label: g.label, count: g.entries.length, ...t };
      });
    const grand = this.totals(entries);
    return { rows, grand };
  },

  /* ============================================================
     rendering
     ============================================================ */
  render() {
    const body = document.getElementById('pmBody');
    const acts = document.getElementById('pmActions');
    if (!body) return;
    this.load();
    body.innerHTML = this.html();
    if (acts) acts.innerHTML = this.actionsHtml();
    document.querySelectorAll('.pm-tab').forEach(b => {
      const on = b.dataset.tab === this.ui.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this.drawChart();
  },

  /* contextual header actions (right side of the section title) */
  actionsHtml() {
    if (this.ui.tab === 'workers') {
      const nW = this.d.workers.length;
      const nP = this.d.entries.filter(e => e.workerId).length;
      return `
        <span class="pm-count">${nW} worker${nW === 1 ? '' : 's'} \u00b7 ${nP} payment${nP === 1 ? '' : 's'}</span>
        <button type="button" class="btn pm-add newp" data-pm-act="formWorker"><span aria-hidden="true">\uFF0B</span> Worker</button>
        <button type="button" class="btn pm-add exp" data-pm-act="payForm"><span aria-hidden="true">\uFF0B</span> Pay worker</button>`;
    }
    return `
      <button type="button" class="btn pm-add newp" data-pm-act="formProject"><span aria-hidden="true">\uFF0B</span> Project</button>
      <button type="button" class="btn pm-add inc" data-pm-act="formIncome"><span aria-hidden="true">\uFF0B</span> Income</button>
      <button type="button" class="btn pm-add exp" data-pm-act="formExpense"><span aria-hidden="true">\uFF0B</span> Expense</button>`;
  },

  html() {
    return this.ui.tab === 'workers' ? this.workersHtml() : this.mainHtml();
  },

  mainHtml() {
    const u = this.ui;
    const fEntries = this.filteredEntries();
    const t = this.totals(fEntries);
    const fmt = v => fmt2(v);
    const money = (v, cls) => `<b class="${cls || (v < 0 ? 'neg' : '')}">${fmt(v)}</b>`;

    const projectOptions = sel =>
      `<option value="">General (no project)</option>` +
      this.d.projects.map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${pEsc(p.name)}</option>`).join('');

    /* ---- add forms ---- */
    let formHtml = '';
    if (u.form === 'project') {
      const invOpts = this.invoiceProjectOptions();
      formHtml = `
      <div class="pmform">
        <h3>New project</h3>
        <div class="pmform-grid">
          ${invOpts.length ? `<label class="field"><span>From generated invoices <em class="hint">fills name &amp; customer</em></span>
            <select id="npFromInv">
              <option value="">\u2014 pick an invoice project \u2014</option>
              ${invOpts.map(o => `<option value="${pEsc(o.name)}" data-cust="${pEsc(o.customer)}">${pEsc(o.name)}${o.customer ? ' \u00b7 ' + pEsc(o.customer) : ''}</option>`).join('')}
            </select>
          </label>` : ''}
          <label class="field"><span>Project name</span><input id="npName" type="text" placeholder="e.g. Meteorology NMC Building"></label>
          <label class="field"><span>Customer <em class="hint">optional</em></span><input id="npCust" type="text"></label>
        </div>
        <div class="syncrow">
          <button type="button" class="btn add" style="width:auto;padding:10px 16px" data-pm-act="saveProject">Save project</button>
          <button type="button" class="icon-btn wide" data-pm-act="cancelForm">Cancel</button>
        </div>
      </div>`;
    } else if (u.form === 'income') {
      const invs = Store.loadInvoices();
      const docs = Store.loadDocs();
      const srcOpts = [
        ...invs.map(iv => ({ v: 'INV ' + iv.invNo, amt: iv.total, label: 'Invoice ' + iv.invNo + (iv.quoteNo ? ' \u00b7 Q ' + iv.quoteNo : '') + ' \u00b7 LKR ' + fmt2(iv.total) })),
        ...docs.map(dd => ({ v: dd.no, amt: dd.total, label: 'Quotation ' + dd.no + ' \u00b7 ' + (dd.customer || 'no customer') + ' \u00b7 LKR ' + fmt2(dd.total) }))
      ];
      formHtml = `
      <div class="pmform income">
        <h3>Record income</h3>
        <div class="pmform-grid">
          <label class="field"><span>Date</span><input id="inDate" type="date" value="${u.formDate || this.today()}"></label>
          <label class="field"><span>Project</span><select id="inProject">${projectOptions(u.formProject)}</select></label>
          <label class="field"><span>From saved invoice / quotation <em class="hint">optional — fills ref &amp; full amount</em></span>
            <select id="inFromDoc"><option value="">\u2014 pick a document \u2014</option>
            ${srcOpts.map(o => `<option value="${pEsc(o.v)}" data-amt="${o.amt}">${pEsc(o.label)}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Invoice / Ref no <em class="hint">optional</em></span><input id="inRef" type="text" placeholder="0016 / INV 0001"></label>
          <label class="field"><span>Amount received (LKR) <em class="hint">part or full invoice value</em></span><input id="inAmount" type="number" min="0" step="any" placeholder="0.00"></label>
          <label class="field"><span>Note <em class="hint">optional</em></span><input id="inNote" type="text" placeholder="Advance payment / 2nd installment..."></label>
        </div>
        <div class="syncrow">
          <button type="button" class="btn add" style="width:auto;padding:10px 16px" data-pm-act="saveIncome">Save income</button>
          <button type="button" class="icon-btn wide" data-pm-act="cancelForm">Cancel</button>
        </div>
      </div>`;
    } else if (u.form === 'expense') {
      formHtml = `
      <div class="pmform expense">
        <h3>Record expense</h3>
        <div class="pmform-grid">
          <label class="field"><span>Date</span><input id="exDate" type="date" value="${u.formDate || this.today()}"></label>
          <label class="field"><span>Project</span><select id="exProject">${projectOptions(u.formProject)}</select></label>
          <label class="field"><span>Category</span>
            <select id="exCategory">
              <option value="salary">Salary — staff payments</option>
              <option value="purchasing">Purchasing — materials / supplies</option>
            </select>
          </label>
          <label class="field"><span>Description</span><input id="exDesc" type="text" placeholder="Technician overtime / 6 rolls Cat6 cable..."></label>
          <label class="field"><span>Amount (LKR)</span><input id="exAmount" type="number" min="0" step="any" placeholder="0.00"></label>
        </div>
        <div class="syncrow">
          <button type="button" class="btn add" style="width:auto;padding:10px 16px" data-pm-act="saveExpense">Save expense</button>
          <button type="button" class="icon-btn wide" data-pm-act="cancelForm">Cancel</button>
        </div>
      </div>`;
    }

    /* ---- summary cards ---- */
    const cards = `
      <div class="pm-cards" role="group" aria-label="Summary">
        <div class="kpi kpi-inc"><div class="kpi-top"><span>Income</span><span class="kpi-dot" aria-hidden="true"></span></div><b>LKR ${fmt(t.income)}</b></div>
        <div class="kpi kpi-sal"><div class="kpi-top"><span>Salary</span><span class="kpi-dot" aria-hidden="true"></span></div><b>LKR ${fmt(t.salary)}</b><i>incl. worker salaries</i></div>
        <div class="kpi kpi-pur"><div class="kpi-top"><span>Purchasing</span><span class="kpi-dot" aria-hidden="true"></span></div><b>LKR ${fmt(t.purchasing)}</b></div>
        <div class="kpi kpi-wel"><div class="kpi-top"><span>Worker welfare</span><span class="kpi-dot" aria-hidden="true"></span></div><b>LKR ${fmt(t.welfare)}</b><i>meals + accommodation + other</i></div>
        <div class="kpi kpi-exp"><div class="kpi-top"><span>Total expenses</span><span class="kpi-dot" aria-hidden="true"></span></div><b>LKR ${fmt(t.expense)}</b><i>salary + purchasing + welfare</i></div>
        <div class="kpi kpi-bal ${t.profit < 0 ? 'neg' : ''}"><div class="kpi-top"><span>${t.profit < 0 ? 'Loss' : 'Profit / balance'}</span><span class="kpi-dot" aria-hidden="true"></span></div><b>LKR ${fmt(t.profit)}</b><i>income \u2212 expenses</i></div>
      </div>`;

    /* ---- chart card ---- */
    const chartCard = `
      <div class="card2 chart-card">
        <h3 class="pm-h3" style="margin-top:0">Income vs expenses \u2014 monthly</h3>
        <div class="chart-legend">
          <span><span class="dot" style="background:#0d7a43"></span>Income</span>
          <span><span class="dot" style="background:#d1791f"></span>Salary</span>
          <span><span class="dot" style="background:#a02f22"></span>Purchasing</span>
        </div>
        <canvas id="pmChart" height="210"></canvas>
      </div>`;

    /* ---- filter bar ---- */
    const chips = [
      ['all', 'All'], ['income', 'Income'], ['salary', 'Salary'], ['purchasing', 'Purchasing'],
      ['meals', 'Meals'], ['accommodation', 'Accom.'], ['other', 'Other']
    ];
    const toolbar = `
      <div class="pm-filterbar">
        <div class="pf-row">
          <label class="pf-field pf-grow"><span>Project</span>
            <select id="pmProjectFilter" aria-label="Filter by project">
              <option value="all">All projects</option>
              <option value="general" ${u.filterProject === 'general' ? 'selected' : ''}>General (no project)</option>
              ${this.d.projects.map(p => `<option value="${p.id}" ${u.filterProject === p.id ? 'selected' : ''}>${pEsc(p.name)}</option>`).join('')}
            </select>
          </label>
          <label class="pf-field"><span>From</span><input id="pmFrom" type="date" value="${u.filterFrom}" aria-label="From date"></label>
          <label class="pf-field"><span>To</span><input id="pmTo" type="date" value="${u.filterTo}" aria-label="To date"></label>
          <button type="button" class="pf-clear" data-pm-act="clearFilters" title="Clear project and date filters">Reset</button>
        </div>
        <div class="pf-row" role="group" aria-label="Filter by category">
          ${chips.map(([tf, lbl]) => `<button type="button" class="pf-chip ${u.typeFilter === tf ? 'active' : ''}" data-pm-act="typeFilter" data-tf="${tf}" aria-pressed="${u.typeFilter === tf ? 'true' : 'false'}">${lbl}</button>`).join('')}
        </div>
      </div>`;

    /* ---- projects list ---- */
    const projectsHtml = this.d.projects.length ? `
      <details class="pm-projects" ${this.d.projects.length && u.form === null && !this.d.entries.length ? 'open' : ''}>
        <summary>Projects (${this.d.projects.length})</summary>
        <div class="pm-ptable">
          <div class="pm-prow head"><div class="pm-pname">Project</div><div class="pm-pnum">Income</div><div class="pm-pnum">Salary</div><div class="pm-pnum">Purchasing</div><div class="pm-pnum">Welfare</div><div class="pm-pnum">Balance</div><span></span></div>
          ${this.d.projects.map(p => {
            const s = this.projectStats(p.id);
            return `<div class="pm-prow">
              <div class="pm-pname"><b>${pEsc(p.name)}</b><span class="doc-sub">${pEsc(p.customer || '')}</span></div>
              <div class="pm-pnum">${money(s.income)}</div>
              <div class="pm-pnum">${money(s.salary)}</div>
              <div class="pm-pnum">${money(s.purchasing)}</div>
              <div class="pm-pnum">${money(s.welfare)}</div>
              <div class="pm-pnum">${money(s.profit, s.profit < 0 ? 'neg' : '')}</div>
              <button type="button" class="icon-btn danger" data-pm-act="delProject" data-id="${p.id}" title="Delete project (its records move to General)" aria-label="Delete project ${pEsc(p.name)}">&#10005;</button>
            </div>`;
          }).join('')}
          <div class="pm-prow general"><div class="pm-pname"><b>General (no project)</b></div>
            ${(() => { const s = this.projectStats(null); return `<div class="pm-pnum">${money(s.income)}</div><div class="pm-pnum">${money(s.salary)}</div><div class="pm-pnum">${money(s.purchasing)}</div><div class="pm-pnum">${money(s.welfare)}</div><div class="pm-pnum">${money(s.profit, s.profit < 0 ? 'neg' : '')}</div><span></span>`; })()}
          </div>
        </div>
      </details>` : '';

    /* ---- entries ---- */
    const entriesHtml = !fEntries.length
      ? `<div class="empty">No records${u.filterFrom || u.filterTo || u.filterProject !== 'all' ? ' match the current filters' : ' yet'} — add income and expenses with the buttons above.</div>`
      : `<div class="pm-etable">
          <div class="pm-erow head"><span>Date</span><span>Project</span><span>Type</span><span>Description / note</span><span class="ta-r">Amount (LKR)</span><span></span></div>
          ${fEntries.map(e => {
            const isInc = e.type === 'income';
            const catCls = !isInc ? (e.category === 'salary' ? 'salary' : e.category === 'purchasing' ? 'purchasing' : e.category) : 'inc';
            const catLbl = isInc ? 'Income' + (e.ref ? ' \u00b7 ' + pEsc(e.ref) : '')
              : (e.category === 'purchasing' ? 'Purchasing' : this.payCatLabel(e.category));
            const desc = isInc ? (e.note || '\u2014')
              : (e.workerId ? '\u{1F464}\uFE0F ' + pEsc(this.workerName(e.workerId)) + (e.note ? ' \u00b7 ' + pEsc(e.note) : '') : (e.desc || '\u2014'));
            return `
          <div class="pm-erow ${e.type}">
            <span class="e-date">${fmtDateDisplay(e.date)}</span>
            <span class="e-proj">${pEsc(this.projectName(e.projectId))}</span>
            <span class="e-type ${catCls}">${catLbl}</span>
            <span class="e-desc">${desc}</span>
            <span class="e-amt ${isInc ? 'inc' : ''}">${isInc ? '+' : '\u2212'}${fmt(e.amount)}</span>
            <button type="button" class="icon-btn danger" data-pm-act="delEntry" data-id="${e.id}" title="Delete record">&#10005;</button>
          </div>`;
          }).join('')}
        </div>`;

    /* ---- reports ---- */
    const rep = this.reportRows();
    const scopeLabel = { project: 'Project-wise', monthly: 'Monthly', weekly: 'Weekly' }[u.reportScope];
    const rangeText = (u.repFrom || u.repTo)
      ? (u.repFrom ? fmtDateDisplay(u.repFrom) : '\u2026') + ' \u2192 ' + (u.repTo ? fmtDateDisplay(u.repTo) : '\u2026')
      : 'all time';
    const reportHtml = `
      <div class="pm-report card2">
        <div class="pm-cardhead">
          <h3 class="pm-h3" style="margin:0">Reports</h3>
          <button type="button" class="btn pm-add newp" data-pm-act="reportPdf" ${rep.rows.length ? '' : 'disabled'}><span aria-hidden="true">\u2b07</span> PDF</button>
        </div>
        <div class="pm-toolbar">
          <div class="seg" role="group" aria-label="Report scope">
            <button type="button" class="seg-btn ${u.reportScope === 'project' ? 'active' : ''}" data-pm-act="repScope" data-scope="project">Project-wise</button>
            <button type="button" class="seg-btn ${u.reportScope === 'monthly' ? 'active' : ''}" data-pm-act="repScope" data-scope="monthly">Monthly</button>
            <button type="button" class="seg-btn ${u.reportScope === 'weekly' ? 'active' : ''}" data-pm-act="repScope" data-scope="weekly">Weekly</button>
          </div>
          <label class="pf-field"><span>From</span><input id="pmRepFrom" type="date" value="${u.repFrom}" aria-label="Report range start"></label>
          <label class="pf-field"><span>To</span><input id="pmRepTo" type="date" value="${u.repTo}" aria-label="Report range end"></label>
        </div>
        ${u.reportScope !== 'project' ? `<p class="hintline" style="margin:0 0 10px">Select the date range for the ${scopeLabel.toLowerCase()} report (currently ${rangeText}).</p>` : `<p class="hintline" style="margin:0 0 10px">All-time totals per project${u.repFrom || u.repTo ? ' within the selected range' : ''}.</p>`}
        ${!rep.rows.length ? `<div class="empty">No records in this range.</div>` : `
        <div class="pm-rtable">
          <div class="pm-rrow head"><span>${u.reportScope === 'project' ? 'Project' : u.reportScope === 'monthly' ? 'Month' : 'Week'}</span><span class="ta-r">Income</span><span class="ta-r">Salary</span><span class="ta-r">Purchasing</span><span class="ta-r">Welfare</span><span class="ta-r">Expenses</span><span class="ta-r">Profit</span></div>
          ${rep.rows.map(r => `<div class="pm-rrow">
            <span class="r-lbl">${pEsc(r.label)}<i>${r.count} record${r.count > 1 ? 's' : ''}</i></span>
            <span class="ta-r">${fmt(r.income)}</span>
            <span class="ta-r">${fmt(r.salary)}</span>
            <span class="ta-r">${fmt(r.purchasing)}</span>
            <span class="ta-r">${fmt(r.welfare)}</span>
            <span class="ta-r">${fmt(r.expense)}</span>
            <span class="ta-r"><b class="${r.profit < 0 ? 'neg' : 'pos'}">${fmt(r.profit)}</b></span>
          </div>`).join('')}
          <div class="pm-rrow total"><span>TOTAL</span><span class="ta-r">${fmt(rep.grand.income)}</span><span class="ta-r">${fmt(rep.grand.salary)}</span><span class="ta-r">${fmt(rep.grand.purchasing)}</span><span class="ta-r">${fmt(rep.grand.welfare)}</span><span class="ta-r">${fmt(rep.grand.expense)}</span><span class="ta-r"><b class="${rep.grand.profit < 0 ? 'neg' : 'pos'}">${fmt(rep.grand.profit)}</b></span></div>
        </div>`}
      </div>`;

    return formHtml + cards + chartCard + toolbar + projectsHtml + `<h3 class="pm-h3">Records</h3>` + entriesHtml + reportHtml;
  },

  /* ---------- monthly bar chart (income vs salary vs purchasing) ---------- */
  chartTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    return dark
      ? { grid: '#243354', axis: '#7d90ad', label: '#9fb2d0' }
      : { grid: '#e8eef6', axis: '#93a5ba', label: '#5a6e84' };
  },
  drawChart() {
    const cv = document.getElementById('pmChart');
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(280, cv.parentElement.clientWidth - 36);
    const cssH = 210;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    const th = this.chartTheme();

    const entries = this.d.entries;
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    let start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const firstDate = entries.map(e => e.date).sort()[0];
    if (firstDate) {
      const first = new Date(Number(firstDate.slice(0, 4)), Number(firstDate.slice(5, 7)) - 1, 1);
      if (first > start) start = first;
    }
    const keys = [];
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const agg = {};
    keys.forEach(k => agg[k] = { income: 0, salary: 0, purchasing: 0 });
    entries.forEach(e => {
      const k = e.date.slice(0, 7);
      if (!agg[k]) return;
      if (e.type === 'income') agg[k].income += e.amount;
      else if (e.category === 'salary') agg[k].salary += e.amount;
      else agg[k].purchasing += e.amount;
    });
    const maxV = Math.max(1, ...keys.map(k => Math.max(agg[k].income, agg[k].salary + agg[k].purchasing)));
    const padL = 56, padR = 8, padT = 14, padB = 24;
    const plotW = cssW - padL - padR, plotH = cssH - padT - padB;
    const fmtK = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));

    g.font = '9.5px "Segoe UI", sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const yy = padT + plotH - (plotH * i / 4);
      g.strokeStyle = th.grid;
      g.beginPath(); g.moveTo(padL, yy); g.lineTo(cssW - padR, yy); g.stroke();
      g.fillStyle = th.axis;
      g.fillText(fmtK(maxV * i / 4), padL - 6, yy);
    }
    const groupW = plotW / Math.max(1, keys.length);
    const barW = Math.max(4, Math.min(26, (groupW - 16) / 3));
    keys.forEach((k, i) => {
      const gx = padL + groupW * i + groupW / 2;
      const a = agg[k];
      const sets = [[a.income, '#0d7a43'], [a.salary, '#d1791f'], [a.purchasing, '#a02f22']];
      sets.forEach((s, si) => {
        const x = gx - (barW * 3 + 8) / 2 + si * (barW + 4);
        const hh = Math.max(s[0] > 0 ? 2 : 0, (s[0] / maxV) * plotH);
        g.fillStyle = s[1];
        g.fillRect(x, padT + plotH - hh, barW, hh);
        if (s[0] > 0) {
          g.fillStyle = th.label;
          g.font = '8.5px "Segoe UI", sans-serif';
          g.textAlign = 'center';
          g.fillText(fmtK(s[0]), x + barW / 2, padT + plotH - hh - 8);
        }
      });
      const [y4, m2] = k.split('-');
      g.fillStyle = th.label;
      g.font = '10px "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.fillText(new Date(Number(y4), Number(m2) - 1, 1).toLocaleDateString('en-GB', { month: 'short' }), gx, cssH - 10);
    });
  },

  /* ============================================================
     Workers & Payments tab
     ============================================================ */
  workersHtml() {
    const u = this.ui;
    const fmt = v => fmt2(v);

    /* add-worker form */
    let wForm = '';
    if (u.wForm === 'worker') {
      wForm = `
      <div class="pmform">
        <h3>Add worker</h3>
        <div class="pmform-grid">
          <label class="field"><span>Worker name</span><input id="wkName" type="text" placeholder="e.g. Sunil Perera"></label>
          <label class="field"><span>Role / trade <em class="hint">optional</em></span><input id="wkRole" type="text" placeholder="Technician / Helper..."></label>
          <label class="field"><span>Phone <em class="hint">optional</em></span><input id="wkPhone" type="text"></label>
        </div>
        <div class="syncrow">
          <button type="button" class="btn add" style="width:auto;padding:10px 16px" data-pm-act="saveWorker">Save worker</button>
          <button type="button" class="icon-btn wide" data-pm-act="cancelWForm">Cancel</button>
        </div>
        <p class="hintline" style="margin:8px 0 0">After adding, allocate the worker to projects with the chips on their card — one worker can work on several projects at once.</p>
      </div>`;
    }

    /* pay form */
    let payForm = '';
    if (u.wForm === 'pay') {
      const wopts = this.d.workers.map(w => `<option value="${w.id}" ${u.payWorker === w.id ? 'selected' : ''}>${pEsc(w.name)}</option>`).join('');
      const wk = this.d.workers.find(w => w.id === u.payWorker);
      const defProj = wk && wk.allocations && wk.allocations[0] ? wk.allocations[0] : '';
      const popts = `<option value="">General (no project)</option>` +
        this.d.projects.map(p => `<option value="${p.id}" ${defProj === p.id ? 'selected' : ''}>${pEsc(p.name)}</option>`).join('');
      payForm = `
      <div class="pmform expense">
        <h3>Pay worker</h3>
        <div class="pmform-grid">
          <label class="field"><span>Date</span><input id="wpDate" type="date" value="${this.today()}"></label>
          <label class="field"><span>Worker</span><select id="wpWorker">${wopts}</select></label>
          <label class="field"><span>Project <em class="hint">counts into that project's expenses</em></span><select id="wpProject">${popts}</select></label>
          <label class="field"><span>Payment type</span>
            <select id="wpCategory">
              <option value="salary">Salary</option>
              <option value="meals">Meals</option>
              <option value="accommodation">Accommodation</option>
              <option value="other">Other payment</option>
            </select>
          </label>
          <label class="field"><span>Amount (LKR)</span><input id="wpAmount" type="number" min="0" step="any" placeholder="0.00"></label>
          <label class="field"><span>Note <em class="hint">optional</em></span><input id="wpNote" type="text" placeholder="Week 42 advance / site meals..."></label>
        </div>
        <div class="syncrow">
          <button type="button" class="btn add" style="width:auto;padding:10px 16px" data-pm-act="savePayment">Save payment</button>
          <button type="button" class="icon-btn wide" data-pm-act="cancelWForm">Cancel</button>
        </div>
      </div>`;
    }

    /* worker cards */
    const wkCards = !this.d.workers.length
      ? `<div class="empty">No workers yet — press "+ Worker" to add your team, allocate them to projects, then record salary, meals, accommodation and other payments (they count into project expenses automatically).</div>`
      : this.d.workers.map(w => {
        const paid = this.workerPaid(w.id);
        const initials = w.name.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
        const nAlloc = (w.allocations || []).length;
        return `
        <div class="wk-card">
          <div class="wk-head">
            <div class="wk-id">
              <span class="wk-avatar" aria-hidden="true">${pEsc(initials)}</span>
              <div>
                <b>${pEsc(w.name)}</b>
                <span class="doc-sub">${pEsc(w.role || 'Worker')}${w.phone ? ' \u00b7 ' + pEsc(w.phone) : ''}</span>
              </div>
            </div>
            <div class="wk-right">
              <span class="wk-paid">Paid <b>LKR ${fmt(paid)}</b></span>
              <div class="wk-acts">
                <button type="button" class="pm-minibtn expe" data-pm-act="payForm" data-wid="${w.id}">Pay</button>
                <button type="button" class="pm-minibtn newp" data-pm-act="wrOpen" data-wid="${w.id}">Report</button>
                <button type="button" class="icon-btn danger" data-pm-act="delWorker" data-wid="${w.id}" title="Delete worker (payment records are kept)" aria-label="Delete worker ${pEsc(w.name)}">&#10005;</button>
              </div>
            </div>
          </div>
          <div class="wk-alloc">
            <span class="wk-albl">Projects (${nAlloc})</span>
            ${this.d.projects.length
              ? this.d.projects.map(p => `<button type="button" class="aloc-chip ${(w.allocations || []).includes(p.id) ? 'on' : ''}" data-pm-act="allocToggle" data-wid="${w.id}" data-pid="${p.id}" aria-pressed="${(w.allocations || []).includes(p.id) ? 'true' : 'false'}" title="Allocate / unallocate to this project">${pEsc(p.name)}</button>`).join('')
              : '<span class="doc-sub">create a project first</span>'}
          </div>
        </div>`;
      }).join('');

    /* payments log */
    const pays = this.d.entries.filter(e => e.workerId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
    const payLog = !pays.length ? '' : `
      <h3 class="pm-h3">Worker payments</h3>
      <div class="pm-etable">
        <div class="pm-erow head"><span>Date</span><span>Worker</span><span>Project</span><span>Type</span><span class="ta-r">Amount (LKR)</span><span></span></div>
        ${pays.map(e => `
        <div class="pm-erow">
          <span class="e-date">${fmtDateDisplay(e.date)}</span>
          <span class="e-proj">${pEsc(this.workerName(e.workerId))}</span>
          <span class="e-proj">${pEsc(this.projectName(e.projectId))}</span>
          <span class="e-type ${e.category}">${this.payCatLabel(e.category)}${e.note ? '<i class="ty-n">' + pEsc(e.note) + '</i>' : ''}</span>
          <span class="e-amt">\u2212${fmt(e.amount)}</span>
          <button type="button" class="icon-btn danger" data-pm-act="delEntry" data-id="${e.id}" title="Delete payment">&#10005;</button>
        </div>`).join('')}
      </div>`;

    /* per-worker report */
    const wr = u.wr;
    const wrOpts = this.d.workers.map(w => `<option value="${w.id}" ${wr.workerId === w.id ? 'selected' : ''}>${pEsc(w.name)}</option>`).join('');
    let wrTable = '';
    if (wr.workerId) {
      const rep = this.workerReport(wr.workerId, wr.scope);
      const scopeName = { weekly: 'Week', monthly: 'Month', project: 'Project' }[wr.scope];
      wrTable = !rep.rows.length
        ? `<div class="empty">No payments recorded for ${pEsc(this.workerName(wr.workerId))} yet.</div>`
        : `
        <div class="wr-rtable">
          <div class="wr-rrow head"><span>${scopeName}</span><span class="ta-r">Salary</span><span class="ta-r">Meals</span><span class="ta-r">Accom.</span><span class="ta-r">Other</span><span class="ta-r">Total paid</span></div>
          ${rep.rows.map(r => `
          <div class="wr-rrow">
            <span class="r-lbl">${pEsc(r.label)}<i>${r.count} payment${r.count > 1 ? 's' : ''}</i></span>
            <span class="ta-r">${fmt(r.salary)}</span>
            <span class="ta-r">${fmt(r.meals)}</span>
            <span class="ta-r">${fmt(r.accommodation)}</span>
            <span class="ta-r">${fmt(r.other)}</span>
            <span class="ta-r"><b>${fmt(r.total)}</b></span>
          </div>`).join('')}
          <div class="wr-rrow total"><span>TOTAL</span><span class="ta-r">${fmt(rep.grand.salary)}</span><span class="ta-r">${fmt(rep.grand.meals)}</span><span class="ta-r">${fmt(rep.grand.accommodation)}</span><span class="ta-r">${fmt(rep.grand.other)}</span><span class="ta-r"><b>${fmt(rep.grand.total)}</b></span></div>
        </div>`;
    }

    return `
      ${wForm}${payForm}
      <div class="wk-list">${wkCards}</div>
      ${payLog}
      <div class="pm-report card2">
        <div class="pm-cardhead">
          <h3 class="pm-h3" style="margin:0">Worker payment report</h3>
          <button type="button" class="btn pm-add newp" data-pm-act="workerPdf" ${wr.workerId ? '' : 'disabled'}><span aria-hidden="true">\u2b07</span> PDF</button>
        </div>
        <div class="pm-toolbar">
          <label class="pf-field pf-grow"><span>Worker</span>
            <select id="wrWorker" aria-label="Select worker">${wrOpts || '<option value="">add a worker first</option>'}</select>
          </label>
          <div class="seg" role="group" aria-label="Worker report scope">
            <button type="button" class="seg-btn ${wr.scope === 'weekly' ? 'active' : ''}" data-pm-act="wrScope" data-scope="weekly">Weekly</button>
            <button type="button" class="seg-btn ${wr.scope === 'monthly' ? 'active' : ''}" data-pm-act="wrScope" data-scope="monthly">Monthly</button>
            <button type="button" class="seg-btn ${wr.scope === 'project' ? 'active' : ''}" data-pm-act="wrScope" data-scope="project">Project-wise</button>
          </div>
        </div>
        ${wr.workerId ? wrTable : '<div class="empty">Select a worker to see how he got paid \u2014 weekly, monthly or project-wise.</div>'}
      </div>`;
  },

  /* per-worker aggregation: how a specific worker got paid */
  workerReport(workerId, scope) {
    const entries = this.d.entries.filter(e => e.workerId === workerId);
    const groups = new Map();
    const put = (key, label, sortKey, entry) => {
      if (!groups.has(key)) groups.set(key, { label, sortKey, count: 0, salary: 0, meals: 0, accommodation: 0, other: 0, total: 0 });
      const g = groups.get(key);
      g.count++;
      g[entry.category === 'purchasing' ? 'other' : entry.category] += entry.amount;
      g.total += entry.amount;
    };
    for (const e of entries) {
      if (scope === 'project') put(e.projectId || 'general', this.projectName(e.projectId), e.projectId || 'zzz', e);
      else if (scope === 'monthly') { const k = e.date.slice(0, 7); put(k, this.monthLabel(k), k, e); }
      else { const w = this.isoWeek(e.date); put(w.key, 'W' + String(w.week).padStart(2, '0') + ' \u00b7 ' + this.shortD(w.monday) + '\u2013' + this.shortD(w.sunday), w.key, e); }
    }
    const grand = { salary: 0, meals: 0, accommodation: 0, other: 0, total: 0 };
    const rows = Array.from(groups.values())
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)))
      .map(g => {
        for (const k of ['salary', 'meals', 'accommodation', 'other', 'total']) grand[k] += g[k];
        return g;
      });
    return { rows, grand };
  },

  /* worker payment report on the letterhead */
  workerReportPdf() {
    const wr = this.ui.wr;
    if (!wr.workerId) { toast('Select a worker first'); return; }
    const name = this.workerName(wr.workerId);
    const rep = this.workerReport(wr.workerId, wr.scope);
    if (!rep.rows.length) { toast('No payments to export'); return; }
    const scopeLabel = { weekly: 'Weekly', monthly: 'Monthly', project: 'Project-wise' }[wr.scope];
    const cols = [
      { label: wr.scope === 'project' ? 'Project' : wr.scope === 'monthly' ? 'Month' : 'Week', w: 143, a: 'left' },
      { label: 'Salary', w: 72, a: 'right' },
      { label: 'Meals', w: 72, a: 'right' },
      { label: 'Accom.', w: 72, a: 'right' },
      { label: 'Other', w: 64, a: 'right' },
      { label: 'Total', w: 80, a: 'right' }
    ];
    const rows = rep.rows.map(r => [r.label, fmt2(r.salary), fmt2(r.meals), fmt2(r.accommodation), fmt2(r.other), fmt2(r.total)]);
    const total = ['TOTAL', fmt2(rep.grand.salary), fmt2(rep.grand.meals), fmt2(rep.grand.accommodation), fmt2(rep.grand.other), fmt2(rep.grand.total)];

    const doc = new jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: [PAGE_W, PAGE_H], compress: true });
    const lh = dataUriToBytes(LETTERHEAD_IMG);
    let y = 0, page = 0;
    const colX = []; let acc2 = BOX.x;
    cols.forEach(c => { colX.push(acc2); acc2 += c.w; });
    const cellX = (c, i) => c.a === 'left' ? colX[i] + 6 : colX[i] + c.w - 6;
    const drawPage = () => {
      doc.addImage(lh, 'JPEG', 0, 0, PAGE_W, PAGE_H);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(0, 45, 123);
      doc.text('WORKER PAYMENT REPORT', BOX.x, 191, { charSpace: 0.4 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 110, 132);
      doc.text('Worker: ' + name + '  \u00b7  ' + scopeLabel + '  \u00b7  All time', BOX.x, 208);
      doc.text('Generated: ' + fmtDateDisplay(this.today()), BOX.r, 208, { align: 'right' });
      doc.setDrawColor(217, 227, 240); doc.setLineWidth(1); doc.line(BOX.x, 216, BOX.r, 216);
    };
    const drawHeader = () => {
      doc.setFillColor(0, 45, 123); doc.rect(BOX.x, y, 503, 20, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(255, 255, 255);
      cols.forEach((c, i) => doc.text(c.label, cellX(c, i), y + 13.4, { align: c.a === 'left' ? 'left' : c.a }));
      y += 20;
    };
    const newRow = () => {
      page++;
      if (page > 1) doc.addPage([PAGE_W, PAGE_H], 'p');
      drawPage();
      y = page === 1 ? 240 : BOX.top;
      drawHeader();
    };
    newRow();
    rows.forEach((r, ri) => {
      const rowH = 22;
      if (y + rowH > BOX.bottom) newRow();
      if (ri % 2 === 1) { doc.setFillColor(243, 248, 253); doc.rect(BOX.x, y, 503, rowH, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 42, 56);
      r.forEach((cell, ci) => {
        const c = cols[ci];
        if (ci === 0 && cell.length > 36) cell = cell.slice(0, 35) + '\u2026';
        doc.text(cell, cellX(c, ci), y + 14.4, { align: c.a === 'left' ? 'left' : c.a });
      });
      doc.setDrawColor(217, 227, 240); doc.setLineWidth(0.6); doc.line(BOX.x, y + rowH, BOX.r, y + rowH);
      y += rowH;
    });
    if (y + 26 > BOX.bottom) newRow();
    doc.setFillColor(0, 45, 123); doc.rect(BOX.x, y, 503, 24, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.4); doc.setTextColor(255, 255, 255);
    total.forEach((cell, ci) => doc.text(cell, cellX(cols[ci], ci), y + 15.6, { align: cols[ci].a === 'left' ? 'left' : cols[ci].a }));
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      if (n > 1) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(122, 139, 158);
        doc.text('Page ' + i + ' of ' + n, 535, 731, { align: 'right' });
      }
    }
    downloadBlob(doc.output('blob'), sanitizeFilename('Worker Report - ' + name + ' - ' + scopeLabel + '.pdf'));
    toast('Worker report PDF downloaded \u2713');
  },

  /* ============================================================
     report PDF (letterhead)
     ============================================================ */
  reportPdf() {
    const u = this.ui;
    const rep = this.reportRows();
    if (!rep.rows.length) { toast('Nothing to export in this range'); return; }
    const scopeLabel = { project: 'Project-wise Report', monthly: 'Monthly Report', weekly: 'Weekly Report' }[u.reportScope];
    const range = (u.repFrom || u.repTo)
      ? (u.repFrom ? fmtDateDisplay(u.repFrom) : '\u2026') + ' to ' + (u.repTo ? fmtDateDisplay(u.repTo) : '\u2026')
      : 'All time';
    const cols = [
      { label: u.reportScope === 'project' ? 'Project' : u.reportScope === 'monthly' ? 'Month' : 'Week', w: 125, a: 'left' },
      { label: 'Income', w: 63, a: 'right' },
      { label: 'Salary', w: 60, a: 'right' },
      { label: 'Purchasing', w: 66, a: 'right' },
      { label: 'Welfare', w: 70, a: 'right' },
      { label: 'Expenses', w: 63, a: 'right' },
      { label: 'Profit', w: 56, a: 'right' }
    ];
    const rows = rep.rows.map(r => [r.label, fmt2(r.income), fmt2(r.salary), fmt2(r.purchasing), fmt2(r.welfare), fmt2(r.expense), fmt2(r.profit)]);
    const total = ['TOTAL', fmt2(rep.grand.income), fmt2(rep.grand.salary), fmt2(rep.grand.purchasing), fmt2(rep.grand.welfare), fmt2(rep.grand.expense), fmt2(rep.grand.profit)];

    const doc = new jspdf.jsPDF({ orientation: 'p', unit: 'pt', format: [PAGE_W, PAGE_H], compress: true });
    const lh = dataUriToBytes(LETTERHEAD_IMG);
    let y = 0, page = 0;
    const colX = []; let acc = BOX.x;
    cols.forEach(c => { colX.push(acc); acc += c.w; });
    const cellX = (c, i) => c.a === 'left' ? colX[i] + 6 : c.a === 'right' ? colX[i] + c.w - 6 : colX[i] + c.w / 2;

    const drawPage = () => {
      doc.addImage(lh, 'JPEG', 0, 0, PAGE_W, PAGE_H);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0, 45, 123);
      doc.text('PROJECT ' + scopeLabel.toUpperCase().replace('-WISE', ' WISE'), BOX.x, 191, { charSpace: 0.4 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 110, 132);
      doc.text('Period: ' + range, BOX.x, 208);
      doc.text('Generated: ' + fmtDateDisplay(this.today()), BOX.r, 208, { align: 'right' });
      doc.setDrawColor(217, 227, 240); doc.setLineWidth(1); doc.line(BOX.x, 216, BOX.r, 216);
    };
    const drawHeader = () => {
      doc.setFillColor(0, 45, 123); doc.rect(BOX.x, y, 503, 20, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.4); doc.setTextColor(255, 255, 255);
      cols.forEach((c, i) => doc.text(c.label, cellX(c, i), y + 13.4, { align: c.a === 'left' ? 'left' : c.a }));
      y += 20;
    };
    const newRow = () => {
      page++;
      if (page > 1) doc.addPage([PAGE_W, PAGE_H], 'p');
      drawPage();
      y = page === 1 ? 240 : BOX.top;
      drawHeader();
    };

    newRow();
    rows.forEach((r, ri) => {
      const rowH = 22;
      if (y + rowH > BOX.bottom) newRow();
      if (ri % 2 === 1) { doc.setFillColor(243, 248, 253); doc.rect(BOX.x, y, 503, rowH, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.2); doc.setTextColor(30, 42, 56);
      r.forEach((cell, ci) => {
        const c = cols[ci];
        if (ci === 0 && cell.length > 34) cell = cell.slice(0, 33) + '\u2026';
        doc.text(cell, cellX(c, ci), y + 14.4, { align: c.a === 'left' ? 'left' : c.a });
      });
      doc.setDrawColor(217, 227, 240); doc.setLineWidth(0.6); doc.line(BOX.x, y + rowH, BOX.r, y + rowH);
      y += rowH;
    });
    // total band
    if (y + 26 > BOX.bottom) newRow();
    doc.setFillColor(0, 45, 123); doc.rect(BOX.x, y, 503, 24, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.6); doc.setTextColor(255, 255, 255);
    total.forEach((cell, ci) => doc.text(cell, cellX(cols[ci], ci), y + 15.6, { align: cols[ci].a === 'left' ? 'left' : cols[ci].a }));
    y += 34;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.6); doc.setTextColor(68, 88, 110);
    doc.text('Profit = Income \u2212 (Salary + Purchasing + Welfare). Welfare = worker meals + accommodation + other payments.', BOX.x, y);

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      if (n > 1) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2); doc.setTextColor(122, 139, 158);
        doc.text('Page ' + i + ' of ' + n, 535, 731, { align: 'right' });
      }
    }
    const fname = 'PM Report - ' + ({ project: 'Project-wise', monthly: 'Monthly', weekly: 'Weekly' }[u.reportScope])
      + ((u.repFrom || u.repTo) ? ' - ' + (u.repFrom ? u.repFrom : '') + '_' + (u.repTo ? u.repTo : '') : '') + '.pdf';
    downloadBlob(doc.output('blob'), sanitizeFilename(fname));
    toast('Report PDF downloaded \u2713');
  }
};

/* local HTML escaper (independent of load order) */
function pEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   PM view wiring — delegated events on the pm container
   ============================================================ */
function wirePM() {
  const view = document.getElementById('pmView');

  view.addEventListener('click', e => {
    const btn = e.target.closest('[data-pm-act]');
    if (!btn) return;
    const act = btn.dataset.pmAct;
    const u = PM.ui;
    if (act === 'pmTab') { u.tab = btn.dataset.tab; }
    else if (act === 'formWorker') { u.wForm = 'worker'; }
    else if (act === 'cancelWForm') { u.wForm = null; }
    else if (act === 'saveWorker') {
      const name = document.getElementById('wkName').value.trim();
      if (!name) { toast('Enter the worker name', 'error'); return; }
      PM.load();
      PM.d.workers.unshift({
        id: PM.uid(), name,
        role: document.getElementById('wkRole').value.trim(),
        phone: document.getElementById('wkPhone').value.trim(),
        allocations: [], createdAt: Date.now()
      });
      PM.save();
      toast('Worker "' + name + '" added \u2713');
      u.wForm = null;
    } else if (act === 'delWorker') {
      PM.load();
      const w = PM.d.workers.find(x => x.id === btn.dataset.wid);
      if (!w || !confirm(`Delete worker "${w.name}"? Payment records are kept for reports.`)) return;
      PM.d.workers = PM.d.workers.filter(x => x.id !== w.id);
      if (u.wr.workerId === w.id) u.wr.workerId = '';
      if (u.payWorker === w.id) u.payWorker = '';
      PM.save();
    } else if (act === 'allocToggle') {
      PM.load();
      const w = PM.d.workers.find(x => x.id === btn.dataset.wid);
      if (!w) return;
      w.allocations = w.allocations || [];
      const i = w.allocations.indexOf(btn.dataset.pid);
      if (i >= 0) w.allocations.splice(i, 1);
      else w.allocations.push(btn.dataset.pid);
      PM.save();
    } else if (act === 'payForm') {
      u.wForm = 'pay';
      u.payWorker = btn.dataset.wid || u.payWorker || (PM.d.workers[0] ? PM.d.workers[0].id : '');
    } else if (act === 'savePayment') {
      const amount = Number(document.getElementById('wpAmount').value);
      const date = document.getElementById('wpDate').value;
      const workerId = document.getElementById('wpWorker').value;
      if (!workerId) { toast('Select a worker', 'error'); return; }
      if (!date || !(amount > 0)) { toast('Enter a date and an amount greater than 0', 'error'); return; }
      PM.load();
      PM.d.entries.push({
        id: PM.uid(), type: 'expense',
        category: document.getElementById('wpCategory').value,
        workerId,
        projectId: document.getElementById('wpProject').value || null,
        date, amount,
        note: document.getElementById('wpNote').value.trim(),
        src: 'worker', created: Date.now()
      });
      PM.save();
      toast('Payment LKR ' + fmt2(amount) + ' recorded \u2014 added to project expenses \u2713');
      u.wForm = null;
    } else if (act === 'wrOpen') {
      u.wr.workerId = btn.dataset.wid;
      u.wForm = null;
      PM.render();
      const el = document.querySelector('.pm-report.card2');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    } else if (act === 'wrScope') { u.wr.scope = btn.dataset.scope; }
    else if (act === 'workerPdf') { PM.workerReportPdf(); return; }
    else if (act === 'formProject') { u.form = 'project'; }
    else if (act === 'formIncome') { u.form = 'income'; u.formProject = u.filterProject !== 'all' ? u.filterProject : ''; }
    else if (act === 'formExpense') { u.form = 'expense'; u.formProject = u.filterProject !== 'all' ? u.filterProject : ''; }
    else if (act === 'cancelForm') { u.form = null; }
    else if (act === 'clearFilters') { u.filterProject = 'all'; u.filterFrom = ''; u.filterTo = ''; u.typeFilter = 'all'; }
    else if (act === 'typeFilter') { u.typeFilter = btn.dataset.tf; }
    else if (act === 'repScope') { u.reportScope = btn.dataset.scope; }
    else if (act === 'delEntry') {
      if (!confirm('Delete this record?')) return;
      PM.load();
      PM.d.entries = PM.d.entries.filter(x => x.id !== btn.dataset.id);
      PM.save();
    } else if (act === 'delProject') {
      PM.load();
      const p = PM.d.projects.find(x => x.id === btn.dataset.id);
      if (!p || !confirm(`Delete project "${p.name}"? Its records move to General.`)) return;
      PM.d.entries.forEach(en => { if (en.projectId === p.id) en.projectId = null; });
      PM.d.projects = PM.d.projects.filter(x => x.id !== p.id);
      if (u.filterProject === p.id) u.filterProject = 'all';
      PM.save();
    } else if (act === 'saveProject') {
      const name = document.getElementById('npName').value.trim();
      if (!name) { toast('Enter a project name', 'error'); return; }
      PM.load();
      if (PM.d.projects.some(p => p.name.trim().toLowerCase() === name.toLowerCase())) {
        toast('A project with this name already exists', 'error');
        return;
      }
      PM.d.projects.unshift({ id: PM.uid(), name, customer: document.getElementById('npCust').value.trim(), createdAt: Date.now() });
      PM.save();
      toast('Project "' + name + '" created \u2713');
      u.form = null;
    } else if (act === 'saveIncome') {
      const amount = Number(document.getElementById('inAmount').value);
      const date = document.getElementById('inDate').value;
      if (!date || !(amount > 0)) { toast('Enter a date and an amount greater than 0', 'error'); return; }
      PM.load();
      PM.d.entries.push({
        id: PM.uid(), type: 'income', date,
        projectId: document.getElementById('inProject').value || null,
        ref: document.getElementById('inRef').value.trim(),
        note: document.getElementById('inNote').value.trim(),
        amount, created: Date.now()
      });
      PM.save();
      toast('Income LKR ' + fmt2(amount) + ' recorded \u2713');
      u.form = null;
    } else if (act === 'saveExpense') {
      const amount = Number(document.getElementById('exAmount').value);
      const date = document.getElementById('exDate').value;
      const desc = document.getElementById('exDesc').value.trim();
      if (!date || !(amount > 0) || !desc) { toast('Enter date, description and an amount greater than 0', 'error'); return; }
      PM.load();
      PM.d.entries.push({
        id: PM.uid(), type: 'expense', date,
        projectId: document.getElementById('exProject').value || null,
        category: document.getElementById('exCategory').value,
        desc, amount, created: Date.now()
      });
      PM.save();
      toast('Expense LKR ' + fmt2(amount) + ' recorded \u2713');
      u.form = null;
    } else if (act === 'reportPdf') {
      PM.reportPdf();
      return; // no re-render needed
    }
    PM.render();
  });

  view.addEventListener('change', e => {
    const u = PM.ui;
    if (e.target.id === 'pmProjectFilter') u.filterProject = e.target.value;
    else if (e.target.id === 'pmFrom') u.filterFrom = e.target.value;
    else if (e.target.id === 'pmTo') u.filterTo = e.target.value;
    else if (e.target.id === 'pmRepFrom') u.repFrom = e.target.value;
    else if (e.target.id === 'pmRepTo') u.repTo = e.target.value;
    else if (e.target.id === 'wrWorker') u.wr.workerId = e.target.value;
    else if (e.target.id === 'npFromInv') {
      const opt = e.target.selectedOptions[0];
      if (opt && opt.value) {
        document.getElementById('npName').value = opt.value;
        document.getElementById('npCust').value = opt.dataset.cust || '';
      }
      return; // keep the form as-is so the user can tweak before saving
    }
    else if (e.target.id === 'inFromDoc') {
      const opt = e.target.selectedOptions[0];
      if (opt && opt.value) {
        document.getElementById('inRef').value = opt.value;
        if (opt.dataset.amt) document.getElementById('inAmount').value = Number(opt.dataset.amt).toFixed(2);
      }
      return; // don't re-render — keeps form inputs
    } else return;
    PM.render();
  });

  // keep the chart crisp on window resize while in Projects mode
  let pmResizeT = null;
  window.addEventListener('resize', () => {
    if (document.body.dataset.mode !== 'pm') return;
    clearTimeout(pmResizeT);
    pmResizeT = setTimeout(() => PM.drawChart(), 150);
  });
}
