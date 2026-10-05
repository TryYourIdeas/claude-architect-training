# Changes

## Unreleased

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
