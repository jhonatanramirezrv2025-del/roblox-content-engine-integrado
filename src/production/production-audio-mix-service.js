import { access } from 'node:fs/promises';
import path from 'node:path';

import { getProductionScenes } from './production-scene-service.js';
import { getSceneAssets } from './production-asset-service.js';
import { getAudioMixerSettings } from './production-audio-mixer-service.js';

function parseMetadata(metadataJson) {
    try {
        const value = JSON.parse(metadataJson || '{}');
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : {};
    } catch {
        return {};
    }
}

function isMusicOrSoundEffect(asset) {
    const type = String(asset.asset_type || '')
        .toLowerCase()
        .replaceAll('_', '-');

    return (
        type === 'music' ||
        type === 'sound-effect' ||
        type === 'sound-effects' ||
        type === 'sfx'
    );
}

/**
 * Builds a render manifest from scene-relative audio associations.
 * Scene offsets are calculated from the ordered scene durations.
 * The narration duration is always the final render boundary.
 */
export async function buildProductionAudioMixManifest(
    productionId,
    narrationDuration
) {
    if (!Number.isFinite(narrationDuration) || narrationDuration <= 0) {
        throw new Error('La duración de la narración no es válida.');
    }

    const settings = await getAudioMixerSettings(productionId);
    const scenes = getProductionScenes(productionId);

    const manifest = {
        narrationDuration,
        masterVolume: settings.masterVolume,
        masterMuted: settings.masterMuted,
        tracks: []
    };

    let sceneOffset = 0;

    for (const scene of scenes) {
        const sceneDuration = Math.max(0, Number(scene.duration_seconds) || 0);
        const associations = getSceneAssets(scene.id);

        for (const association of associations) {
            if (!isMusicOrSoundEffect(association)) continue;
            if (settings.masterMuted) continue;
            if (settings.mutedAssets?.[association.id]) continue;

            const individualVolume = Number(
                settings.assetVolumes?.[association.id] ?? 100
            );

            if (!Number.isFinite(individualVolume) || individualVolume <= 0) {
                continue;
            }

            const localStart = association.start_seconds == null
                ? 0
                : Number(association.start_seconds);

            const localEnd = association.end_seconds == null
                ? sceneDuration
                : Number(association.end_seconds);

            if (
                !Number.isFinite(localStart) ||
                !Number.isFinite(localEnd) ||
                localStart < 0 ||
                localEnd <= localStart
            ) {
                console.warn(
                    `[AUDIO MIX] Se omite asociación ${association.id}: tiempos inválidos.`
                );
                continue;
            }

            const absoluteStart = sceneOffset + localStart;
            const absoluteEnd = Math.min(
                sceneOffset + localEnd,
                narrationDuration
            );

            if (absoluteStart >= narrationDuration || absoluteEnd <= absoluteStart) {
                continue;
            }

            const clipDuration = absoluteEnd - absoluteStart;
            const filePath = path.resolve(process.cwd(), association.file_path);

            try {
                await access(filePath);
            } catch {
                console.warn(
                    `[AUDIO MIX] Se omite ${association.id}: no existe ${filePath}`
                );
                continue;
            }

            const metadata = parseMetadata(association.metadata_json);
            let fadeIn = Math.max(0, Number(metadata.fadeIn) || 0);
            let fadeOut = Math.max(0, Number(metadata.fadeOut) || 0);

            if (fadeIn + fadeOut > clipDuration) {
                const ratio = clipDuration / (fadeIn + fadeOut);
                fadeIn *= ratio;
                fadeOut *= ratio;
            }

            manifest.tracks.push({
                associationId: association.id,
                filePath,
                start: absoluteStart,
                duration: clipDuration,
                volume: (individualVolume / 100) * (settings.masterVolume / 100),
                fadeIn,
                fadeOut
            });
        }

        sceneOffset += sceneDuration;
    }

    return manifest;
}
