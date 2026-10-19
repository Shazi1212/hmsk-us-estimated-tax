// Pure calculation: self-employment tax, federal income tax, QBI deduction, safe harbor, due dates,
// and the import of paid invoices from HMSK Invoice. No DOM. Tested in tests/.
import { STANDARD_DEDUCTION, BRACKETS, SE, ADDITIONAL_MEDICARE, QBI, SAFE_HARBOR, DUE, TAX_YEAR, STATUSES } from './config.js';

const r2 = v => Math.round(v * 100) / 100;
const pos = v => (v > 0 ? v : 0);

export const DEFAULTS = {
  status: 'single',
  gross: 90000,      // business income (1099 / invoices), before expenses
  expenses: 12000,   // deductible business expenses
  w2: 0,             // W-2 wages (also count against the Social Security wage base)
  other: 0,          // other taxable income (interest, dividends taxed as ordinary income, ...)
  adjustments: 0,    // other adjustments to income: SE health insurance, SEP/solo 401(k), HSA, ...
  itemized: 0,       // itemized deductions; the larger of these and the standard deduction is used
  qbi: true,         // claim the 20 % qualified business income deduction
  credits: 0,        // nonrefundable credits, e.g. child tax credit
  withholding: 0,    // federal income tax withheld from W-2 wages this year
  paid: 0,           // estimated payments already made for this tax year
  priorTax: null,    // last year's total tax (Form 1040 line 24); null = unknown
  priorAgi: null,    // last year's AGI (Form 1040 line 11)
};

// Federal income tax from the 2026 brackets (exact formula; the IRS tax table for income under 100,000 uses
// 50-dollar steps and can differ by a few dollars).
export function bracketTax(taxable, status) {
  const b = BRACKETS[status];
  let tax = 0, lower = 0;
  for (const [upper, rate] of b) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return r2(tax);
}

export function marginalRate(taxable, status) {
  for (const [upper, rate] of BRACKETS[status]) if (taxable <= upper) return rate;
  return 0.37;
}

// Schedule SE. profit = net profit from self-employment; w2SsWages = W-2 wages subject to Social Security.
export function seTax(profit, w2SsWages = 0) {
  const earnings = r2(pos(profit) * SE.factor);
  if (earnings < SE.minEarnings) return { earnings, ss: 0, medicare: 0, total: 0, deductible: 0 };
  const ssBase = Math.min(earnings, pos(SE.wageBase - w2SsWages));
  const ss = r2(ssBase * SE.ssRate);
  const medicare = r2(earnings * SE.medicareRate);
  const total = r2(ss + medicare);
  return { earnings, ssBase, ss, medicare, total, deductible: r2(total / 2) };
}

// Form 8959: 0.9 % on wages plus SE earnings above the threshold.
export function additionalMedicare(w2, seEarnings, status) {
  const thr = ADDITIONAL_MEDICARE.threshold[status];
  const wagesOver = pos(w2 - thr);
  const seOver = pos(seEarnings - pos(thr - w2));
  return r2((wagesOver + seOver) * ADDITIONAL_MEDICARE.rate);
}

// IRC 199A for a business without W-2 wages or qualified property (typical freelancer), and for service businesses.
export function qbiDeduction(qbi, taxableBeforeQbi, status) {
  if (qbi <= 0 || taxableBeforeQbi <= 0) return 0;
  const thr = QBI.threshold[status], range = QBI.range[status];
  // Fully phased out: no deduction. The 400 minimum is not applied here (conservative; for a service business
  // above the range there is no qualified business income left to apply it to).
  if (taxableBeforeQbi >= thr + range) return 0;
  let ded = QBI.rate * qbi;
  if (taxableBeforeQbi > thr) ded *= 1 - (taxableBeforeQbi - thr) / range;
  if (qbi >= QBI.minQbi) ded = Math.max(ded, QBI.minDeduction);
  return r2(Math.min(ded, QBI.rate * taxableBeforeQbi));
}

// Required annual payment (IRC 6654(d)(1)(B)). priorTax null = unknown, then only the 90 % rule applies.
export function safeHarbor(totalTax, priorTax, priorAgi, status) {
  const current = r2(totalTax * SAFE_HARBOR.current);
  let prior = null, priorPct = null;
  if (priorTax !== null && priorTax !== undefined) {
    priorPct = priorAgi !== null && priorAgi !== undefined && priorAgi > SAFE_HARBOR.highAgi[status] ? SAFE_HARBOR.priorHigh : SAFE_HARBOR.prior;
    prior = r2(priorTax * priorPct);
  }
  const required = prior === null ? current : Math.min(current, prior);
  return { current, prior, priorPct, required, basis: prior !== null && prior < current ? 'prior' : 'current' };
}

// ---------- due dates (IRC 6654(c), 7503) ----------
const iso = d => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
function nthWeekday(y, m, weekday, n) { // n-th weekday (0 = Sunday) of a month
  const first = utc(y, m, 1).getUTCDay();
  return utc(y, m, 1 + ((weekday - first + 7) % 7) + 7 * (n - 1));
}
// The DC legal holidays that can touch a 15 Jan / 15 Apr / 15 Jun / 15 Sep due date:
// Martin Luther King Jr. Day (3rd Monday of January) and DC Emancipation Day (16 April, observed on Friday 15 April
// when the 16th is a Saturday and on Monday 17 April when it is a Sunday).
export function isDcHoliday(d) {
  const y = d.getUTCFullYear(), s = iso(d);
  if (s === iso(nthWeekday(y, 1, 1, 3))) return true;
  const em = utc(y, 4, 16), wd = em.getUTCDay();
  const observed = wd === 6 ? utc(y, 4, 15) : wd === 0 ? utc(y, 4, 17) : em;
  return s === iso(observed);
}
export function nextBusinessDay(d) {
  const x = new Date(d);
  while (x.getUTCDay() === 0 || x.getUTCDay() === 6 || isDcHoliday(x)) x.setUTCDate(x.getUTCDate() + 1);
  return x;
}
// The four installment due dates for a tax year, as ISO strings.
export function dueDates(year) {
  return DUE.map(([off, m, d]) => iso(nextBusinessDay(utc(year + off, m, d))));
}
// The first due date on or after `today` (ISO string), searching this tax year and the next.
export function nextDue(today) {
  for (const y of [TAX_YEAR - 1, TAX_YEAR, TAX_YEAR + 1, TAX_YEAR + 2]) {
    const dates = dueDates(y);
    for (let i = 0; i < 4; i++) if (dates[i] >= today) return { date: dates[i], taxYear: y, index: i };
  }
  return null;
}

// ---------- the whole estimate ----------
export function compute(input, today = iso(new Date())) {
  const o = { ...DEFAULTS, ...input };
  const status = STATUSES.includes(o.status) ? o.status : 'single';
  const profit = r2(o.gross - o.expenses);
  const se = seTax(profit, o.w2);
  const addMed = additionalMedicare(o.w2, se.earnings, status);
  const agi = r2(profit + o.w2 + o.other - se.deductible - o.adjustments);
  const standard = STANDARD_DEDUCTION[status];
  const deduction = Math.max(standard, o.itemized);
  const taxableBeforeQbi = r2(pos(agi - deduction));
  const qbiBase = r2(pos(profit - se.deductible));
  const qbi = o.qbi ? qbiDeduction(qbiBase, taxableBeforeQbi, status) : 0;
  const taxable = r2(pos(taxableBeforeQbi - qbi));
  const incomeTaxGross = bracketTax(taxable, status);
  const incomeTax = r2(pos(incomeTaxGross - o.credits));
  const totalTax = r2(incomeTax + se.total + addMed);
  const sh = safeHarbor(totalTax, o.priorTax, o.priorAgi, status);
  const balance = r2(totalTax - o.withholding - o.paid);       // left to pay for the whole year
  const noPenalty = r2(totalTax - o.withholding) < SAFE_HARBOR.minBalance;
  const priorZero = o.priorTax === 0;
  const income = profit + o.w2 + o.other;

  // Installments for TAX_YEAR: each is 25 % of the required annual payment; withholding counts as paid evenly
  // on the four dates (IRC 6654(g)). Estimated payments made so far count against the earliest installments.
  const dates = dueDates(TAX_YEAR);
  const exempt = noPenalty || priorZero;
  const required = exempt ? 0 : sh.required;
  const perQuarter = r2(required / 4);
  const whPerQuarter = r2(o.withholding / 4);
  let cover = o.paid;
  const installments = dates.map((date, i) => {
    const need = r2(pos(perQuarter - whPerQuarter));
    const fromPaid = Math.min(cover, need); cover = r2(cover - fromPaid);
    return { date, required: perQuarter, withholding: whPerQuarter, need, open: r2(need - fromPaid), past: date < today };
  });
  // Amount to pay at the next due date of this tax year: everything that should have been paid by then.
  const nd = nextDue(today);
  let nextAmount = null;
  if (nd && nd.taxYear === TAX_YEAR) nextAmount = r2(installments.slice(0, nd.index + 1).reduce((s, x) => s + x.open, 0));

  // Next year's safe harbor from this year's estimate (100 % or 110 % of this year's tax, by this year's AGI).
  const nextPct = agi > SAFE_HARBOR.highAgi[status] ? SAFE_HARBOR.priorHigh : SAFE_HARBOR.prior;
  const nextYear = { pct: nextPct, annual: r2(totalTax * nextPct), quarter: r2(totalTax * nextPct / 4), dates: dueDates(TAX_YEAR + 1) };

  return {
    status, profit, se, addMed, agi, standard, deduction, itemizing: o.itemized > standard,
    taxableBeforeQbi, qbiBase, qbi, taxable, incomeTaxGross, incomeTax, totalTax,
    marginal: marginalRate(taxable, status), effective: income > 0 ? totalTax / income : 0,
    safeHarbor: sh, required, exempt, noPenalty, priorZero, balance, installments, next: nd, nextAmount, nextYear,
    withholding: o.withholding, paid: o.paid,
  };
}

// ---------- import from HMSK Invoice ----------
// Reads the HMSK Invoice database (localStorage key 'invoice-db' or a backup file from "Download backup") and sums
// the net amount (without VAT / sales tax) of invoices marked paid, by the year they were paid (cash basis).
// Credit notes count negative. Returns totals per currency; converting is up to the user.
export const INVOICE_DB_KEY = 'invoice-db';
export function invoiceNet(inv) {
  const sign = inv.docType === 'credit_note' ? -1 : 1;
  let net = 0;
  for (const l of inv.lines || []) {
    const qty = +l.qty || 0, price = +l.price || 0, disc = +l.disc || 0;
    net = r2(net + r2(sign * qty * price * (1 - disc / 100)));
  }
  return net;
}
export function importInvoices(db, year = TAX_YEAR) {
  if (!db || !Array.isArray(db.invoices)) throw new Error('not an invoice database');
  const byCurrency = {};
  let count = 0, skippedUnpaid = 0, otherYear = 0;
  for (const inv of db.invoices) {
    if (!['invoice', 'credit_note'].includes(inv.docType || 'invoice')) continue;
    if (inv.status !== 'paid') { if (inv.status === 'issued') skippedUnpaid++; continue; }
    const paidOn = String(inv.paidAt || inv.date || '');
    if (paidOn.slice(0, 4) !== String(year)) { otherYear++; continue; }
    const cur = inv.currency || 'EUR';
    const c = byCurrency[cur] || (byCurrency[cur] = { count: 0, net: 0 });
    c.count++; c.net = r2(c.net + invoiceNet(inv)); count++;
  }
  return { year, count, byCurrency, skippedUnpaid, otherYear };
}
