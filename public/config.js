// All federal tax figures used by the calculator, in one place.
// Every value has a source. Checked 2026-10-19. Update once a year (the IRS publishes the next year's
// figures in a Revenue Procedure each October, the SSA announces the wage base in October).
// Amounts in USD. Rates as decimals (0.124 = 12.4 %).

export const TAX_YEAR = 2026;
export const CHECKED = '2026-10-19';

// Links in the top strip. '' = same host (hosted on hmsk.life). Self-hosted copies point to hmsk.life.
export const LINK_BASE = 'https://hmsk.life';

export const SOURCES = {
  revProc: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
  irsNews: 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill',
  ssaBase: 'https://www.ssa.gov/oact/cola/cbb.html',
  seTax: 'https://www.irs.gov/businesses/small-businesses-self-employed/self-employment-tax-social-security-and-medicare-taxes',
  irc1401: 'https://www.law.cornell.edu/uscode/text/26/1401',
  irc1402: 'https://www.law.cornell.edu/uscode/text/26/1402',
  irc164f: 'https://www.law.cornell.edu/uscode/text/26/164',
  irc199A: 'https://www.law.cornell.edu/uscode/text/26/199A',
  irc6654: 'https://www.law.cornell.edu/uscode/text/26/6654',
  irc7503: 'https://www.law.cornell.edu/uscode/text/26/7503',
  estTaxes: 'https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes',
  f1040es: 'https://www.irs.gov/forms-pubs/about-form-1040-es',
  pub505: 'https://www.irs.gov/publications/p505',
};

export const STATUSES = ['single', 'mfj', 'mfs', 'hoh'];

// Standard deduction 2026, Rev. Proc. 2025-32 section 4.14(1). Source: SOURCES.revProc
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 };

// Income tax brackets 2026, Rev. Proc. 2025-32 section 4.01, Tables 1 to 4: [upper limit of the bracket, rate].
// The last bracket has no upper limit. Source: SOURCES.revProc
export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj:    [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  mfs:    [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]],
  hoh:    [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};

// Self-employment tax (IRC 1401, 1402). Net earnings from self-employment = 92.35 % of net profit
// (profit minus the 7.65 % employer-equivalent share). No SE tax below 400 of net earnings.
// Social Security part 12.4 % up to the wage base (minus W-2 Social Security wages), Medicare 2.9 % on all.
// Half of the SE tax (without the Additional Medicare Tax) is deductible from income (IRC 164(f)).
// Sources: SOURCES.seTax, SOURCES.irc1401, SOURCES.irc1402, SOURCES.irc164f, SOURCES.ssaBase
export const SE = {
  factor: 0.9235,
  minEarnings: 400,
  ssRate: 0.124,
  medicareRate: 0.029,
  wageBase: 184500,                 // 2026 contribution and benefit base (SSA, announced 24 Oct 2025)
};

// Additional Medicare Tax 0.9 % above a threshold that is fixed in the law (not indexed). IRC 1401(b)(2).
export const ADDITIONAL_MEDICARE = { rate: 0.009, threshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 } };

// Qualified business income deduction (IRC 199A): 20 % of QBI, limited to 20 % of taxable income.
// Above the threshold it phases out over the phase-in range for service businesses (SSTB) and for businesses
// without W-2 wages or property, which is the typical freelancer. Since 2026 (OBBBA section 70105):
// minimum deduction 400 if QBI is at least 1,000. Rev. Proc. 2025-32 sections 2.12 and 4.26. Source: SOURCES.revProc
export const QBI = {
  rate: 0.20,
  threshold: { single: 201750, mfj: 403500, mfs: 201775, hoh: 201750 },
  range: { single: 75000, mfj: 150000, mfs: 75000, hoh: 75000 },
  minDeduction: 400,
  minQbi: 1000,
};

// Estimated tax safe harbors (IRC 6654(d)(1)): no underpayment penalty if withholding plus timely estimated payments
// reach the smaller of 90 % of this year's tax or 100 % of last year's tax (110 % if last year's AGI was above
// 150,000, or 75,000 when married filing separately). No penalty if the balance due is under 1,000 (IRC 6654(e)(1)),
// or if last year's tax was zero for a full 12-month year (IRC 6654(e)(2)).
// Sources: SOURCES.irc6654, SOURCES.estTaxes, SOURCES.pub505
export const SAFE_HARBOR = {
  current: 0.90,
  prior: 1.00,
  priorHigh: 1.10,
  highAgi: { single: 150000, mfj: 150000, mfs: 75000, hoh: 150000 },
  minBalance: 1000,
};

// Due dates: 15 April, 15 June, 15 September of the tax year and 15 January of the next year (IRC 6654(c)(2)),
// moved to the next business day when they fall on a weekend or a legal holiday in the District of Columbia
// (IRC 7503). Sources: SOURCES.irc6654, SOURCES.irc7503, SOURCES.f1040es
export const DUE = [[0, 4, 15], [0, 6, 15], [0, 9, 15], [1, 1, 15]]; // [year offset, month, day]
