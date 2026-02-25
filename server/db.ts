import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'audioreader.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    file_id      TEXT PRIMARY KEY,
    path         TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  )
`);

export function insertFile(fileId: string, filePath: string, originalName: string): void {
  db.prepare(
    'INSERT INTO files (file_id, path, original_name, created_at) VALUES (?, ?, ?, ?)'
  ).run(fileId, filePath, originalName, Date.now());
}

export function getFile(fileId: string): { path: string; originalName: string } | undefined {
  return db
    .prepare('SELECT path, original_name AS originalName FROM files WHERE file_id = ?')
    .get(fileId) as { path: string; originalName: string } | undefined;
}

export function deleteFile(fileId: string): void {
  db.prepare('DELETE FROM files WHERE file_id = ?').run(fileId);
}

export function getOldFiles(olderThanMs: number): Array<{ fileId: string; path: string }> {
  const cutoff = Date.now() - olderThanMs;
  return db
    .prepare('SELECT file_id AS fileId, path FROM files WHERE created_at < ?')
    .all(cutoff) as Array<{ fileId: string; path: string }>;
}
