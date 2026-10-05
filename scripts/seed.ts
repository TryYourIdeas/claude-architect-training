// Usage: npm run db:seed
// Upserts data/questions.json into the SQLite database at DB_PATH.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { seedQuestions } from '../server/utils/db'

const dbPath = resolve(process.env.DB_PATH || './data/architect.db')
const questionsPath = resolve(process.env.QUESTIONS_PATH || './data/questions.json')

mkdirSync(dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// The schema is created by the server on first use; create it here too so the seed works standalone.
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY, scenario INTEGER NOT NULL, domain INTEGER NOT NULL, task_statement TEXT NOT NULL,
    stem TEXT NOT NULL, options TEXT NOT NULL, correct TEXT NOT NULL, select_count INTEGER NOT NULL, explanation TEXT NOT NULL
  );
`)

const count = seedQuestions(db, questionsPath)
console.log(`Seeded ${count} questions into ${dbPath}`)
db.close()
