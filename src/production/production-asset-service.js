import { randomUUID } from 'node:crypto';
import db from './database.js';

// ======================================================
// MIGRACIONES DEL ASSET MANAGER
// ======================================================

function getColumns(tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all()
        .map(column => column.name);
}

function addColumnIfMissing(tableName, columnName, definition) {
    const columns = getColumns(tableName);

    if (!columns.includes(columnName)) {
        db.exec(
            `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
        );
    }
}

function ensureAssetSchema() {
    const sceneAssetsExists = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        AND name = 'scene_assets'
    `).get();

    if (!sceneAssetsExists) {
        throw new Error(
            'La tabla scene_assets no existe. Comprueba que scene-schema.js se importe antes del servicio de recursos.'
        );
    }

    // Datos adicionales del archivo original.
    addColumnIfMissing('production_assets', 'original_name', 'TEXT');
    addColumnIfMissing('production_assets', 'mime_type', 'TEXT');
    addColumnIfMissing('production_assets', 'file_size', 'INTEGER');
    addColumnIfMissing(
        'production_assets',
        'metadata_json',
        "TEXT NOT NULL DEFAULT '{}'"
    );

    // Relación entre el catálogo y cada escena.
    addColumnIfMissing(
        'scene_assets',
        'asset_id',
        'TEXT REFERENCES production_assets(id) ON DELETE SET NULL'
    );

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_production_assets_production
        ON production_assets(production_id);

        CREATE INDEX IF NOT EXISTS idx_scene_assets_asset_id
        ON scene_assets(asset_id);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_assets_unique_link
        ON scene_assets(scene_id, asset_id)
        WHERE asset_id IS NOT NULL;
    `);
}

ensureAssetSchema();

// ======================================================
// UTILIDADES
// ======================================================

function getProduction(productionId) {
    return db.prepare(`
        SELECT id
        FROM productions
        WHERE id = ?
    `).get(productionId);
}

function getAsset(assetId) {
    return db.prepare(`
        SELECT *
        FROM production_assets
        WHERE id = ?
    `).get(assetId);
}

// ======================================================
// REGISTRAR RECURSO
// ======================================================

export function registerProductionAsset({
    productionId,
    assetType,
    filePath,
    originalName = '',
    mimeType = 'application/octet-stream',
    fileSize = 0,
    metadata = {}
}) {
    if (!getProduction(productionId)) {
        throw new Error('No se encontró la producción.');
    }

    if (!assetType?.trim()) {
        throw new Error('El tipo de recurso es obligatorio.');
    }

    if (!filePath?.trim()) {
        throw new Error('La ruta del archivo es obligatoria.');
    }

    const existing = db.prepare(`
        SELECT id
        FROM production_assets
        WHERE production_id = ?
        AND file_path = ?
    `).get(productionId, filePath);

    const metadataJson = JSON.stringify(metadata ?? {});

    if (existing) {
        db.prepare(`
            UPDATE production_assets
            SET
                asset_type = ?,
                original_name = ?,
                mime_type = ?,
                file_size = ?,
                metadata_json = ?
            WHERE id = ?
        `).run(
            assetType.trim(),
            originalName,
            mimeType,
            fileSize,
            metadataJson,
            existing.id
        );

        return getAsset(existing.id);
    }

    const id = randomUUID();

    db.prepare(`
        INSERT INTO production_assets (
            id,
            production_id,
            asset_type,
            file_path,
            original_name,
            mime_type,
            file_size,
            metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        productionId,
        assetType.trim(),
        filePath,
        originalName,
        mimeType,
        fileSize,
        metadataJson
    );

    return getAsset(id);
}

// ======================================================
// LISTAR RECURSOS DE UNA PRODUCCIÓN
// ======================================================

export function getProductionAssets(productionId) {
    if (!getProduction(productionId)) {
        throw new Error('No se encontró la producción.');
    }

    return db.prepare(`
        SELECT
            pa.*,
            COUNT(sa.id) AS usage_count
        FROM production_assets pa
        LEFT JOIN scene_assets sa
            ON sa.asset_id = pa.id
        WHERE pa.production_id = ?
        GROUP BY pa.id
        ORDER BY pa.created_at DESC
    `).all(productionId);
}

// ======================================================
// ASOCIAR RECURSO A UNA ESCENA
// ======================================================

export function attachAssetToScene({
    assetId,
    sceneId,
    startSeconds = null,
    endSeconds = null,
    metadata = {}
}) {
    const asset = getAsset(assetId);

    if (!asset) {
        throw new Error('No se encontró el recurso.');
    }

    const scene = db.prepare(`
        SELECT id, production_id
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);

    if (!scene) {
        throw new Error('No se encontró la escena.');
    }

    if (scene.production_id !== asset.production_id) {
        throw new Error(
            'El recurso y la escena pertenecen a producciones diferentes.'
        );
    }

    if (
        startSeconds !== null &&
        (!Number.isFinite(startSeconds) || startSeconds < 0)
    ) {
        throw new Error('El tiempo inicial no es válido.');
    }

    if (
        endSeconds !== null &&
        (!Number.isFinite(endSeconds) || endSeconds < 0)
    ) {
        throw new Error('El tiempo final no es válido.');
    }

    if (
        startSeconds !== null &&
        endSeconds !== null &&
        endSeconds <= startSeconds
    ) {
        throw new Error(
            'El tiempo final debe ser mayor que el tiempo inicial.'
        );
    }

    const existing = db.prepare(`
        SELECT *
        FROM scene_assets
        WHERE scene_id = ?
        AND asset_id = ?
    `).get(sceneId, assetId);

    if (existing) {
        return existing;
    }

    const associationId = randomUUID();

    db.prepare(`
        INSERT INTO scene_assets (
            id,
            scene_id,
            asset_id,
            asset_type,
            file_path,
            start_seconds,
            end_seconds,
            metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        associationId,
        sceneId,
        asset.id,
        asset.asset_type,
        asset.file_path,
        startSeconds,
        endSeconds,
        JSON.stringify(metadata ?? {})
    );

    return db.prepare(`
        SELECT *
        FROM scene_assets
        WHERE id = ?
    `).get(associationId);
}

// ======================================================
// LISTAR RECURSOS DE UNA ESCENA
// ======================================================

export function getSceneAssets(sceneId) {
    const scene = db.prepare(`
        SELECT id
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);

    if (!scene) {
        throw new Error('No se encontró la escena.');
    }

    return db.prepare(`
        SELECT
            sa.*,
            pa.original_name,
            pa.mime_type,
            pa.file_size
        FROM scene_assets sa
        LEFT JOIN production_assets pa
            ON pa.id = sa.asset_id
        WHERE sa.scene_id = ?
        ORDER BY sa.created_at ASC
    `).all(sceneId);
}


// ======================================================
// ACTUALIZAR TIEMPOS DE UN RECURSO EN UNA ESCENA
// ======================================================


        export function updateSceneAssetTiming({
            associationId,
            startSeconds,
            endSeconds,
            fadeIn,
            fadeOut
        }) {
            const association = db.prepare(`
                SELECT
                    sa.*,
                    ps.duration_seconds
                FROM scene_assets sa
                INNER JOIN production_scenes ps
                    ON ps.id = sa.scene_id
                WHERE sa.id = ?
            `).get(associationId);

            if (!association) {
                const error = new Error('No se encontró la asociación del recurso.');
                error.statusCode = 404;
                throw error;
            }

            const nextStart = startSeconds ?? association.start_seconds ?? 0;
            const nextEnd = endSeconds ?? association.end_seconds ?? association.duration_seconds;

            if (
                !Number.isFinite(nextStart) ||
                !Number.isFinite(nextEnd) ||
                nextStart < 0 ||
                nextEnd <= nextStart ||
                nextEnd > association.duration_seconds
            ) {
                const error = new Error('Los tiempos del recurso no son válidos.');
                error.statusCode = 400;
                throw error;
            }

            let metadata = {};

            try {
                metadata = JSON.parse(association.metadata_json || '{}');
            } catch {
                metadata = {};
            }

            if (fadeIn !== undefined || fadeOut !== undefined) {
                const nextFadeIn = fadeIn === undefined
                    ? Number(metadata.fadeIn) || 0
                    : Number(fadeIn);

                const nextFadeOut = fadeOut === undefined
                    ? Number(metadata.fadeOut) || 0
                    : Number(fadeOut);

                const clipDuration = nextEnd - nextStart;

                if (
                    !Number.isFinite(nextFadeIn) ||
                    !Number.isFinite(nextFadeOut) ||
                    nextFadeIn < 0 ||
                    nextFadeOut < 0 ||
                    nextFadeIn + nextFadeOut > clipDuration
                ) {
                    const error = new Error(
                        'Los fundidos no pueden superar la duración del recurso.'
                    );
                    error.statusCode = 400;
                    throw error;
                }

                metadata.fadeIn = nextFadeIn;
                metadata.fadeOut = nextFadeOut;
            }

            db.prepare(`
                UPDATE scene_assets
                SET
                    start_seconds = ?,
                    end_seconds = ?,
                    metadata_json = ?
                WHERE id = ?
            `).run(
                nextStart,
                nextEnd,
                JSON.stringify(metadata),
                associationId
            );

            return db.prepare(`
                SELECT *
                FROM scene_assets
                WHERE id = ?
            `).get(associationId);
        }


// ======================================================
// DESASOCIAR RECURSO DE UNA ESCENA
// ======================================================

export function detachAssetFromScene(associationId) {
    const association = db.prepare(`
        SELECT id
        FROM scene_assets
        WHERE id = ?
    `).get(associationId);

    if (!association) {
        throw new Error('No se encontró la asociación del recurso.');
    }

    db.prepare(`
        DELETE FROM scene_assets
        WHERE id = ?
    `).run(associationId);

    return {
        success: true,
        message: 'Recurso desasociado de la escena.'
    };
}

// ======================================================
// ELIMINAR RECURSO DEL CATÁLOGO
// No elimina el archivo físico.
// ======================================================

export function deleteProductionAsset(assetId) {
    const asset = getAsset(assetId);

    if (!asset) {
        throw new Error('No se encontró el recurso.');
    }

    const usage = db.prepare(`
        SELECT COUNT(*) AS total
        FROM scene_assets
        WHERE asset_id = ?
    `).get(assetId);

    if (usage.total > 0) {
        throw new Error(
            `Este recurso todavía está asociado a ${usage.total} escena(s). Desasócialo antes de eliminarlo.`
        );
    }

    db.prepare(`
        DELETE FROM production_assets
        WHERE id = ?
    `).run(assetId);

    return {
        success: true,
        message: 'Recurso eliminado del catálogo. El archivo físico se conserva.'
    };
}