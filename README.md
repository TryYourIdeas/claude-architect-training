# Claude Architect Training

Practice app for the **Claude Certified Architect – Foundations (CCAR-F)** exam. It offers a
10-question diagnostic across all five domains and a full practice exam built to the rules in the
exam guide (`ClaudeArchitectExamGuide.pdf` in `whatsap-agent/`).

Stack: Nuxt 4, Vue 3, TypeScript, SQLite (`better-sqlite3`), Vitest + Testing Library, Playwright.

## Quick start

```bash
npm install
cp .env.example .env        # DB_PATH and QUESTIONS_PATH
npm run db:seed             # optional: the server seeds an empty database on first use
npm run dev                 # http://localhost:3000
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build and preview |
| `npm run db:seed` | Upserts `data/questions.json` into the SQLite database |
| `npm test` | Vitest: exam rules, test assembly, bank integrity, service lifecycle, component tests |
| `npm run test:e2e` | Playwright UI flows (starts the dev server against `data/e2e.db`) |
| `npx nuxi typecheck` | Strict type check of app, server and shared code |

## Exam rules modelled

| Rule | Practice exam | Diagnostic |
|---|---|---|
| Items | 60 | 10 |
| Format | Multiple choice and multiple response; each item states how many to select | same |
| Scenarios | 4 of 6 drawn at random | not scenario-based |
| Domain mix | Blueprint weights 27 / 18 / 20 / 20 / 15 (largest-remainder allocation) | same |
| Time | 120 minutes, enforced by the server; expired tests are scored automatically | untimed |
| Pass | Scaled score ≥ 720 on 100–1000 | no pass mark |
| Report | Scaled score, pass/fail, percent by domain, per-item explanations | same, without pass/fail |

Assumptions where the guide is silent:

- **Multiple response** is all-or-nothing: the selection must match the correct set exactly.
- **Scaled score** is a linear mapping of percent correct onto 100–1000. The real exam uses a
  standard-setting study and equating that is not published, so treat the number as an approximation.
  The report says so.
- **Answers are never sent to the browser** until the test is submitted. The server enforces the
  deadline and rejects answers that are late, unknown, or over the selection limit.

## Question bank

`data/questions.json` holds 90 items: 6 scenarios × 15 questions, each tagged with its domain and
task statement. Some sample questions from the guide are adapted into the bank. The rest are written
from the task statements. They are a study aid, not official exam content.

The practice exam uses all 60 items from the 4 scenarios it draws, so the bank size limits variety.
Adding questions to the JSON file and re-running `npm run db:seed` expands it. Every item needs
`selectCount` equal to the length of its `correct` array; `tests/unit/assembly.test.ts` enforces this.

## Architecture

```
pages/           index (start + history), tests/[id] (timed test), reports/[id]
components/      QuestionCard (radio or checkbox, based on selectCount)
server/api/      thin route handlers → server/services/exam.ts
server/services/ lifecycle: create, save answer, deadline, grade, report
server/utils/db  SQLite schema, seeding, getDb() singleton
shared/          exam rules (weights, constraints, scoring) and test assembly — pure, unit-tested
data/            questions.json (seed) and architect.db (created at runtime, git-ignored)
```

SQLite tables: `questions`, `tests`, `test_items` (fixed order per attempt), `test_answers`.
Reseeding upserts questions, so attempt history survives a reseed.

## Not yet done

- No authentication: the app is single-user and local. Attempts from every visitor share one database.
- No Docker packaging yet, although the workspace conventions call for it.
- Exam-day features (confirmation of the non-disclosure agreement, accommodations) are out of scope.
