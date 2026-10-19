// Every calculation against values checked by hand from the official figures (Rev. Proc. 2025-32, SSA 2026 wage base,
// IRC 1401/1402, 199A, 6654, 7503). Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bracketTax, marginalRate, seTax, additionalMedicare, qbiDeduction, safeHarbor,
  dueDates, nextDue, isDcHoliday, compute, importInvoices, invoiceNet,
} from '../public/calc.js';

const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('brackets match the cumulative amounts printed in Rev. Proc. 2025-32 Tables 1 to 4', () => {
  // single (Table 3)
  assert.equal(bracketTax(12400, 'single'), 1240);
  assert.equal(bracketTax(50400, 'single'), 5800);
  assert.equal(bracketTax(105700, 'single'), 17966);
  assert.equal(bracketTax(201775, 'single'), 41024);
  assert.equal(bracketTax(256225, 'single'), 58448);
  assert.equal(bracketTax(640600, 'single'), 192979.25);
  // married filing jointly (Table 1)
  assert.equal(bracketTax(24800, 'mfj'), 2480);
  assert.equal(bracketTax(100800, 'mfj'), 11600);
  assert.equal(bracketTax(211400, 'mfj'), 35932);
  assert.equal(bracketTax(403550, 'mfj'), 82048);
  assert.equal(bracketTax(512450, 'mfj'), 116896);
  assert.equal(bracketTax(768700, 'mfj'), 206583.5);
  // head of household (Table 2)
  assert.equal(bracketTax(17700, 'hoh'), 1770);
  assert.equal(bracketTax(67450, 'hoh'), 7740);
  assert.equal(bracketTax(105700, 'hoh'), 16155);
  assert.equal(bracketTax(201750, 'hoh'), 39207);
  assert.equal(bracketTax(256200, 'hoh'), 56631);
  assert.equal(bracketTax(640600, 'hoh'), 191171);
  // married filing separately (Table 4)
  assert.equal(bracketTax(384350, 'mfs'), 103291.75);
  // inside a bracket and above the top
  assert.equal(bracketTax(0, 'single'), 0);
  assert.equal(bracketTax(60000, 'single'), 5800 + 9600 * 0.22);
  assert.equal(bracketTax(700000, 'single'), 192979.25 + 59400 * 0.37);
  assert.equal(marginalRate(60000, 'single'), 0.22);
  assert.equal(marginalRate(800000, 'mfj'), 0.37);
});

test('self-employment tax: 92.35 %, 12.4 % up to the 2026 wage base 184,500, 2.9 %', () => {
  const a = seTax(100000);
  near(a.earnings, 92350);
  near(a.ss, 11451.40);
  near(a.medicare, 2678.15);
  near(a.total, 14129.55);
  near(a.deductible, 7064.78, 0.011);
  const b = seTax(250000); // earnings 230,875 above the wage base
  near(b.ss, 184500 * 0.124);
  near(b.medicare, 6695.38);
  const c = seTax(100000, 100000); // W-2 wages use up part of the wage base
  near(c.ss, 84500 * 0.124);
  assert.equal(seTax(400).total, 0); // 369.40 of net earnings is under the 400 minimum
  near(seTax(500).total, 500 * 0.9235 * 0.153);
  assert.equal(seTax(-5000).total, 0);
});

test('Additional Medicare Tax 0.9 % above 200,000 / 250,000 / 125,000', () => {
  near(additionalMedicare(0, 230875, 'single'), 277.88);
  near(additionalMedicare(200000, 92350, 'mfj'), 381.15);
  assert.equal(additionalMedicare(0, 150000, 'single'), 0);
  near(additionalMedicare(0, 150000, 'mfs'), 225);
});

test('QBI deduction: 20 %, taxable income limit, phase-out, 400 minimum', () => {
  assert.equal(qbiDeduction(80000, 60000, 'single'), 12000);          // limited to 20 % of taxable income
  assert.equal(qbiDeduction(50000, 150000, 'single'), 10000);         // full 20 %
  assert.equal(qbiDeduction(100000, 239250, 'single'), 10000);        // halfway through the 75,000 range
  assert.equal(qbiDeduction(100000, 276750, 'single'), 0);            // fully phased out
  assert.equal(qbiDeduction(100000, 478500, 'mfj'), 10000);           // halfway through the 150,000 range
  assert.equal(qbiDeduction(1500, 50000, 'single'), 400);             // minimum 400 from 1,000 of QBI
  assert.equal(qbiDeduction(900, 50000, 'single'), 180);              // under 1,000 of QBI: no minimum
  assert.equal(qbiDeduction(0, 50000, 'single'), 0);
});

test('safe harbor: smaller of 90 % this year or 100 % / 110 % last year', () => {
  assert.deepEqual(safeHarbor(20000, 15000, 120000, 'single'),
    { current: 18000, prior: 15000, priorPct: 1, required: 15000, basis: 'prior' });
  assert.equal(safeHarbor(20000, 15000, 160000, 'single').required, 16500);   // 110 % above 150,000 AGI
  assert.equal(safeHarbor(20000, 15000, 80000, 'mfs').priorPct, 1.1);         // MFS: 75,000
  assert.equal(safeHarbor(20000, 25000, 100000, 'single').required, 18000);   // 90 % is lower
  assert.equal(safeHarbor(20000, null, null, 'single').required, 18000);      // last year unknown
});

test('due dates move past weekends and DC holidays (IRC 7503)', () => {
  assert.deepEqual(dueDates(2026), ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15']);
  assert.deepEqual(dueDates(2027), ['2027-04-15', '2027-06-15', '2027-09-15', '2028-01-18']); // Sat 15th, Mon 17th MLK Day
  assert.equal(dueDates(2022)[0], '2022-04-18'); // Emancipation Day observed Fri 15 April 2022
  assert.equal(dueDates(2022)[3], '2023-01-17'); // Sun 15th, Mon 16th MLK Day
  assert.ok(isDcHoliday(new Date(Date.UTC(2026, 0, 19))));  // MLK Day 2026
  assert.ok(!isDcHoliday(new Date(Date.UTC(2026, 3, 15))));
  assert.deepEqual(nextDue('2026-10-19'), { date: '2027-01-15', taxYear: 2026, index: 3 });
  assert.deepEqual(nextDue('2027-01-15'), { date: '2027-01-15', taxYear: 2026, index: 3 });
  assert.deepEqual(nextDue('2027-01-16'), { date: '2027-04-15', taxYear: 2027, index: 0 });
  assert.deepEqual(nextDue('2026-05-01'), { date: '2026-06-15', taxYear: 2026, index: 1 });
});

test('end to end: single freelancer, 78,000 profit, 4,000 already paid', () => {
  const r = compute({ status: 'single', gross: 90000, expenses: 12000, paid: 4000, qbi: true }, '2026-10-19');
  near(r.profit, 78000);
  near(r.se.earnings, 72033);
  near(r.se.total, 11021.05);
  near(r.agi, 72489.47, 0.02);
  near(r.taxableBeforeQbi, 56389.47, 0.02);
  near(r.qbi, 11277.89, 0.02);                 // 20 % of taxable income (lower than 20 % of QBI)
  near(r.taxable, 45111.58, 0.03);
  near(r.incomeTax, 5165.39, 0.03);            // 1,240 + 12 % of (45,111.58 - 12,400)
  near(r.totalTax, 16186.44, 0.04);
  near(r.safeHarbor.required, 14567.80, 0.04);  // 90 %, last year unknown
  near(r.installments[0].open, 0);
  near(r.nextAmount, 14567.80 - 4000, 0.05);    // everything due by 15 January 2027
  assert.equal(r.next.date, '2027-01-15');
  near(r.balance, 12186.44, 0.04);
  near(r.nextYear.quarter, 16186.44 / 4, 0.02);  // AGI under 150,000: 100 %
});

test('end to end: withholding counts evenly, under 1,000 owed means no payments needed', () => {
  const r = compute({ status: 'mfj', gross: 20000, expenses: 5000, w2: 90000, withholding: 9000, qbi: true }, '2026-10-19');
  assert.ok(r.totalTax - 9000 < 1000);
  assert.equal(r.noPenalty, true);
  assert.equal(r.required, 0);
  assert.equal(r.nextAmount, 0);
  const z = compute({ gross: 60000, expenses: 0, priorTax: 0, priorAgi: 20000 }, '2026-10-19');
  assert.equal(z.priorZero, true);
  assert.equal(z.required, 0);
});

test('import from HMSK Invoice: paid invoices of the tax year, net of VAT, credit notes negative', () => {
  const db = { invoices: [
    { status: 'paid', docType: 'invoice', currency: 'USD', date: '2026-02-01', paidAt: '2026-02-20', lines: [{ qty: 10, price: 150, vat: 0 }] },
    { status: 'paid', docType: 'invoice', currency: 'USD', date: '2025-12-20', paidAt: '2026-01-05', lines: [{ qty: 1, price: 2000, disc: 10, vat: 8 }] },
    { status: 'paid', docType: 'credit_note', currency: 'USD', date: '2026-03-01', paidAt: '2026-03-02', lines: [{ qty: 1, price: 300 }] },
    { status: 'paid', docType: 'invoice', currency: 'EUR', date: '2026-04-01', paidAt: '2026-04-10', lines: [{ qty: 2, price: 500, vat: 19 }] },
    { status: 'issued', docType: 'invoice', currency: 'USD', date: '2026-05-01', lines: [{ qty: 1, price: 999 }] },
    { status: 'paid', docType: 'invoice', currency: 'USD', date: '2025-06-01', paidAt: '2025-06-10', lines: [{ qty: 1, price: 999 }] },
    { status: 'draft', docType: 'invoice', currency: 'USD', lines: [{ qty: 1, price: 999 }] },
    { status: 'paid', docType: 'self_billing', currency: 'USD', paidAt: '2026-06-01', lines: [{ qty: 1, price: 999 }] },
  ] };
  assert.equal(invoiceNet(db.invoices[1]), 1800);
  assert.equal(invoiceNet(db.invoices[2]), -300);
  const r = importInvoices(db, 2026);
  assert.equal(r.count, 4);
  assert.deepEqual(r.byCurrency, { USD: { count: 3, net: 3000 }, EUR: { count: 1, net: 1000 } });
  assert.equal(r.skippedUnpaid, 1);
  assert.equal(r.otherYear, 1);
  assert.throws(() => importInvoices({ foo: 1 }));
});
