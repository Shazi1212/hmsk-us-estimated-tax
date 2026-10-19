// UI: reads the form, calls the pure calc module, renders. State in localStorage and the URL hash.
import { DEFAULTS, compute, importInvoices, INVOICE_DB_KEY } from './calc.js';
import { SOURCES, LINK_BASE, TAX_YEAR, STANDARD_DEDUCTION } from './config.js';
import { TEXT } from './i18n.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const STORE = 'hmsk-us-estimated-tax-v1';
const NUM = ['gross', 'expenses', 'w2', 'other', 'adjustments', 'itemized', 'credits', 'withholding', 'paid'];
const OPT = ['priorTax', 'priorAgi'];        // empty = unknown (null)
const STATUSES = ['single', 'mfj', 'mfs', 'hoh'];
const okNum = v => v !== undefined && v !== null && v !== '' && isFinite(Number(v));

let lang = pickLang();
let state = loadState();
let imported = null;                         // last import result
const rates = {};                            // user-entered rates for non-USD currencies

function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'de' || q === 'en') return q;
  try { const s = localStorage.getItem(STORE + '-lang'); if (s === 'de' || s === 'en') return s; } catch {}
  return (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en';
}
const t = () => TEXT[lang];

// ---------- state <-> hash / storage ----------
function sanitize(raw) {
  const o = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return o;
  for (const k of NUM) if (okNum(raw[k])) o[k] = Math.max(0, Number(raw[k]));
  for (const k of OPT) o[k] = okNum(raw[k]) ? Math.max(0, Number(raw[k])) : null;
  if (STATUSES.includes(raw.status)) o.status = raw.status;
  if (raw.qbi !== undefined) o.qbi = raw.qbi === true || raw.qbi === '1' || raw.qbi === 1;
  return o;
}
function toHash(o) {
  const p = new URLSearchParams();
  p.set('status', o.status);
  for (const k of NUM) p.set(k, o[k]);
  for (const k of OPT) p.set(k, o[k] === null ? '' : o[k]);
  p.set('qbi', o.qbi ? '1' : '0');
  return p.toString();
}
function loadState() {
  const h = location.hash.slice(1);
  if (h.includes('=')) return sanitize(Object.fromEntries(new URLSearchParams(h)));
  try { const s = localStorage.getItem(STORE); if (s) return sanitize(JSON.parse(s)); } catch {}
  return sanitize(null);
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  history.replaceState(null, '', location.pathname + location.search + '#' + toHash(state));
}

// ---------- formatting ----------
const locale = () => (lang === 'de' ? 'de-DE' : 'en-US');
const usd = (v, d = 0) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v) < 0.005 ? 0 : v);
const money = (v, c) => new Intl.NumberFormat(locale(), { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(v);
const pct = (v, d = 0) => new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: d }).format(v);
const date = s => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T00:00:00Z'));
const dateShort = s => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(s + 'T00:00:00Z'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- static texts ----------
function applyTexts() {
  const T = t();
  document.documentElement.lang = lang;
  document.title = T.docTitle;
  for (const el of $$('[data-t]')) {
    const v = T[el.dataset.t];
    if (typeof v === 'string') el.textContent = v;
  }
  $('#langBtn').setAttribute('aria-label', T.langSwitchLabel);
  const de = lang === 'de';
  const base = LINK_BASE;
  $('#lnkHome').href = $('#lnkHome2').href = base + (de ? '/de/tools/us-estimated-tax/' : '/tools/us-estimated-tax/');
  $('#lnkImprint').href = base + (de ? '/impressum/' : '/imprint/');
  $('#lnkPrivacy').href = base + (de ? '/datenschutz/' : '/privacy/');
  $('#lnkInvoice').href = base + (de ? '/de/tools/invoice/' : '/tools/invoice/');
  $('#lnkNotify').href = base + (de ? '/de/?topic=us-estimated-tax#contact' : '/?topic=us-estimated-tax#contact');
  $('#figTbl tbody').innerHTML = T.figs.map(([k, v, s]) =>
    `<tr><td>${esc(k)}</td><td class="m"><a href="${esc(SOURCES[s])}" rel="noopener" target="_blank">${esc(v)}</a></td></tr>`).join('');
  $('#assumptions').innerHTML = T.assumptions.map(a => `<li>${esc(a)}</li>`).join('');
  $('#sources').innerHTML = T.src.map(([label, key]) => `<li><a href="${esc(SOURCES[key])}" rel="noopener" target="_blank">${esc(label)}</a></li>`).join('');
}

// ---------- form <-> state ----------
function fillForm() {
  $('#status').value = state.status;
  for (const k of NUM) document.getElementById(k).value = state[k];
  for (const k of OPT) document.getElementById(k).value = state[k] === null ? '' : state[k];
  $('#qbi').checked = state.qbi;
}
function readForm() {
  const raw = { status: $('#status').value, qbi: $('#qbi').checked };
  for (const k of [...NUM, ...OPT]) raw[k] = document.getElementById(k).value;
  for (const k of NUM) if (!okNum(raw[k])) raw[k] = 0;
  state = sanitize(raw);
}

// ---------- render ----------
function render() {
  const T = t();
  const r = compute(state, today());
  $('#stdHint').textContent = T.stdHint(T[state.status], usd(STANDARD_DEDUCTION[state.status]));

  // headline: next payment
  const nd = r.next;
  if (nd && nd.taxYear === TAX_YEAR) {
    $('#nextLabel').textContent = T.nextLabel(date(nd.date));
    $('#nextAmount').textContent = usd(r.nextAmount);
    $('#nextNote').textContent = r.exempt ? T.nextNoteExempt : T.nextNoteQ(nd.index + 1, nd.taxYear);
  } else if (nd) {
    $('#nextLabel').textContent = T.nextLabel(date(nd.date));
    $('#nextAmount').textContent = usd(r.nextYear.quarter);
    $('#nextNote').textContent = T.nextNoteNextYear(nd.taxYear);
  } else {
    $('#nextLabel').textContent = T.nextLabelNone;
    $('#nextAmount').textContent = usd(r.required);
    $('#nextNote').textContent = '';
  }
  $('#kTotal').textContent = usd(r.totalTax);
  $('#kEff').textContent = T.eff(pct(r.effective, 1));
  $('#kSe').textContent = usd(r.se.total + r.addMed);
  $('#kIncome').textContent = usd(r.incomeTax);
  $('#kMarg').textContent = T.marg(pct(r.marginal));

  // installments
  const [h1, h2, h3] = T.schedHead;
  const nextIdx = nd && nd.taxYear === TAX_YEAR ? nd.index : -1;
  $('#schedTbl tbody').innerHTML = `<tr><td class="m">${esc(h1)}</td><td class="n m">${esc(h2)}</td><td class="n m">${esc(h3)}</td></tr>` +
    r.installments.map((x, i) => {
      const tag = i === nextIdx ? ` <span class="tag tag--next">${esc(T.nextTag)}</span>` : x.past ? ` <span class="tag">${esc(T.past)}</span>` : '';
      return `<tr class="${i === nextIdx ? 'tot' : ''}"><td><time datetime="${x.date}">${esc(dateShort(x.date))}</time>${tag}</td><td class="n">${esc(usd(x.required))}</td><td class="n">${esc(usd(x.open))}</td></tr>`;
    }).join('');
  const sh = r.safeHarbor;
  let note = r.exempt ? T.nextNoteExempt
    : sh.basis === 'prior' ? T.shPrior(pct(sh.priorPct), usd(sh.prior), usd(sh.current))
    : T.shCurrent(usd(sh.current), sh.prior !== null ? usd(sh.prior) : '');
  if (state.withholding > 0 && !r.exempt) note += ' ' + T.shWh;
  if (r.balance > 0) note += ' ' + T.shBalance(usd(r.balance));
  $('#shNote').textContent = note;

  const ny = r.nextYear;
  $('#nextYearOut').textContent = T.nextYear(pct(ny.pct), usd(ny.quarter), usd(ny.annual), ny.dates.slice(0, 4).map(dateShort).join(' · '));

  // calculation table
  const R = T.rows;
  const rows = [
    ['profit', r.profit, 'tot0'], ['seEarn', r.se.earnings, 'sub'], ['ss', r.se.ss], ['med', r.se.medicare], ['se', r.se.total, 'tot0'],
    ...(state.w2 ? [['w2', state.w2]] : []), ...(state.other ? [['other', state.other]] : []),
    ['halfSe', -r.se.deductible], ...(state.adjustments ? [['adj', -state.adjustments]] : []),
    ['agi', r.agi, 'tot0'],
    [r.itemizing ? 'item' : 'std', -r.deduction], ...(r.qbi ? [['qbi', -r.qbi]] : []),
    ['taxable', r.taxable, 'tot0'], ['it', r.incomeTaxGross], ...(state.credits ? [['credits', -(r.incomeTaxGross - r.incomeTax)]] : []),
    ['se', r.se.total], ...(r.addMed ? [['addMed', r.addMed]] : []),
    ['total', r.totalTax, 'tot'],
    ...(state.withholding ? [['wh', -state.withholding]] : []), ...(state.paid ? [['paid', -state.paid]] : []),
    ['balance', r.balance, 'tot'],
  ];
  $('#calcTbl tbody').innerHTML = rows.map(([k, v, cls]) =>
    `<tr class="${cls || ''}"><td>${esc(R[k])}</td><td class="n">${esc(usd(v))}</td></tr>`).join('');
}

// ---------- invoice import ----------
function showImport(res) {
  const T = t();
  imported = res;
  const box = $('#importOut');
  box.hidden = false;
  if (typeof res === 'string') { box.innerHTML = `<p class="err">${esc(res)}</p>`; return; }
  const rows = Object.entries(res.byCurrency).map(([c, v]) => {
    const conv = c === 'USD' ? '' :
      `<input type="number" class="rate" data-cur="${esc(c)}" min="0" step="0.0001" inputmode="decimal" placeholder="${esc(T.importRate(c))}" aria-label="${esc(T.importRate(c))}" value="${rates[c] ?? ''}">`;
    return `<li><span>${esc(c)} · ${v.count}×</span><b>${esc(money(v.net, c))}</b>${conv}</li>`;
  }).join('');
  const skipped = res.skippedUnpaid || res.otherYear ? `<p class="hint">${esc(T.importSkipped(res.skippedUnpaid, res.otherYear))}</p>` : '';
  box.innerHTML = `<p>${esc(T.importResult(res.count, res.year))}</p><ul>${rows}</ul>${skipped}` +
    (res.count ? `<button type="button" class="btn btn--amber sm" id="importApply">${esc(T.importApply)} <span id="importSum"></span></button>` : '');
  updateImportSum();
}
function importTotal() {
  if (!imported || typeof imported === 'string') return 0;
  let sum = 0;
  for (const [c, v] of Object.entries(imported.byCurrency)) {
    if (c === 'USD') sum += v.net;
    else if (rates[c] > 0) sum += v.net * rates[c];
  }
  return Math.round(sum * 100) / 100;
}
function updateImportSum() {
  const el = $('#importSum');
  if (el) el.textContent = '(' + usd(importTotal()) + ')';
}
function readDb(text) {
  try { return importInvoices(JSON.parse(text), TAX_YEAR); } catch { return null; }
}

// ---------- events ----------
let timer;
function onChange(e) {
  if (e && e.target.closest('#importOut')) return;
  readForm();
  clearTimeout(timer);
  timer = setTimeout(() => { render(); save(); }, 60);
}

function init() {
  applyTexts();
  fillForm();
  render();
  save();
  $('#form').addEventListener('input', onChange);
  $('#form').addEventListener('change', onChange);
  $('#form').addEventListener('submit', e => e.preventDefault());

  $('#importLocal').addEventListener('click', () => {
    let s = null;
    try { s = localStorage.getItem(INVOICE_DB_KEY); } catch {}
    const res = s ? readDb(s) : null;
    showImport(res || t().importNone);
  });
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    const res = readDb(await f.text());
    showImport(res || t().importBad);
    e.target.value = '';
  });
  $('#importOut').addEventListener('input', e => {
    if (e.target.matches('.rate')) { rates[e.target.dataset.cur] = Number(e.target.value) || 0; updateImportSum(); }
  });
  $('#importOut').addEventListener('click', e => {
    if (!e.target.closest('#importApply')) return;
    state.gross = importTotal();
    fillForm(); render(); save();
    const p = document.createElement('p'); p.className = 'hint'; p.textContent = t().importApplied;
    $('#importOut').append(p);
    $('#gross').focus();
  });

  $('#langBtn').addEventListener('click', () => {
    lang = lang === 'de' ? 'en' : 'de';
    try { localStorage.setItem(STORE + '-lang', lang); } catch {}
    const u = new URL(location.href); u.searchParams.set('lang', lang);
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    applyTexts(); fillForm(); render();
    if (imported) showImport(imported);
  });
  $('#printBtn').addEventListener('click', () => window.print());
  $('#resetBtn').addEventListener('click', () => { state = sanitize(null); fillForm(); render(); save(); });
  $('#shareBtn').addEventListener('click', async () => {
    const u = new URL(location.href); u.searchParams.set('lang', lang); u.hash = toHash(state);
    const btn = $('#shareBtn');
    try { await navigator.clipboard.writeText(u.toString()); btn.textContent = t().shared; }
    catch { window.prompt(t().share, u.toString()); }
    setTimeout(() => { btn.textContent = t().share; }, 1800);
  });
  window.addEventListener('hashchange', () => { state = loadState(); fillForm(); render(); });
}

init();
