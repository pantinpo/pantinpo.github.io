# Weekly Business Review Robot

A Google Sheets + Apps Script automation that turns three messy Monday exports into a one-page weekly business review, then emails it as a PDF.

Built for **Harbor & Pine Co.**, a made-up Melbourne home-goods store with a Shopify shop, a support team on phone, chat and email, and ads on Meta, Google and Pinterest.

## What it does

1. **Cleans** the raw orders, helpdesk tickets and ad spend tabs. It trims stray spaces, fixes channel names ("FB", "Facebook" and "Meta ads" all become Meta), reads three date formats and currency stored as text, and removes duplicate rows.
2. **Builds weekly KPIs** for the last complete week: net revenue, orders, AOV, refund rate, ad spend, blended ROAS, tickets, tickets per 100 orders, median first response time and CSAT.
3. **Compares** each KPI with last week and the 4-week average. Anything outside the threshold on the Config tab is flagged as Better, Worse or Watch, with a note on what to check.
4. **Writes** `WBR_Summary` (KPIs, 8-week trend, channel mix, data checks) and `Anomalies`.
5. **Emails** a short HTML recap with the summary attached as a PDF, and logs the run on `Run_Log`.
6. **Runs itself** every Monday at 8am once the trigger is installed.

## Files

| File | What it is |
| --- | --- |
| `weekly-business-review-robot.xlsx` | The workbook with raw data, ready for the script |
| `Code.gs` | The Apps Script |
| `weekly-business-review-robot-example-output.xlsx` | The same workbook after one run, so you can see the result without running anything |
| `example-email.html` | The email the robot sent for that run |

## Set it up

1. Upload `weekly-business-review-robot.xlsx` to Google Drive and open it with Google Sheets. Then use File > Save as Google Sheets.
2. Go to Extensions > Apps Script. Delete the starter code, paste in `Code.gs` and save.
3. In Apps Script, open Project Settings and set the time zone to yours (the sample uses Australia/Melbourne).
4. Back in the sheet, put your email in `Config` > Email to.
5. Reload the sheet. A **Report Robot** menu appears. Click Run weekly review now and approve the permissions.
6. Optional: Report Robot > Install Monday 8am trigger.

Each week, paste the new exports over the three `Raw_` tabs. The robot does the rest.

## Settings (Config tab)

| Setting | Default | Notes |
| --- | --- | --- |
| Company | Harbor & Pine Co. | Used in the report title and email subject |
| Email to | you@example.com | Comma-separate multiple addresses |
| Week starting | blank | Blank reports the last complete Monday–Sunday week in the data |
| Anomaly threshold | 15% | Change vs the 4-week average that gets flagged |
| Currency | AUD | AUD, USD, NZD, GBP, EUR or PHP |
| Send email | TRUE | FALSE builds the report without sending it |

## Example run (week of 14–20 Sep 2026)

- **Net revenue:** A$42,854, up 12% on the 4-week average.
- **Ad spend:** up 39%, while blended ROAS fell from 3.80x to 3.07x. That points to a new Meta prospecting campaign.
- **Support tickets:** 109, more than double the usual. Refund rate rose from 3.7% to 7.8%, and CSAT fell from 4.32 to 3.63. The ticket subjects point to courier delays and damaged items.
- **Data cleaning:** 77 duplicate rows removed across the three exports, plus 1 pasted "TOTAL" row skipped.

---

*Harbor & Pine Co. is fictional. Every order, ticket, campaign, name and email in these files is made up and was generated for this demo.*
