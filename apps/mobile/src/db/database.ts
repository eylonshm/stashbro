import * as SQLite from 'expo-sqlite'
import { MIGRATIONS } from './schema'

let _db: SQLite.SQLiteDatabase | null = null

export function openDatabase(name = 'stashbro.db'): SQLite.SQLiteDatabase {
  if (_db) return _db
  _db = SQLite.openDatabaseSync(name)
  _db.execSync('PRAGMA journal_mode = WAL')
  _db.execSync('PRAGMA foreign_keys = ON')
  for (const sql of MIGRATIONS) { _db.execSync(sql) }
  return _db
}

// ponytail: reset singleton for tests; not needed in app
export function resetDatabase(): void { _db = null }
