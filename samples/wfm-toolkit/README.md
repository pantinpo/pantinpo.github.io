# Customer Care WFM Toolkit

A workforce management workbook for **Harbor & Pine Co.**, an online home-goods retailer in Melbourne with a 25-person care team split between Melbourne and Manila. It turns a call forecast into a staffing plan, tracks the day in real time and checks schedule adherence.

> Harbor & Pine Co. is a fictional company. Every number in this workbook is synthetic.

**Try it online:** [Erlang C staffing calculator](https://pantinpo.github.io/erlang-calculator.html) (the same maths, in the browser)
**Download:** [wfm-toolkit.xlsx](wfm-toolkit.xlsx)

## Open it

- **Google Sheets:** go to *File > Import > Upload*, choose `wfm-toolkit.xlsx`, then *Insert new sheet(s)* or *Replace spreadsheet*.
- **Excel:** open the file directly. It needs Excel 2019 or Microsoft 365, because it uses `MINIFS`.

There are no macros or scripts, so everything is ordinary formulas.

## Tabs

| Tab | What it does |
| --- | --- |
| **Read me** | How the workbook works, the formulas and the colour key. |
| **Staffing Calculator** | Enter the service level target, answer time, AHT, shrinkage, max occupancy and calls per 30-minute interval (the yellow cells). For each interval from 07:00 to 22:00 AEST it works out workload in Erlangs, agents required, expected service level, average speed of answer, occupancy and heads to schedule. It also shows daily totals and a chart. |
| **Intraday RTA** | A real-time snapshot from 15:30 on Monday. Forecast volume and required agents come from the calculator, and actuals are pasted from the phone system (the light blue cells). Volume variance, staffing gap and an On track / Watch / Act status all update on their own. The Action column records what the real-time analyst did, for example moving chat agents to phones or offering overtime. |
| **Adherence** | Adherence and conformance for 20 agents on the same day, with RAG flags and the main exception for each agent. |
| **Calc** | The helper grid behind the calculator. Each row is an interval and each column is a possible agent count from 1 to 60. Each cell is the service level that many agents would reach. |

## The maths

- Workload: `A = calls × AHT ÷ 1800`
- Erlang C: `C = P(N,A) / (P(N,A) + (1 − A/N) × POISSON.DIST(N−1, A, TRUE))`, where `P(N,A) = POISSON.DIST(N, A, FALSE)`
- Service level: `SL = 1 − C × EXP(−(N − A) × T / AHT)`
- Average speed of answer: `ASA = C × AHT / (N − A)`
- Agents required: the smallest `N` that meets the service level target while keeping occupancy (`A / N`) at or below the cap. The calculator finds it with `MINIFS` over the Calc grid.
- Heads to schedule: `ROUNDUP(N / (1 − shrinkage), 0)`

As a check, 100 calls in 30 minutes with a 180-second AHT and an 80/20 target gives 14 agents at 88.8% service level.

## Limits

- Erlang C assumes callers never hang up, so it slightly overstates the agents you need.
- The grid tops out at 60 agents per interval, which is about 280 calls per half hour at the default settings. For more volume, extend the Calc columns.
