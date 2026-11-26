
import { randomUUID } from 'node:crypto';
import db from './database.js';

import {
    createProductionWorkspace,
    deleteProductionWorkspace
} from './production-files.js';

// ======================================================
// CREAR PRODUCCIÓN
// ======================================================

export function createProduction({
    title,
    description = '',
    script
}) {
    if (typeof title !== 'string' || !title.trim()) {
        throw new Error('El título es obligatorio');
    }

    if (typeof script !== 'string' || !script.trim()) {
        throw new Error('El guion es obligatorio');
    }

    const cleanTitle = title.trim();
    const cleanDescription = String(description ?? '').trim();
    const cleanScript = script.trim();

    const id = randomUUID();

    const workspace = createProductionWorkspace({
        id,
        title: cleanTitle,
        script: cleanScript
    });

    try {
        db.exec('BEGIN');

        db.prepare(`
            INSERT INTO productions (
                id,
                title,
                description,
                script
            )
            VALUES (?, ?, ?, ?)
        `).run(
            id,
            cleanTitle,
            cleanDescription,
            cleanScript
        );

        db.prepare(`
            INSERT INTO production_assets (
                id,
                production_id,
                asset_type,
                file_path
            )
            VALUES (?, ?, ?, ?)
        `).run(
            randomUUID(),
            id,
            'script',
            workspace.relativeScriptPath
        );

        db.prepare(`
            INSERT INTO production_events (
                id,
                production_id,
                event_type,
                message
            )
            VALUES (?, ?, ?, ?)
        `).run(
            randomUUID(),
            id,
            'created',
            'Producción creada y espacio de trabajo preparado'
        );

        db.exec('COMMIT');

        return getProduction(id);

    } catch (error) {
        db.exec('ROLLBACK');

        try {
            deleteProductionWorkspace(id);
        } catch (cleanupError) {
            console.error(
                'Error limpiando espacio de trabajo:',
                cleanupError
            );
        }

        throw error;
    }
}

// ======================================================
// CONSULTAR PRODUCCIÓN
// ======================================================

export function getProduction(id) {
    return db.prepare(`
        SELECT *
        FROM productions
        WHERE id = ?
    `).get(id) ?? null;
}

// ======================================================
// LISTAR PRODUCCIONES
// ======================================================

export function listProductions() {
    return db.prepare(`
        SELECT
            id,
            title,
            description,
            status,
            created_at,
            updated_at
        FROM productions
        ORDER BY created_at DESC
    `).all();
}

// ======================================================
// REGISTRAR RECURSO DE PRODUCCIÓN
// ======================================================

export function registerProductionAsset(
    productionId,
    assetType,
    filePath
) {
    if (!getProduction(productionId)) {
        throw new Error('Producción no encontrada');
    }

    if (
        typeof assetType !== 'string' ||
        !assetType.trim()
    ) {
        throw new Error('El tipo de recurso es obligatorio');
    }

    if (
        typeof filePath !== 'string' ||
        !filePath.trim()
    ) {
        throw new Error('La ruta del recurso es obligatoria');
    }

    const cleanType = assetType.trim();
    const cleanPath = filePath.trim();

    // Evitar duplicados: un mismo recurso y ruta
    // debe conservar el mismo registro.
    const existingAsset = db.prepare(`
        SELECT id
        FROM production_assets
        WHERE production_id = ?
        AND asset_type = ?
        AND file_path = ?
    `).get(
        productionId,
        cleanType,
        cleanPath
    );

    if (existingAsset) {
        db.prepare(`
            UPDATE production_assets
            SET file_path = ?
            WHERE id = ?
        `).run(
            cleanPath,
            existingAsset.id
        );

        return db.prepare(`
            SELECT *
            FROM production_assets
            WHERE id = ?
        `).get(existingAsset.id);
    }

    const id = randomUUID();

    db.prepare(`
        INSERT INTO production_assets (
            id,
            production_id,
            asset_type,
            file_path
        )
        VALUES (?, ?, ?, ?)
    `).run(
        id,
        productionId,
        cleanType,
        cleanPath
    );

    return db.prepare(`
        SELECT *
        FROM production_assets
        WHERE id = ?
    `).get(id);
}

// ======================================================
// CONSULTAR RECURSOS DE PRODUCCIÓN
// ======================================================

export function getProductionAssets(productionId) {
    if (!getProduction(productionId)) {
        throw new Error('Producción no encontrada');
    }

    return db.prepare(`
        SELECT *
        FROM production_assets
        WHERE production_id = ?
        ORDER BY created_at ASC
    `).all(productionId);
}

// ======================================================
// CONSULTAR EVENTOS
// ======================================================

export function getProductionEvents(productionId) {
    return db.prepare(`
        SELECT *
        FROM production_events
        WHERE production_id = ?
        ORDER BY created_at DESC
    `).all(productionId);
}

// ======================================================
// ACTUALIZAR ESTADO
// ======================================================

export function updateProductionStatus(id, status) {
    const allowedStatuses = [
        'draft',
        'processing',
        'completed',
        'failed',
        'approved'
    ];

    if (!allowedStatuses.includes(status)) {
        throw new Error('Estado de producción no válido');
    }

    const production = getProduction(id);

    if (!production) {
        throw new Error('Producción no encontrada');
    }

    db.prepare(`
        UPDATE productions
        SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, id);

    db.prepare(`
        INSERT INTO production_events (
            id,
            production_id,
            event_type,
            message
        )
        VALUES (?, ?, ?, ?)
    `).run(
        randomUUID(),
        id,
        'status_changed',
        `Estado actualizado a: ${status}`
    );

    return getProduction(id);
}

// ======================================================
// AGREGAR EVENTO
// ======================================================

export function addProductionEvent(id, eventType, message) {
    if (!getProduction(id)) {
        throw new Error('Producción no encontrada');
    }

    db.prepare(`
        INSERT INTO production_events (
            id,
            production_id,
            event_type,
            message
        )
        VALUES (?, ?, ?, ?)
    `).run(
        randomUUID(),
        id,
        eventType,
        message
    );

    return getProductionEvents(id);
}

// ======================================================
// ACTUALIZAR PRODUCCIÓN Y ARCHIVO DEL GUION
// ======================================================

export function updateProduction(id, {
    title,
    description = '',
    script
}) {
    if (typeof title !== 'string' || !title.trim()) {
        throw new Error('El título es obligatorio');
    }

    if (typeof script !== 'string' || !script.trim()) {
        throw new Error('El guion es obligatorio');
    }

    const production = getProduction(id);

    if (!production) {
        throw new Error('Producción no encontrada');
    }

    const cleanTitle = title.trim();
    const cleanDescription = String(description ?? '').trim();
    const cleanScript = script.trim();

    const workspace = createProductionWorkspace({
        id,
        title: cleanTitle,
        script: cleanScript
    });

    db.exec('BEGIN');

    try {
        db.prepare(`
            UPDATE productions
            SET
                title = ?,
                description = ?,
                script = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            cleanTitle,
            cleanDescription,
            cleanScript,
            id
        );

        const existingAsset = db.prepare(`
            SELECT id
            FROM production_assets
            WHERE production_id = ?
            AND asset_type = ?
        `).get(id, 'script');

        if (existingAsset) {
            db.prepare(`
                UPDATE production_assets
                SET file_path = ?
                WHERE id = ?
            `).run(
                workspace.relativeScriptPath,
                existingAsset.id
            );

        } else {
            db.prepare(`
                INSERT INTO production_assets (
                    id,
                    production_id,
                    asset_type,
                    file_path
                )
                VALUES (?, ?, ?, ?)
            `).run(
                randomUUID(),
                id,
                'script',
                workspace.relativeScriptPath
            );
        }

        db.prepare(`
            INSERT INTO production_events (
                id,
                production_id,
                event_type,
                message
            )
            VALUES (?, ?, ?, ?)
        `).run(
            randomUUID(),
            id,
            'updated',
            'Producción y archivo de guion actualizados'
        );

        db.exec('COMMIT');

        return getProduction(id);

    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

// ======================================================
// ELIMINAR PRODUCCIÓN Y ESPACIO DE TRABAJO
// ======================================================

export function deleteProduction(id) {
    const production = getProduction(id);

    if (!production) {
        throw new Error('Producción no encontrada');
    }

    db.prepare(`
        DELETE FROM productions
        WHERE id = ?
    `).run(id);

    let workspaceDeleted = true;

    try {
        deleteProductionWorkspace(id);

    } catch (error) {
        workspaceDeleted = false;

        console.error(
            `No se pudo eliminar el espacio de trabajo ${id}:`,
            error
        );
    }

    return {
        success: true,
        id,
        workspaceDeleted,
        message: workspaceDeleted
            ? 'Producción y espacio de trabajo eliminados correctamente'
            : 'Producción eliminada, pero no se pudo limpiar su carpeta'
    };
}
