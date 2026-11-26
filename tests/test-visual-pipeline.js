import assert from 'node:assert/strict';
import path from 'node:path';
import { createProduction, deleteProduction } from '../src/production/production-service.js';
import '../src/production/scene-schema.js';
import { createSceneProposals, getProductionScenes } from '../src/production/production-scene-service.js';
import { storeProductionAsset } from '../src/production/production-asset-storage.js';
import { attachAssetToScene } from '../src/production/production-asset-service.js';
import {
    buildSceneImagePrompt,
    buildProductionVisualManifest
} from '../src/production/production-visual-service.js';

let productionId;

try {
    const production = createProduction({
        title: 'TEST TEMPORAL - Visual Pipeline',
        description: 'Prueba de prompts e imágenes por escena',
        script: 'Mateo camina por un bosque oscuro. Encuentra una cabaña abandonada.'
    });
    productionId = production.id;

    const scenes = createSceneProposals(productionId);
    assert.ok(scenes.length >= 1, 'Debe generar al menos una escena');

    const prompt = buildSceneImagePrompt(scenes[0]);
    assert.match(prompt, /vertical 9:16/i);
    assert.match(prompt, /Roblox-inspired/i);
    assert.match(prompt, /Mateo/i);
    assert.match(prompt, /SCENE BRIEF/i);

    // PNG 1x1 válido para probar almacenamiento y asociación sin proveedor externo.
    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6XcAAAAASUVORK5CYII=',
        'base64'
    );
    const asset = await storeProductionAsset({
        productionId,
        category: 'backgrounds',
        originalName: 'visual-test.png',
        mimeType: 'image/png',
        buffer: png
    });
    attachAssetToScene({
        assetId: asset.id,
        sceneId: scenes[0].id,
        startSeconds: 0,
        endSeconds: 1,
        metadata: { source: 'test' }
    });

    const secondAsset = await storeProductionAsset({
        productionId,
        category: 'backgrounds',
        originalName: 'visual-test-second.png',
        mimeType: 'image/png',
        buffer: png
    });
    attachAssetToScene({
        assetId: secondAsset.id,
        sceneId: scenes[0].id,
        startSeconds: 1,
        endSeconds: 2,
        metadata: { source: 'test' }
    });

    const duration = Math.max(3, Number(scenes[0].duration_seconds) || 3);
    const manifest = await buildProductionVisualManifest(productionId, duration);
    assert.ok(manifest.scenes.length >= 2, 'Debe respetar los cambios de imagen en el timeline');
    assert.equal(manifest.scenes[0].imagePath, path.resolve(process.cwd(), asset.file_path));
    assert.equal(manifest.scenes[1].imagePath, path.resolve(process.cwd(), secondAsset.file_path));
    assert.equal(manifest.scenes.reduce((sum, item) => sum + item.duration, 0), duration);

    const persistedScenes = getProductionScenes(productionId);
    assert.equal(persistedScenes.length, scenes.length);

    console.log('PROMPT VISUAL: OK');
    console.log('ALMACENAMIENTO Y ASOCIACIÓN DE IMAGEN: OK');
    console.log('MANIFIESTO VISUAL Y DURACIÓN: OK');
    console.log('\nTODAS LAS PRUEBAS VISUALES SUPERADAS.');
} catch (error) {
    console.error('\nERROR EN PRUEBAS VISUALES:', error);
    process.exitCode = 1;
} finally {
    if (productionId) {
        deleteProduction(productionId);
    }
}
