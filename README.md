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

## Modes

- **Coaching** — learn one question at a time. Choose *All domains* (questions balanced by blueprint
  weight) or a single domain, and 5–20 questions. Each answer is locked when checked, and the feedback
  shows whether it was right, the correct answer, and the explanation before you move on. Sessions
  are untimed and appear in the summary as a per-domain breakdown, not a scaled score.
- **Diagnostic** — 10 untimed questions across all domains, to find weak areas.
- **Practice exam** — the full simulation described below.

## Coaching chat

Each coaching question has an **Ask about this question** box that calls the Claude Messages API.
Configure it in `.env`:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | API token. Used only on the server and never sent to the browser. |
| `ANTHROPIC_MODEL` | Model id, for example `claude-sonnet-5`. |
| `ANTHROPIC_BASE_URL` | Optional API endpoint. Leave empty for the default. |

The server reads `.env` from the project root at startup, so `npm run dev`, `npm run preview` and
`node .output/server/index.mjs` all pick up the same values. Variables already set in the shell are
not overridden.

Behaviour:

- Before a learner checks their answer, the assistant is not given the correct answer or the
  explanation, so it cannot give the answer away. After checking, the answer and explanation are
  included so the learner can ask why each option is right or wrong.
- Each question has its own conversation. Moving to the next question starts a fresh one.
- Only the last 12 messages are sent to Claude, and each message is limited to 2000 characters.
- **Documentation tools.** The assistant can search and read the official Claude documentation before
  answering. `search_docs` searches an index of 974 English pages from `platform.claude.com/docs` and
  `code.claude.com/docs`. `fetch_docs` reads one page, but only if its URL is in the index, and it does not
  follow redirects. Pages are cached for 15 minutes and truncated to 12,000 characters. The assistant
  names the page it relied on.
- Refresh the index with `node scripts/build-docs-index.mjs`. It reads the `llms.txt` files published by
  both sites and writes `data/claude-docs-index.json`, which is committed.
- If the variables are missing, the chat shows "The chat assistant is not configured" and the rest
  of the coaching screen still works.

## Question counters

Every question keeps three counters, shown on the `/stats` page:

- **Shown** — coaching sessions that presented the question (counted once per session).
- **Right** — correct answers in a row. A wrong answer sets it to 0. When it reaches 3, it is reset to 0
  and the Wrong counter is cleared.
- **Wrong** — wrong answers since the last clearing. Set to 0 after 3 correct answers in a row.

Coaching chooses questions by the highest Wrong count first, then the least Shown. With *All domains*,
this ordering is applied within each domain's blueprint quota, so every domain stays represented.

Counters are updated by coaching sessions only. Diagnostic and practice exam answers do not change them.

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

`data/questions.json` holds 169 items across the 6 scenarios (1: 26, 2: 33, 3: 27, 4: 26, 5: 28, 6: 29),
each tagged with its domain and task statement. Every task statement in the exam guide has at least two
questions, and the guide's sample questions are adapted into the bank. The rest are written from the
guide's knowledge and skills lists, in the same style. They are a study aid, not official exam content.

The practice exam draws 60 items from the 4 scenarios it selects, so each attempt varies. Adding questions to the JSON file and re-running `npm run db:seed` expands it. Every item needs
`selectCount` equal to the length of its `correct` array; `tests/unit/assembly.test.ts` enforces this.

## Architecture

```
pages/           index (start + history), coach/[id] (coaching),
                 tests/[id] (timed exam), reports/[id]
components/      QuestionCard (radio or checkbox by selectCount; can reveal correct options)
server/api/      thin route handlers → server/services/{exam,coach}.ts
server/services/ exam: create, save answer, deadline, grade, report
                 coach: one-at-a-time sessions, locked answers, immediate feedback
server/utils/db  SQLite schema, seeding, getDb() singleton
shared/          exam rules (weights, constraints, scoring) and test assembly — pure, unit-tested
data/            questions.json (seed) and architect.db (created at runtime, git-ignored)
```

SQLite tables: `questions`, `tests` (mode `diagnostic`, `practice` or `coaching`), `test_items` (fixed
order per session), `test_answers`. Reseeding upserts questions, so history survives a reseed. Databases
created by earlier versions are migrated automatically on open.

## Not yet done

- No authentication: the app is single-user and local. Attempts from every visitor share one database.
- No Docker packaging yet, although the workspace conventions call for it.
- Exam-day features (confirmation of the non-disclosure agreement, accommodations) are out of scope.
