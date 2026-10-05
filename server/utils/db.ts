import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Question } from '../../shared/assembly'

export type Db = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,
  scenario        INTEGER NOT NULL,
  domain          INTEGER NOT NULL,
  task_statement  TEXT NOT NULL,
  stem            TEXT NOT NULL,
  options         TEXT NOT NULL,      -- JSON: [{key,text}]
  correct         TEXT NOT NULL,      -- JSON: ["A"]
  select_count    INTEGER NOT NULL,
  explanation     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
  id            TEXT PRIMARY KEY,
  mode          TEXT NOT NULL CHECK (mode IN ('diagnostic', 'practice')),
  scenarios     TEXT,                 -- JSON: [1,3,4,6] for practice, null for diagnostic
  created_at    INTEGER NOT NULL,
  deadline_at   INTEGER,              -- null = untimed (diagnostic)
  finished_at   INTEGER,
  correct_count INTEGER,
  total_items   INTEGER,
  scaled_score  INTEGER,
  passed        INTEGER
);

CREATE TABLE IF NOT EXISTS test_items (
  test_id     TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id),
  PRIMARY KEY (test_id, position)
);

CREATE TABLE IF NOT EXISTS test_answers (
  test_id     TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id),
  selected    TEXT NOT NULL,          -- JSON: ["B","D"]
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (test_id, question_id)
);
`

interface QuestionRow {
  id: string
  scenario: number
  domain: number
  task_statement: string
  stem: string
  options: string
  correct: string
  select_count: number
  explanation: string
}

export function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    scenario: row.scenario,
    domain: row.domain,
    taskStatement: row.task_statement,
    stem: row.stem,
    options: JSON.parse(row.options),
    correct: JSON.parse(row.correct),
    selectCount: row.select_count,
    explanation: row.explanation,
  }
}

/** Upserts the question bank from the JSON seed file. Existing test history is preserved. */
export function seedQuestions(db: Db, file: string): number {
  if (!existsSync(file)) throw new Error(`Question seed file not found: ${file}`)
  const questions = JSON.parse(readFileSync(file, 'utf8')) as Question[]

  const insert = db.prepare(`
    INSERT INTO questions (id, scenario, domain, task_statement, stem, options, correct, select_count, explanation)
    VALUES (@id, @scenario, @domain, @taskStatement, @stem, @options, @correct, @selectCount, @explanation)
    ON CONFLICT(id) DO UPDATE SET
      scenario = excluded.scenario, domain = excluded.domain, task_statement = excluded.task_statement,
      stem = excluded.stem, options = excluded.options, correct = excluded.correct,
      select_count = excluded.select_count, explanation = excluded.explanation
  `)
  const replaceAll = db.transaction((items: Question[]) => {
    for (const q of items) {
      insert.run({
        id: q.id,
        scenario: q.scenario,
        domain: q.domain,
        taskStatement: q.taskStatement,
        stem: q.stem,
        options: JSON.stringify(q.options),
        correct: JSON.stringify(q.correct),
        selectCount: q.selectCount,
        explanation: q.explanation,
      })
    }
    return items.length
  })
  return replaceAll(questions)
}

/** Opens (creating if needed) a database, applies the schema, and seeds the bank when empty. */
export function openDatabase(path: string, questionsPath: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  const count = (db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }).n
  if (count === 0) seedQuestions(db, questionsPath)
  return db
}

let instance: Db | undefined

export function getDb(): Db {
  if (!instance) {
    instance = openDatabase(
      resolve(process.env.DB_PATH || './data/architect.db'),
      resolve(process.env.QUESTIONS_PATH || './data/questions.json'),
    )
  }
  return instance
}
