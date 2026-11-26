import path from 'node:path';
import { access } from 'node:fs/promises';
import db from './database.js';
import { getProductionScenes } from './production-scene-service.js';
import { getSceneAssets } from './production-asset-service.js';

function parseCharacters(value) {
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalizeScene(scene) {
    return {
        ...scene,
        characters: parseCharacters(scene.characters ?? scene.characters_json)
    };
}

export function buildSceneImagePrompt(inputScene) {
    const scene = normalizeScene(inputScene || {});
    const characters = scene.characters.length
        ? scene.characters.join(', ')
        : 'the characters implied by the narration';

    const details = [
        ['Scene', scene.title],
        ['Narrative context', scene.narration_text],
        ['Characters', characters],
        ['Location', scene.location],
        ['Action', scene.action_description],
        ['Shot', scene.shot_type],
        ['Camera', scene.camera_movement],
        ['Lighting', scene.lighting],
        ['Mood', scene.mood],
        ['Visual direction', scene.visual_description]
    ].filter(([, value]) => String(value ?? '').trim())
        .map(([label, value]) => `${label}: ${String(value).trim()}`)
        .join('\n');

    return [
        'Create one polished vertical 9:16 cinematic keyframe for a Roblox story video.',
        'Visual style: high-quality Roblox-inspired 3D game render, recognizable blocky avatar proportions, expressive but game-like characters, detailed game environment, cinematic composition, coherent materials and lighting.',
        'Keep character appearance consistent with the character names and descriptions. Show one clear moment from this scene, with a strong focal subject and readable foreground, middle ground, and background.',
        'Compose for a 9:16 mobile video frame. Keep important faces and action near the center safe area. Use a visually rich environment and cinematic depth.',
        'Do not include text, captions, subtitles, logos, watermarks, UI, menus, borders, or a collage. Do not add unrelated characters or objects.',
        '',
        'SCENE BRIEF',
        details || 'Illustrate the scene described by its narration.',
        '',
        'The image must communicate the scene clearly without relying on written words.'
    ].join('\n');
}

function isImageAsset(asset) {
    return String(asset.mime_type || '').startsWith('image/');
}

export function getSceneImagePrompt(sceneId, overrides = null) {
    const row = db.prepare(`SELECT * FROM production_scenes WHERE id = ?`).get(sceneId);
    if (!row) {
        const error = new Error('No se encontró la escena.');
        error.statusCode = 404;
        throw error;
    }
    return buildSceneImagePrompt({ ...normalizeScene(row), ...(overrides || {}) });
}

/**
 * Builds the visual timeline consumed by render.js. Scene durations remain
 * scene-relative; if their sum is shorter than narration, the last scene is
 * held to the narration boundary. Images are selected from scene associations.
 */
export async function buildProductionVisualManifest(productionId, narrationDuration) {
    if (!Number.isFinite(narrationDuration) || narrationDuration <= 0) {
        throw new Error('La duración de narración para el montaje visual no es válida.');
    }

    const scenes = getProductionScenes(productionId);
    const visualScenes = [];
    let sceneOffset = 0;

    for (const scene of scenes) {
        if (sceneOffset >= narrationDuration) break;
        const sceneDuration = Math.max(0, Number(scene.duration_seconds) || 0);
        if (sceneDuration <= 0) continue;

        const allImages = getSceneAssets(scene.id).filter(isImageAsset);
        const backgrounds = allImages.filter(asset => asset.asset_type === 'background');
        const candidates = backgrounds.length
            ? backgrounds
            : allImages.filter(asset => asset.asset_type === 'character').length
                ? allImages.filter(asset => asset.asset_type === 'character')
                : allImages;

        const validImages = [];
        for (const association of candidates) {
            if (!association.file_path) continue;
            const candidate = path.resolve(process.cwd(), association.file_path);
            try {
                await access(candidate);
                validImages.push({
                    path: candidate,
                    start: Math.max(0, Number(association.start_seconds) || 0),
                    end: association.end_seconds == null
                        ? sceneDuration
                        : Math.min(sceneDuration, Number(association.end_seconds))
                });
            } catch {
                console.warn(`[VISUAL RENDER] Imagen no encontrada para ${scene.title}: ${candidate}`);
            }
        }

        validImages.sort((a, b) => a.start - b.start);
        const sceneSegments = [];
        let localTime = 0;
        let currentImage = null;

        for (const image of validImages) {
            if (!Number.isFinite(image.end) || image.end <= image.start || image.start >= sceneDuration) continue;
            const imageStart = Math.min(sceneDuration, image.start);
            const imageEnd = Math.min(sceneDuration, image.end);

            if (imageStart > localTime) {
                sceneSegments.push({
                    title: scene.title,
                    duration: imageStart - localTime,
                    imagePath: currentImage
                });
            }

            const segmentStart = Math.max(localTime, imageStart);
            if (imageEnd > segmentStart) {
                sceneSegments.push({
                    title: scene.title,
                    duration: imageEnd - segmentStart,
                    imagePath: image.path
                });
                currentImage = image.path;
                localTime = imageEnd;
            }
        }

        if (localTime < sceneDuration) {
            sceneSegments.push({
                title: scene.title,
                duration: sceneDuration - localTime,
                imagePath: currentImage
            });
        }

        if (!sceneSegments.length) {
            sceneSegments.push({
                title: scene.title,
                duration: sceneDuration,
                imagePath: null
            });
        }

        for (const segment of sceneSegments) {
            if (sceneOffset >= narrationDuration) break;
            const duration = Math.min(segment.duration, narrationDuration - sceneOffset);
            if (duration <= 0) continue;
            visualScenes.push({
                sceneId: scene.id,
                title: segment.title,
                start: sceneOffset,
                duration,
                imagePath: segment.imagePath
            });
            sceneOffset += duration;
        }
    }

    if (visualScenes.length && sceneOffset < narrationDuration) {
        const last = visualScenes[visualScenes.length - 1];
        last.duration += narrationDuration - sceneOffset;
    } else if (!visualScenes.length) {
        visualScenes.push({
            sceneId: null,
            title: 'Fondo',
            start: 0,
            duration: narrationDuration,
            imagePath: null
        });
    }

    return {
        width: 1080,
        height: 1920,
        fps: 30,
        narrationDuration,
        scenes: visualScenes
    };
}
