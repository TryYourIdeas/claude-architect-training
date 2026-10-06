# Changes

## Unreleased

- Answer options are shuffled so correct answers are spread across A–D (B was correct for 133 of 152 single-answer questions). The database re-syncs the bank on every open, so existing databases pick up the change.

- Chat assistant can search and read the Claude Platform and Claude Code documentation (`search_docs`, `fetch_docs`), limited to a committed index of 974 pages generated from the published `llms.txt` files.
- The production server now loads `.env` at startup, so the chat settings work with `npm run preview` and the built server. The chat error names any missing variable.

- Scenario context (name and description from the exam guide) shown above each coaching and exam question.

- Coaching chat: a per-question assistant backed by the Claude Messages API, configured from `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `ANTHROPIC_BASE_URL`. It withholds the answer until the learner has answered.

- Question bank expanded to 169 items, with at least two questions for every exam-guide task statement, in the style of the guide's sample questions.

- Per-question counters (Shown, Right, Wrong) with the clearing rules, persisted in SQLite and shown on `/stats`.
- Coaching selects by highest Wrong count, then least Shown, within each domain's quota.

- Coaching mode: one question at a time, balanced across domains or focused on one, with immediate
  feedback (verdict, correct answer, explanation) locked in per question.
- Database migration that rebuilds the `tests` table to allow the `coaching` mode.

- Initial scaffold of the Nuxt 4 app with SQLite storage.
- Question bank: 90 items (6 scenarios × 15) with domain and task-statement tags.
- Diagnostic (10 items) and practice exam (60 items, 4 of 6 scenarios, 120-minute server-enforced timer, pass at 720).
- Reports with scaled score, pass/fail, per-domain percentages and per-item explanations.
- Tests: Vitest unit and service tests, Testing Library component tests, Playwright UI flows.
