import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) throw new Error('DB not initialized — call openDb() first')
  return _db
}

export function openDb(dataDir: string): Database.Database {
  fs.mkdirSync(path.join(dataDir, 'photos'), { recursive: true })

  const db = new Database(path.join(dataDir, 'tenon.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db, dataDir)
  _db = db
  return db
}

// §16.2: forward-only runner. Reads PRAGMA user_version, executes each pending
// SQL file inside a transaction, updates the version. Failures roll back and
// propagate — systemd will hold the previous release.
function runMigrations(db: Database.Database, dataDir: string): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number
  // In the production bundle (dist/), migrations are copied alongside index.js.
  // In dev (tsx, __dirname = src/), they live one level up. Try both.
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '../migrations'),
  ]
  const migrationsDir = candidates.find(p => fs.existsSync(p)) ?? candidates[0]

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort()

  const pending = files.filter(f => parseInt(f.slice(0, 3), 10) > currentVersion)
  if (pending.length === 0) return

  // VACUUM INTO backup once before the first pending migration (§16.2)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(dataDir, `pre-migrate-${ts}.db`)
  db.exec(`VACUUM INTO '${backupPath}'`)

  for (const file of pending) {
    const version = parseInt(file.slice(0, 3), 10)
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const run = db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${version}`)
    })
    run()
  }
}
