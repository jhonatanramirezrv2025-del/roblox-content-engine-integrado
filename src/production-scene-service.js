
import { randomUUID } from 'node:crypto';
import db from './database.js';
import { getProduction } from './production-service.js';

// ======================================================
// DIVISIÓN AUTOMÁTICA DEL GUION
// Genera propuestas locales, sin servicios externos.
// ======================================================

function splitScriptIntoScenes(script) {
    const paragraphs = script
        .split(/\r?\n\s*\r?\n/)
        .map(text => text.trim())
        .filter(Boolean);

    const blocks = [];

    for (const paragraph of paragraphs) {
        // Si un párrafo es extenso, dividirlo en grupos
        // de dos o tres oraciones para facilitar la edición.
        const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];

        if (sentences.length <= 3) {
            blocks.push(sentences.join(' ').trim());
            continue;
        }

        for (let i = 0; i < sentences.length; i += 3) {
            blocks.push(
                sentences.slice(i, i + 3).join(' ').trim()
            );
        }
    }

    return blocks;
}

// ======================================================
// GENERAR PROPUESTAS DE ESCENAS
// ======================================================

export function createSceneProposals(productionId) {
    const production = getProduction(productionId);

    if (!production) {
        throw new Error('Producción no encontrada');
    }

    const existingScenes = db.prepare(`
        SELECT COUNT(*) AS total
        FROM production_scenes
        WHERE production_id = ?
    `).get(productionId);

    if (existingScenes.total > 0) {
        throw new Error(
            'Esta producción ya tiene escenas. No se generaron duplicados.'
        );
    }

    const blocks = splitScriptIntoScenes(production.script);

    if (blocks.length === 0) {
        throw new Error('El guion no contiene texto para dividir');
    }

    const insertScene = db.prepare(`
        INSERT INTO production_scenes (
            id,
            production_id,
            scene_number,
            title,
            narration_text,
            visual_description,
            duration_seconds,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `);

    const insertEvent = db.prepare(`
        INSERT INTO scene_events (
            id,
            scene_id,
            event_type,
            message
        )
        VALUES (?, ?, ?, ?)
    `);

    const createdIds = [];

    db.exec('BEGIN');

    try {
        blocks.forEach((block, index) => {
            const id = randomUUID();
            const sceneNumber = index + 1;

            // Estimación inicial: 2.5 palabras por segundo.
            const wordCount = block.split(/\s+/).length;
            const estimatedDuration = Number(
                (wordCount / 2.5).toFixed(2)
            );

            insertScene.run(
                id,
                productionId,
                sceneNumber,
                `Escena ${sceneNumber}`,
                block,
                '',
                estimatedDuration
            );

            insertEvent.run(
                randomUUID(),
                id,
                'scene_proposed',
                'Escena propuesta automáticamente desde el guion'
            );

            createdIds.push(id);
        });

        db.exec('COMMIT');

    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    return getProductionScenes(productionId);
}

// ======================================================
// CONSULTAR ESCENAS
// ======================================================

export function getProductionScenes(productionId) {
    if (!getProduction(productionId)) {
        throw new Error('Producción no encontrada');
    }

    return db.prepare(`
        SELECT *
        FROM production_scenes
        WHERE production_id = ?
        ORDER BY scene_number ASC
    `).all(productionId);
}

// ======================================================
// ACTUALIZAR UNA ESCENA
// ======================================================

export function updateProductionScene(sceneId, changes) {
    const scene = db.prepare(`
        SELECT *
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);

    if (!scene) {
        throw new Error('Escena no encontrada');
    }

    const allowedFields = {
        title: 'title',
        narration_text: 'narration_text',
        visual_description: 'visual_description',
        duration_seconds: 'duration_seconds'
    };

    const updates = [];
    const values = [];

    for (const [field, column] of Object.entries(allowedFields)) {
        if (!Object.hasOwn(changes, field)) {
            continue;
        }

        const value = changes[field];

        if (
            ['title', 'narration_text', 'visual_description'].includes(field)
        ) {
            if (typeof value !== 'string') {
                throw new Error(`El campo ${field} debe ser texto`);
            }

            if (field === 'title' && !value.trim()) {
                throw new Error('El título no puede estar vacío');
            }

            values.push(value.trim());

        } else {
            const duration = Number(value);

            if (!Number.isFinite(duration) || duration < 0) {
                throw new Error('La duración debe ser un número positivo');
            }

            values.push(duration);
        }

        updates.push(`${column} = ?`);
    }

    if (updates.length === 0) {
        throw new Error('No hay campos válidos para actualizar');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    values.push(sceneId);

    db.prepare(`
        UPDATE production_scenes
        SET ${updates.join(', ')}
        WHERE id = ?
    `).run(...values);

    db.prepare(`
        INSERT INTO scene_events (
            id, scene_id, event_type, message
        )
        VALUES (?, ?, ?, ?)
    `).run(
        randomUUID(),
        sceneId,
        'scene_updated',
        'Escena actualizada'
    );

    return db.prepare(`
        SELECT *
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);
}

// ======================================================
// CAMBIAR ESTADO DE UNA ESCENA
// ======================================================

export function updateSceneStatus(sceneId, status) {
    const allowedStatuses = [
        'draft',
        'ready',
        'approved',
        'rejected'
    ];

    if (!allowedStatuses.includes(status)) {
        throw new Error('Estado de escena no válido');
    }

    const scene = db.prepare(`
        SELECT *
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);

    if (!scene) {
        throw new Error('Escena no encontrada');
    }

    db.prepare(`
        UPDATE production_scenes
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, sceneId);

    db.prepare(`
        INSERT INTO scene_events (
            id, scene_id, event_type, message
        )
        VALUES (?, ?, ?, ?)
    `).run(
        randomUUID(),
        sceneId,
        'status_changed',
        `Estado actualizado a: ${status}`
    );

    return db.prepare(`
        SELECT *
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);
}

// ======================================================
// REORDENAR ESCENAS
// Recibe todos los IDs en el orden deseado.
// ======================================================

export function reorderProductionScenes(productionId, sceneIds) {
    if (!getProduction(productionId)) {
        throw new Error('Producción no encontrada');
    }

    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
        throw new Error('Debes proporcionar los IDs de las escenas');
    }

    const currentScenes = getProductionScenes(productionId);

    const currentIds = currentScenes
        .map(scene => scene.id)
        .sort();

    const requestedIds = [...sceneIds].sort();

    if (
        currentIds.length !== requestedIds.length ||
        currentIds.some((id, index) => id !== requestedIds[index])
    ) {
        throw new Error(
            'Debes enviar todas las escenas de esta producción, sin duplicados'
        );
    }

    db.exec('BEGIN');

    try {
        const updateOrder = db.prepare(`
            UPDATE production_scenes
            SET scene_number = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND production_id = ?
        `);

        sceneIds.forEach((id, index) => {
            // Posiciones temporales para evitar conflictos
            // con UNIQUE(production_id, scene_number).
            updateOrder.run(
                -(index + 1),
                id,
                productionId
            );
        });

        sceneIds.forEach((id, index) => {
            updateOrder.run(
                index + 1,
                id,
                productionId
            );
        });

        db.exec('COMMIT');

    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    return getProductionScenes(productionId);
}
