import * as SQLite from 'expo-sqlite'
import { MIGRATIONS } from './schema'

let _db: SQLite.SQLiteDatabase | null = null

export function openDatabase(name = 'stashbro.db'): SQLite.SQLiteDatabase {
  if (_db) return _db
  _db = SQLite.openDatabaseSync(name)
  _db.execSync('PRAGMA journal_mode = WAL')
  _db.execSync('PRAGMA foreign_keys = ON')
  // ponytail: migrations re-run every open; additive ALTERs throw once the column
  // already exists (fresh DBs get it from CREATE TABLE). Ignore only that benign error.
  for (const sql of MIGRATIONS) {
    try { _db.execSync(sql) }
    catch (e) { if (!String(e).includes('duplicate column')) throw e }
  }
  return _db
}

// ponytail: reset singleton for tests; not needed in app
export function resetDatabase(): void { _db = null }
