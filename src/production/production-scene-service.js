
import { randomUUID } from 'node:crypto';
import db from './database.js';
import { getProduction } from './production-service.js';

function runInTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al revertir transacción:', rollbackError);
    }
    throw error;
  }
}

// ======================================================
// DIVISIÓN AUTOMÁTICA DEL GUION
// ======================================================

function splitScriptIntoScenes(script) {
    const paragraphs = String(script ?? '')
        .split(/\r?\n\s*\r?\n/)
        .map(text => text.trim())
        .filter(Boolean);

    const blocks = [];

    for (const paragraph of paragraphs) {
        const sentences =
            paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];

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
// DIRECCIÓN VISUAL AUTOMÁTICA
// ======================================================

const CHARACTER_NAMES = ['Mateo', 'Valeria', 'Lucas', 'Samuel'];

function buildVisualProposal(narrationText) {
    const text = String(narrationText ?? '').trim();

    const characters = CHARACTER_NAMES.filter(name =>
        new RegExp(`\\b${name}\\b`, 'i').test(text)
    );

    const locationRules = [
        { pattern: /\b(bosque|árboles|arboles|sendero)\b/i, value: 'Bosque' },
        { pattern: /\b(cueva|cavern[ae])\b/i, value: 'Cueva' },
        { pattern: /\b(campamento|fogata|refugio)\b/i, value: 'Campamento' },
        { pattern: /\b(lago|río|rio|agua)\b/i, value: 'Zona de agua' },
        { pattern: /\b(casa|habitación|habitacion|interior)\b/i, value: 'Interior' },
        { pattern: /\b(montaña|montana|colina)\b/i, value: 'Zona montañosa' }
    ];

    const location =
        locationRules.find(rule => rule.pattern.test(text))?.value ?? '';

    let shotType = 'Plano medio';

    if (/\b(miedo|rostro|ojos|llora|grita|expresión|expresion)\b/i.test(text)) {
        shotType = 'Primer plano';
    } else if (/\b(bosque|paisaje|horizonte|montaña|montana|lejos)\b/i.test(text)) {
        shotType = 'Plano general';
    }

    let cameraMovement = 'Cámara estática';

    if (/\b(corre|corrió|huyó|huye|persigue|camina|avanza)\b/i.test(text)) {
        cameraMovement = 'Seguimiento de la acción';
    } else if (/\b(descubre|observa|aparece|revela|encuentra)\b/i.test(text)) {
        cameraMovement = 'Acercamiento lento';
    }

    let lighting = '';

    if (/\b(noche|oscuro|oscuridad|medianoche)\b/i.test(text)) {
        lighting = 'Iluminación nocturna';
    } else if (/\b(día|amanecer|mañana|sol|mediodía)\b/i.test(text)) {
        lighting = 'Iluminación natural diurna';
    }

    let mood = '';

    if (/\b(miedo|terror|peligro|amenaza|monstruo|huye)\b/i.test(text)) {
        mood = 'Tensión y suspenso';
    } else if (/\b(triste|llora|pérdida|dolor)\b/i.test(text)) {
        mood = 'Melancólico';
    } else if (/\b(alegría|feliz|celebra|victoria)\b/i.test(text)) {
        mood = 'Esperanzador';
    }

    return {
        characters,
        location,
        action_description: text,
        shot_type: shotType,
        camera_movement: cameraMovement,
        lighting,
        mood,
        visual_description:
            'Propuesta visual basada en la narración. Revisar y ajustar antes de aprobar.'
    };
}

// ======================================================
// UTILIDADES DE ESCENAS
// ======================================================

function parseCharacters(charactersJson) {
    try {
        const parsed = JSON.parse(charactersJson || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function serializeScene(scene) {
    if (!scene) return scene;

    return {
        ...scene,
        characters: parseCharacters(scene.characters_json)
    };
}

function getSceneById(sceneId) {
    return serializeScene(
        db.prepare(`
            SELECT *
            FROM production_scenes
            WHERE id = ?
        `).get(sceneId)
    );
}

function getNextSceneNumber(productionId) {
    const result = db.prepare(`
        SELECT COALESCE(MAX(scene_number), 0) + 1 AS next_number
        FROM production_scenes
        WHERE production_id = ?
    `).get(productionId);

    return result.next_number;
}

function insertSceneEvent(sceneId, eventType, message) {
    const serializedMessage =
        typeof message === 'string' ? message : JSON.stringify(message ?? {});

    db.prepare(`
        INSERT INTO scene_events (
            id, scene_id, event_type, message
        )
        VALUES (?, ?, ?, ?)
    `).run(
        randomUUID(),
        sceneId ?? null,
        eventType,
        serializedMessage
    );
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
            id, production_id, scene_number, title, narration_text,
            visual_description, characters_json, location, action_description,
            shot_type, camera_movement, lighting, mood, visual_status,
            duration_seconds, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 'draft')
    `);

    db.exec('BEGIN');

    try {
        blocks.forEach((block, index) => {
            const id = randomUUID();
            const sceneNumber = index + 1;

            const wordCount = block.split(/\s+/).length;
            const estimatedDuration = Number(
                (wordCount / 2.5).toFixed(2)
            );

            const visual = buildVisualProposal(block);

            insertScene.run(
                id,
                productionId,
                sceneNumber,
                `Escena ${sceneNumber}`,
                block,
                visual.visual_description,
                JSON.stringify(visual.characters),
                visual.location,
                visual.action_description,
                visual.shot_type,
                visual.camera_movement,
                visual.lighting,
                visual.mood,
                estimatedDuration
            );

            insertSceneEvent(
                id,
                'scene_proposed',
                'Escena propuesta automáticamente desde el guion'
            );

            insertSceneEvent(
                id,
                'visual_proposal_generated',
                'Se generó una propuesta inicial de dirección visual'
            );
        });

        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }

    return getProductionScenes(productionId);
}

// ======================================================
// GENERAR DIRECCIÓN VISUAL PARA ESCENAS EXISTENTES
// Solo completa campos vacíos.
// No sobrescribe trabajo manual ni escenas aprobadas.
// ======================================================

export function generateVisualProposals(productionId) {
    if (!getProduction(productionId)) {
        throw new Error('Producción no encontrada');
    }

    const scenes = db.prepare(`
        SELECT *
        FROM production_scenes
        WHERE production_id = ?
        ORDER BY scene_number ASC
    `).all(productionId);

    if (scenes.length === 0) {
        throw new Error('La producción todavía no tiene escenas');
    }

    const updateScene = db.prepare(`
        UPDATE production_scenes
        SET visual_description = ?,
            characters_json = ?,
            location = ?,
            action_description = ?,
            shot_type = ?,
            camera_movement = ?,
            lighting = ?,
            mood = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    db.exec('BEGIN');

    try {
        for (const scene of scenes) {
            if (scene.visual_status === 'approved') {
                continue;
            }

            const proposal = buildVisualProposal(scene.narration_text);

            updateScene.run(
                scene.visual_description || proposal.visual_description,
                scene.characters_json && scene.characters_json !== '[]'
                    ? scene.characters_json
                    : JSON.stringify(proposal.characters),
                scene.location || proposal.location,
                scene.action_description || proposal.action_description,
                scene.shot_type || proposal.shot_type,
                scene.camera_movement || proposal.camera_movement,
                scene.lighting || proposal.lighting,
                scene.mood || proposal.mood,
                scene.id
            );

            insertSceneEvent(
                scene.id,
                'visual_proposal_generated',
                'Se generó una propuesta de dirección visual local'
            );
        }

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
    `).all(productionId).map(serializeScene);
}

// ======================================================
// ACTUALIZAR UNA ESCENA
// Permite editar narrativa y dirección visual.
// ======================================================

export function updateProductionScene(sceneId, changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw new Error('Los cambios de la escena no son válidos');
    }

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
        duration_seconds: 'duration_seconds',
        characters: 'characters_json',
        location: 'location',
        action_description: 'action_description',
        shot_type: 'shot_type',
        camera_movement: 'camera_movement',
        lighting: 'lighting',
        mood: 'mood'
    };

    const textFields = [
        'title',
        'narration_text',
        'visual_description',
        'location',
        'action_description',
        'shot_type',
        'camera_movement',
        'lighting',
        'mood'
    ];

    const visualFields = [
        'visual_description',
        'characters',
        'location',
        'action_description',
        'shot_type',
        'camera_movement',
        'lighting',
        'mood'
    ];

    const updates = [];
    const values = [];

    for (const [field, column] of Object.entries(allowedFields)) {
        if (!Object.hasOwn(changes, field)) {
            continue;
        }

        const value = changes[field];

        if (field === 'characters') {
            if (
                !Array.isArray(value) ||
                !value.every(item => typeof item === 'string')
            ) {
                throw new Error(
                    'Los personajes deben enviarse como un arreglo de texto'
                );
            }

            const cleanCharacters = [...new Set(
                value
                    .map(character => character.trim())
                    .filter(Boolean)
            )];

            values.push(JSON.stringify(cleanCharacters));

        } else if (textFields.includes(field)) {
            if (typeof value !== 'string') {
                throw new Error(`El campo ${field} debe ser texto`);
            }

            if (field === 'title' && !value.trim()) {
                throw new Error('El título no puede estar vacío');
            }

            values.push(value.trim());

        } else if (field === 'duration_seconds') {
            const duration = Number(value);

            if (!Number.isFinite(duration) || duration < 0) {
                throw new Error(
                    'La duración debe ser un número positivo'
                );
            }

            values.push(duration);
        }

        updates.push(`${column} = ?`);
    }

    if (updates.length === 0) {
        throw new Error('No hay campos válidos para actualizar');
    }

    // Si cambia la dirección visual, vuelve a borrador.
    if (visualFields.some(field => Object.hasOwn(changes, field))) {
        updates.push("visual_status = 'draft'");
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(sceneId);

    db.prepare(`
        UPDATE production_scenes
        SET ${updates.join(', ')}
        WHERE id = ?
    `).run(...values);

    insertSceneEvent(
        sceneId,
        'scene_updated',
        'Escena actualizada'
    );

    return getSceneById(sceneId);
}

// ======================================================
// CAMBIAR ESTADO DE UNA ESCENA
// Estado narrativo independiente.
// ======================================================

const ALLOWED_STATUSES = [
    'draft',
    'ready',
    'approved',
    'rejected'
];

export function updateSceneStatus(sceneId, status) {
    if (!ALLOWED_STATUSES.includes(status)) {
        throw new Error('Estado de escena no válido');
    }

    const scene = db.prepare(`
        SELECT id
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);

    if (!scene) {
        throw new Error('Escena no encontrada');
    }

    db.prepare(`
        UPDATE production_scenes
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, sceneId);

    insertSceneEvent(
        sceneId,
        'status_changed',
        `Estado narrativo actualizado a: ${status}`
    );

    return getSceneById(sceneId);
}

// ======================================================
// CAMBIAR ESTADO DE DIRECCIÓN VISUAL
// Estado visual independiente.
// ======================================================

export function updateVisualStatus(sceneId, status) {
    if (!ALLOWED_STATUSES.includes(status)) {
        throw new Error('Estado de dirección visual no válido');
    }

    const scene = db.prepare(`
        SELECT id
        FROM production_scenes
        WHERE id = ?
    `).get(sceneId);

    if (!scene) {
        throw new Error('Escena no encontrada');
    }

    db.prepare(`
        UPDATE production_scenes
        SET visual_status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(status, sceneId);

    insertSceneEvent(
        sceneId,
        'visual_status_changed',
        `Estado de dirección visual actualizado a: ${status}`
    );

    return getSceneById(sceneId);
}

// ======================================================
// REORDENAR ESCENAS
// ======================================================

export function reorderProductionScenes(productionId, sceneIds) {
  if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
    throw new Error('Debes proporcionar el orden de las escenas.');
  }

  const scenes = db.prepare(`
    SELECT id
    FROM production_scenes
    WHERE production_id = ?
    ORDER BY scene_number ASC
  `).all(productionId);

  if (scenes.length !== sceneIds.length) {
    throw new Error('La lista debe incluir todas las escenas de la producción.');
  }

  const existingIds = new Set(scenes.map((scene) => scene.id));

  if (
    new Set(sceneIds).size !== sceneIds.length ||
    sceneIds.some((id) => !existingIds.has(id))
  ) {
    throw new Error('El orden contiene escenas duplicadas o inválidas.');
  }

  runInTransaction(() => {
    saveSceneOrder(productionId, sceneIds);
    // scene_events.scene_id es NOT NULL; registra el evento en la primera
    // escena del nuevo orden y conserva el detalle completo en el mensaje.
    insertSceneEvent(sceneIds[0], 'scenes_reordered', {
      production_id: productionId,
      scene_ids: sceneIds
    });
  });

  return getProductionScenes(productionId);
}

// ======================================================
// GUARDAR ORDEN DE ESCENAS
// Se llama dentro de una transacción.
// ======================================================

function saveSceneOrder(productionId, sceneIds) {
  const current = db.prepare(`
    SELECT COALESCE(MAX(scene_number), 0) AS max_number
    FROM production_scenes
    WHERE production_id = ?
  `).get(productionId);

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM production_scenes
    WHERE production_id = ?
  `).get(productionId).total;

  if (sceneIds.length !== total) {
    throw new Error('No se pudo reorganizar: la lista no coincide con las escenas existentes.');
  }

  const uniqueIds = new Set(sceneIds);

  if (uniqueIds.size !== sceneIds.length) {
    throw new Error('No se pudo reorganizar: hay identificadores de escena repetidos.');
  }

  const temporaryOffset = Math.max(
    1000,
    current.max_number + total + 1000
  );

  db.prepare(`
    UPDATE production_scenes
    SET scene_number = scene_number + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE production_id = ?
  `).run(temporaryOffset, productionId);

  const update = db.prepare(`
    UPDATE production_scenes
    SET scene_number = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND production_id = ?
  `);

  sceneIds.forEach((sceneId, index) => {
    const result = update.run(index + 1, sceneId, productionId);

    if (Number(result.changes) !== 1) {
      throw new Error(
        `No se pudo actualizar el orden de la escena ${sceneId}.`
      );
    }
  });
}

// ======================================================
// DIVIDIR UNA ESCENA
// La nueva escena queda inmediatamente después de la original.
// ======================================================

export function splitProductionScene(sceneId, firstText, secondText) {
  if (!firstText?.trim() || !secondText?.trim()) {
    throw new Error('Los dos fragmentos deben contener texto.');
  }

  const scene = getSceneById(sceneId);

  if (!scene) {
    throw new Error('No se encontró la escena.');
  }

  const firstDuration = Math.max(
    1,
    Math.round(
      scene.duration_seconds *
      (firstText.trim().length /
        (firstText.trim().length + secondText.trim().length))
    )
  );

  const secondDuration = Math.max(
    1,
    scene.duration_seconds - firstDuration
  );

  const newSceneId = randomUUID();

  runInTransaction(() => {
    db.prepare(`
      UPDATE production_scenes
      SET narration_text = ?,
          duration_seconds = ?,
          status = 'draft',
          visual_status = 'draft',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(firstText.trim(), firstDuration, sceneId);

    db.prepare(`
      INSERT INTO production_scenes (
        id,
        production_id,
        scene_number,
        title,
        narration_text,
        visual_description,
        characters_json,
        location,
        action_description,
        shot_type,
        camera_movement,
        lighting,
        mood,
        visual_status,
        duration_seconds,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 'draft')
    `).run(
      newSceneId,
      scene.production_id,
      getNextSceneNumber(scene.production_id),
      `${scene.title} (continuación)`,
      secondText.trim(),
      scene.visual_description || '',
      JSON.stringify(scene.characters || []),
      scene.location || '',
      scene.action_description || '',
      scene.shot_type || '',
      scene.camera_movement || '',
      scene.lighting || '',
      scene.mood || '',
      secondDuration
    );

    // La nueva escena ya está incluida en la consulta.
    // La retiramos temporalmente para insertarla después de la original.
    const sceneIds = db.prepare(`
      SELECT id
      FROM production_scenes
      WHERE production_id = ?
      ORDER BY scene_number ASC
    `).all(scene.production_id).map((item) => item.id);

    const newSceneIndex = sceneIds.indexOf(newSceneId);

    if (newSceneIndex !== -1) {
      sceneIds.splice(newSceneIndex, 1);
    }

    const originalIndex = sceneIds.indexOf(sceneId);

    if (originalIndex === -1) {
      throw new Error('No se encontró la escena original para dividir.');
    }

    sceneIds.splice(originalIndex + 1, 0, newSceneId);

    // Una sola reorganización dentro de la transacción.
    saveSceneOrder(scene.production_id, sceneIds);

    insertSceneEvent(
      sceneId,
      'scene_split',
      {
        new_scene_id: newSceneId,
        first_text: firstText.trim(),
        second_text: secondText.trim()
      }
    );

    insertSceneEvent(
      newSceneId,
      'scene_created_from_split',
      { original_scene_id: sceneId }
    );
  });

  return getProductionScenes(scene.production_id);
}

// ======================================================
// UNIR DOS ESCENAS
// ======================================================

export function mergeProductionScenes(firstSceneId, secondSceneId) {
  const firstScene = getSceneById(firstSceneId);
  const secondScene = getSceneById(secondSceneId);

  if (!firstScene || !secondScene) {
    throw new Error('No se encontraron las dos escenas.');
  }

  if (firstScene.production_id !== secondScene.production_id) {
    throw new Error('Las escenas deben pertenecer a la misma producción.');
  }

  const orderedScenes = db.prepare(`
    SELECT id
    FROM production_scenes
    WHERE production_id = ?
    ORDER BY scene_number ASC
  `).all(firstScene.production_id);

  const firstIndex = orderedScenes.findIndex(
    (scene) => scene.id === firstSceneId
  );

  if (
    firstIndex === -1 ||
    orderedScenes[firstIndex + 1]?.id !== secondSceneId
  ) {
    throw new Error('Solo puedes unir escenas consecutivas en ese orden.');
  }

  const mergedCharacters = [
    ...new Set([
      ...parseCharacters(firstScene.characters_json),
      ...parseCharacters(secondScene.characters_json)
    ])
  ];

  const mergedNarration = [
    firstScene.narration_text,
    secondScene.narration_text
  ].filter(Boolean).join('\n\n');

  const mergedVisualDescription = [
    firstScene.visual_description,
    secondScene.visual_description
  ].filter(Boolean).join('\n\n');

  const mergedAction = [
    firstScene.action_description,
    secondScene.action_description
  ].filter(Boolean).join(' ');

  runInTransaction(() => {
    db.prepare(`
      UPDATE production_scenes
      SET narration_text = ?,
          visual_description = ?,
          characters_json = ?,
          action_description = ?,
          duration_seconds = ?,
          status = 'draft',
          visual_status = 'draft',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      mergedNarration,
      mergedVisualDescription,
      JSON.stringify(mergedCharacters),
      mergedAction,
      firstScene.duration_seconds + secondScene.duration_seconds,
      firstSceneId
    );

    db.prepare(`
      UPDATE scene_assets
      SET scene_id = ?
      WHERE scene_id = ?
    `).run(firstSceneId, secondSceneId);

    db.prepare(`
      UPDATE scene_events
      SET scene_id = ?
      WHERE scene_id = ?
    `).run(firstSceneId, secondSceneId);

    db.prepare(`
      DELETE FROM production_scenes
      WHERE id = ?
    `).run(secondSceneId);

    const remainingIds = db.prepare(`
      SELECT id
      FROM production_scenes
      WHERE production_id = ?
      ORDER BY scene_number ASC
    `).all(firstScene.production_id).map((scene) => scene.id);

    saveSceneOrder(firstScene.production_id, remainingIds);

    insertSceneEvent(
      firstSceneId,
      'scenes_merged',
      { merged_scene_id: secondSceneId }
    );
  });

  return getProductionScenes(firstScene.production_id);
}

// ======================================================
// DUPLICAR UNA ESCENA
// La copia se agrega al final de la producción.
// No llama a saveSceneOrder.
// ======================================================

export function duplicateProductionScene(sceneId) {
  const scene = getSceneById(sceneId);

  if (!scene) {
    throw new Error('No se encontró la escena.');
  }

  const newSceneId = randomUUID();

  runInTransaction(() => {
    db.prepare(`
      INSERT INTO production_scenes (
        id,
        production_id,
        scene_number,
        title,
        narration_text,
        visual_description,
        characters_json,
        location,
        action_description,
        shot_type,
        camera_movement,
        lighting,
        mood,
        visual_status,
        duration_seconds,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 'draft')
    `).run(
      newSceneId,
      scene.production_id,
      getNextSceneNumber(scene.production_id),
      `${scene.title} (copia)`,
      scene.narration_text,
      scene.visual_description || '',
      JSON.stringify(scene.characters || []),
      scene.location || '',
      scene.action_description || '',
      scene.shot_type || '',
      scene.camera_movement || '',
      scene.lighting || '',
      scene.mood || '',
      scene.duration_seconds
    );

    // Copiar los recursos asociados a la escena original.
    const assets = db.prepare(`
      SELECT *
      FROM scene_assets
      WHERE scene_id = ?
    `).all(sceneId);

    const insertAsset = db.prepare(`
      INSERT INTO scene_assets (
        id,
        scene_id,
        asset_type,
        file_path,
        start_seconds,
        end_seconds,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const asset of assets) {
      insertAsset.run(
        randomUUID(),
        newSceneId,
        asset.asset_type,
        asset.file_path,
        asset.start_seconds,
        asset.end_seconds,
        asset.metadata_json
      );
    }

    // La escena se crea al final. No se reorganiza la lista.
    insertSceneEvent(
      newSceneId,
      'scene_duplicated',
      { original_scene_id: sceneId }
    );
  });

  return getProductionScenes(scene.production_id);
}
