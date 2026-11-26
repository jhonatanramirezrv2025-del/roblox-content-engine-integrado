
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const dataDirectory = path.join(projectRoot, 'data');

mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, 'production.db');

const db = new DatabaseSync(databasePath);

db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS productions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        script TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft'
            CHECK (status IN (
                'draft',
                'processing',
                'completed',
                'failed',
                'approved'
            )),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_assets (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (production_id)
            REFERENCES productions(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS production_events (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (production_id)
            REFERENCES productions(id)
            ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_productions_status
        ON productions(status);

    CREATE INDEX IF NOT EXISTS idx_assets_production
        ON production_assets(production_id);

    CREATE INDEX IF NOT EXISTS idx_events_production
        ON production_events(production_id);
`);

export default db;
