
import db from './database.js';

// ======================================================
// SCHEMA DEL SCENE MANAGER
// Migración aditiva: conserva los datos existentes.
// ======================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS production_scenes (
        id TEXT PRIMARY KEY,
        production_id TEXT NOT NULL,
        scene_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        narration_text TEXT NOT NULL DEFAULT '',

        -- Dirección visual
        visual_description TEXT NOT NULL DEFAULT '',
        characters_json TEXT NOT NULL DEFAULT '[]',
        location TEXT NOT NULL DEFAULT '',
        action_description TEXT NOT NULL DEFAULT '',
        shot_type TEXT NOT NULL DEFAULT '',
        camera_movement TEXT NOT NULL DEFAULT '',
        lighting TEXT NOT NULL DEFAULT '',
        mood TEXT NOT NULL DEFAULT '',
        visual_status TEXT NOT NULL DEFAULT 'draft'
            CHECK (
                visual_status IN (
                    'draft',
                    'ready',
                    'approved',
                    'rejected'
                )
            ),

        duration_seconds REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft'
            CHECK (
                status IN (
                    'draft',
                    'ready',
                    'approved',
                    'rejected'
                )
            ),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (production_id)
            REFERENCES productions(id)
            ON DELETE CASCADE,

        UNIQUE (production_id, scene_number)
    );

    CREATE TABLE IF NOT EXISTS scene_assets (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_seconds REAL,
        end_seconds REAL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (scene_id)
            REFERENCES production_scenes(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scene_events (
        id TEXT PRIMARY KEY,
        scene_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (scene_id)
            REFERENCES production_scenes(id)
            ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_scenes_production
        ON production_scenes(production_id, scene_number);

    CREATE INDEX IF NOT EXISTS idx_scenes_status
        ON production_scenes(status);

    CREATE INDEX IF NOT EXISTS idx_scene_assets_scene
        ON scene_assets(scene_id);

    CREATE INDEX IF NOT EXISTS idx_scene_events_scene
        ON scene_events(scene_id);
`);

// ======================================================
// MIGRACIÓN PARA BASES DE DATOS EXISTENTES
// Agrega únicamente las columnas que todavía no existen.
// ======================================================

const newColumns = [
    {
        name: 'characters_json',
        definition: "TEXT NOT NULL DEFAULT '[]'"
    },
    {
        name: 'location',
        definition: "TEXT NOT NULL DEFAULT ''"
    },
    {
        name: 'action_description',
        definition: "TEXT NOT NULL DEFAULT ''"
    },
    {
        name: 'shot_type',
        definition: "TEXT NOT NULL DEFAULT ''"
    },
    {
        name: 'camera_movement',
        definition: "TEXT NOT NULL DEFAULT ''"
    },
    {
        name: 'lighting',
        definition: "TEXT NOT NULL DEFAULT ''"
    },
    {
        name: 'mood',
        definition: "TEXT NOT NULL DEFAULT ''"
    },
    {
        name: 'visual_status',
        definition: `TEXT NOT NULL DEFAULT 'draft'
            CHECK (
                visual_status IN (
                    'draft',
                    'ready',
                    'approved',
                    'rejected'
                )
            )`
    }
];

const existingColumns = db.prepare(
    'PRAGMA table_info(production_scenes)'
).all();

const existingColumnNames = new Set(
    existingColumns.map(column => column.name)
);

db.exec('BEGIN');

try {
    for (const column of newColumns) {
        if (existingColumnNames.has(column.name)) {
            continue;
        }

        db.exec(`
            ALTER TABLE production_scenes
            ADD COLUMN ${column.name} ${column.definition}
        `);
    }

    db.exec('COMMIT');
} catch (error) {
    db.exec('ROLLBACK');
    throw error;
}

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_scenes_visual_status
        ON production_scenes(visual_status);
`);

console.log('Scene Manager: esquema y dirección visual verificados.');
