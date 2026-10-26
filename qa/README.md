# Sthara School OS — test pack

End-to-end and regression testing for the whole platform, kept **outside the app**. It reads the
app’s source (to stay in step with it) and drives the running app. It never changes either.

## The documents (Oracle AIM)

Built into `workbooks/` by `npm run docs`, checked by `npm run verify`:

| Workbook | What it is |
|---|---|
| `Sthara_BR030_Solution_Matrix.xlsx` | 143 requirements by business process: where each lives (screen, API, data, permission), fit/gap, and which scripts, scenarios, UAT and automated tests prove it. Plus role × permission, menu by role, API and screen inventories, all 305 automated tests. |
| `Sthara_TE040_System_Test_Scripts.xlsx` | 123 system test scripts (420 steps) in 24 module sheets, the TE.010 strategy, a script index whose status rolls up from the steps, and a summary. |
| `Sthara_TE050_Integration_Test_Scripts.xlsx` | 18 end-to-end business scenarios (107 steps) across roles and modules. |
| `Sthara_TE130_UAT_Scripts.xlsx` | UAT by role (operator, leadership, finance, admissions, HR and scheduling, wellbeing and DPDP, teacher, student, parent), the end-to-end scenarios, and sponsor sign-off. |

Every workbook has a Defect Log pre-filled with what the probe found (DEF-001 … OBS-010).
Testers fill only the pale yellow cells. To change a script, edit `catalog/` and run `npm run docs`.

## Setup

```bash
cd "sthara app/sthara-qa"
npm install
```

The pack lives in the app's repo (`qa/`) and tests the app around it; set `STHARA_APP_DIR` to test another checkout. Browser tests use your
installed Google Chrome (no download); `E2E_BROWSER=chromium` uses Playwright’s own.

## Runs in the ops console

Every `bash run-regression.sh` ends by uploading the run to **Platform Manager > Quality**: each stage's result and time,
the test counts, the failing tests, and the files it wrote (the five workbooks, JUnit and Playwright results, stage logs).
To switch it on for a machine, create an upload token there (director or engineer), then add to `qa/e2e.env`:

```
QA_UPLOAD_URL=https://www.sthara.in
QA_UPLOAD_TOKEN=sqa_...
```

A token can only upload runs. Results are kept for good; files for 90 days unless the run is pinned. Uploading never
changes the run's result. (A protected Vercel preview also needs `VERCEL_OIDC_TOKEN` from `vercel env pull`.)

## Run

```bash
bash run-regression.sh           # everything that needs no accounts (≈5 min)
npm run unit                      # regression unit tests (proxy, RBAC matrix, limits, tutor, WhatsApp, accounts, API guards)
npm run check                     # traceability: every requirement tested, every reference real
npm run e2e:local                 # sign-in, routing, headers, and the API gate sweep over every route
npm run e2e:demo                  # local demo mode, every portal page (slow; needs a quiet machine)
npm run e2e:prod                  # signed-in, read-only sweep of the test school (needs e2e.env)
npm run e2e:journeys              # end-to-end journeys that write records (test school only)
npm run e2e:visual                # each role's shell and home (desktop, tablet, phone) against approved images
npm run report                    # open the last Playwright report
```

## The test school (production)

1. In the Platform Manager, create a school whose **name contains TEST** (e.g. "QA Test School").
   The automation refuses to type a password into any school whose name doesn’t match
   `E2E_SCHOOL_NAME_PATTERN`.
2. Set it up as in TE.050 SIT-01: classes 10-A/10-B and Grade 6, subjects, a teacher who is class
   teacher of 10-A, a student in 10-A, their parent, and (optionally) a cashier-only office account.
3. `cp e2e.env.example e2e.env` and fill in the accounts. `e2e.env` is gitignored.
4. `npm run e2e:prod`, then, when you’re ready for records to be written, `npm run e2e:journeys`.

Every record a journey writes carries the run id (`E2E-yyyymmddhhmm`), so test data is easy to find.
No journey calls the AI (quizzes and typed homework are marked without it).

## What is where

```
catalog/        requirements, TE.040 scripts, TE.050 scenarios, defects (the source of the workbooks)
e2e/public      sign-in, routing, not-found, headers, phone layout
e2e/api         the API gate sweep (every route, found from the source) and the open endpoints
e2e/demo        local demo mode walk of every portal menu page
e2e/prod        test-school sign-in, every page per role, cross-role access, sessions
e2e/journeys    J01 leave · J02 parent→office message · J03 admissions · J04 homework→grade→parent
                J05 quiz marked instantly · J06 register → family calendar
regression/unit unit regression tests against the app’s modules (read-only imports)
tools/          inventory (reads the app), check-catalog, build-workbooks, verify-workbooks
```

## Known limits

- In local development, Admin and Teacher render demo portals, so their real pages are tested
  against the deployed test school (OBS-010).
- The app’s own `tests/*.spec.ts` are obsolete and were left untouched (DEBT-007).
- The journeys were written against the screens on `main @ 99e7dfe` and haven’t yet run against a
  live school; the first run may need a label adjusted.
