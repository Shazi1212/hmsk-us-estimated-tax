# US Estimated Tax

US freelancers have to pay tax four times a year and most guess the amount; this calculator works out the 2026 self-employment tax, federal income tax, the safe-harbor amount that avoids the underpayment penalty, and what to pay by the next due date.

**Use it online:** [hmsk.life/tools/us-estimated-tax](https://hmsk.life/tools/us-estimated-tax/) (runs in your browser, nothing is sent anywhere).

## What it does

- Self-employment tax (Schedule SE): 92.35 % of net profit, 12.4 % Social Security up to the 2026 wage base of 184,500 (minus W-2 wages), 2.9 % Medicare, Additional Medicare Tax 0.9 % above 200,000 / 250,000 / 125,000. Half of SE tax is deducted from income.
- Federal income tax with the 2026 brackets and standard deduction for all four filing statuses (Rev. Proc. 2025-32), itemized deductions if larger, nonrefundable credits.
- Qualified business income deduction (20 %, taxable income limit, phase-out above 201,750 / 403,500, minimum 400 from 2026) for a business without employees.
- Safe harbor (IRC 6654): smaller of 90 % of this year's tax or 100 % / 110 % of last year's, the 1,000 de-minimis rule, withholding counted evenly.
- The four installments for 2026 with what is still open, the next due date (weekends and DC holidays handled, IRC 7503), and the 2027 safe-harbor installments from this estimate.
- Imports income from [HMSK Invoice](https://hmsk.life/tools/invoice/): reads its browser storage (same site) or a backup file and sums the invoices marked paid in 2026, net of VAT / sales tax, credit notes negative. Other currencies count after you enter an exchange rate.
- English and German, inputs saved in your browser and in the URL (share link), print view.

All figures live in [`public/config.js`](public/config.js), each with its source. The app lists them with an "as of" date. An estimate, not tax advice; federal only (no state tax).

## Quick start

No build step, no dependencies. Serve `public/` with any static web server:

```sh
python3 -m http.server 8080 --directory public
# open http://localhost:8080/
```

(ES modules do not load from `file://`, so a server is needed.)

Run the tests (Node.js 20+):

```sh
node --test tests/
```

Tests check the brackets against the cumulative amounts printed in Rev. Proc. 2025-32, SE tax around the wage base, Additional Medicare Tax, the QBI phase-out and minimum, both safe harbors, due dates including weekend and holiday shifts (e.g. 18 April 2022, 17 January 2023), two end-to-end cases and the invoice import.

## Files

| File | What |
|---|---|
| `public/config.js` | every figure with source URL |
| `public/calc.js` | pure calculation and invoice import, no DOM |
| `public/i18n.js` | English and German texts |
| `public/app.js`, `index.html`, `app.css` | the UI |

To self-host, set `LINK_BASE` in `public/config.js` if the top-strip links should point somewhere other than hmsk.life. The invoice import from browser storage only works when both tools run on the same origin; the backup file works everywhere. Fonts (Newsreader, Public Sans; SIL Open Font License) are in `public/fonts/`; the shared hmsk.life look is in `public/letterpress.css`.

## Updating for a new year

Change `TAX_YEAR` and the numbers in `public/config.js` (Rev. Proc. for the year, SSA wage base), update the hand-checked values in `tests/calc.test.js`, run the tests.

## License

MIT, see [LICENSE](LICENSE).
