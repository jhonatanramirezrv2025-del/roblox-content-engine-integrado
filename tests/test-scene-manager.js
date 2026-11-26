
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import db from '../src/production/database.js';
import '../src/production/scene-schema.js';

import {
    createProduction,
    deleteProduction
} from '../src/production/production-service.js';

import {
    createSceneProposals,
    getProductionScenes,
    splitProductionScene,
    mergeProductionScenes,
    duplicateProductionScene,
    reorderProductionScenes
} from '../src/production/production-scene-service.js';

let productionId = null;

try {
    console.log('\n=== PRUEBAS DEL SCENE MANAGER ===\n');

    // 1. Crear producción temporal
    const production = createProduction({
        title: 'TEST TEMPORAL - Scene Manager',
        description: 'Producción exclusiva para pruebas',
        script: 'Una señal aparece en el bosque. Mateo decide investigar.'
    });

    productionId = production.id;

    console.log('1. Producción temporal creada.');

    // 2. Generar escenas
    let scenes = createSceneProposals(productionId);

    assert.equal(scenes.length, 1);
    console.log('2. Generación automática: OK.');

    const originalSceneId = scenes[0].id;

    // 3. Dividir escena
    scenes = splitProductionScene(
        originalSceneId,
        'Una señal aparece en el bosque.',
        'Mateo decide investigar.'
    );

    assert.equal(scenes.length, 2);
    console.log('3. División de escenas: OK.');

    // 4. Agregar un recurso de prueba a la segunda escena
    const secondSceneId = scenes[1].id;

    db.prepare(`
        INSERT INTO scene_assets (
            id, scene_id, asset_type, file_path,
            start_seconds, end_seconds, metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        randomUUID(),
        secondSceneId,
        'test',
        'test/asset-example.mp4',
        0,
        5,
        '{}'
    );

    console.log('4. Recurso de prueba agregado.');

    // 5. Duplicar la segunda escena
    scenes = duplicateProductionScene(secondSceneId);

    assert.equal(scenes.length, 3);

    const duplicatedScene = scenes.find(
        scene => scene.id !== originalSceneId &&
                 scene.id !== secondSceneId
    );

    assert.ok(duplicatedScene);

    const duplicatedAssets = db.prepare(`
        SELECT COUNT(*) AS total
        FROM scene_assets
        WHERE scene_id = ?
    `).get(duplicatedScene.id);

    assert.equal(duplicatedAssets.total, 1);

    console.log('5. Duplicación y copia de recursos: OK.');

    // 6. Reordenar las escenas
    const reorderedIds = [
        scenes[0].id,
        scenes[1].id,
        scenes[2].id
    ];

    scenes = reorderProductionScenes(
        productionId,
        reorderedIds
    );

    assert.deepEqual(
        scenes.map(scene => scene.id),
        reorderedIds
    );

    console.log('6. Reordenamiento: OK.');

    // 7. Unir las dos últimas escenas
    scenes = mergeProductionScenes(
        secondSceneId,
        duplicatedScene.id
    );

    assert.equal(scenes.length, 2);

    const mergedAssets = db.prepare(`
        SELECT COUNT(*) AS total
        FROM scene_assets
        WHERE scene_id = ?
    `).get(secondSceneId);

    assert.equal(mergedAssets.total, 2);

    console.log('7. Unión y conservación de recursos: OK.');

    // 8. Unir las dos escenas restantes
    scenes = mergeProductionScenes(
        scenes[0].id,
        scenes[1].id
    );

    assert.equal(scenes.length, 1);

    assert.ok(
        scenes[0].narration_text.includes(
            'Una señal aparece en el bosque.'
        )
    );

    assert.ok(
        scenes[0].narration_text.includes(
            'Mateo decide investigar.'
        )
    );

    const finalAssets = db.prepare(`
        SELECT COUNT(*) AS total
        FROM scene_assets
        WHERE scene_id = ?
    `).get(scenes[0].id);

    assert.equal(finalAssets.total, 2);

    console.log('8. Unión final y conservación del texto: OK.');

    console.log('\nTODAS LAS PRUEBAS SUPERADAS.');

} catch (error) {
    console.error('\nERROR EN LAS PRUEBAS:', error);
    process.exitCode = 1;

} finally {
    if (productionId) {
        const result = deleteProduction(productionId);

        console.log(
            '\nLimpieza de producción temporal:',
            result.message
        );
    }
}
