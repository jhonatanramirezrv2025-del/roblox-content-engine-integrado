
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { getProductionWorkspacePath } from './production-files.js';

const DEFAULT_SETTINGS = {
    masterVolume: 100,
    masterMuted: false,
    assetVolumes: {},
    mutedAssets: {}
};

function normalizeVolume(value, fieldName) {
    const volume = Number(value);

    if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
        const error = new Error(`${fieldName} must be between 0 and 100`);
        error.statusCode = 400;
        throw error;
    }

    return volume;
}

function normalizeBoolean(value, fieldName) {
    if (typeof value !== 'boolean') {
        const error = new Error(`${fieldName} must be a boolean`);
        error.statusCode = 400;
        throw error;
    }

    return value;
}

function normalizeAssetVolumes(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error('assetVolumes must be an object');
        error.statusCode = 400;
        throw error;
    }

    return Object.fromEntries(
        Object.entries(value).map(([assetId, volume]) => [
            assetId,
            normalizeVolume(volume, `assetVolumes.${assetId}`)
        ])
    );
}

function normalizeMutedAssets(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error('mutedAssets must be an object');
        error.statusCode = 400;
        throw error;
    }

    return Object.fromEntries(
        Object.entries(value).map(([assetId, muted]) => [
            assetId,
            normalizeBoolean(muted, `mutedAssets.${assetId}`)
        ])
    );
}

function normalizeSettings(data = {}) {
    return {
        masterVolume: normalizeVolume(
            data.masterVolume ?? DEFAULT_SETTINGS.masterVolume,
            'masterVolume'
        ),
        masterMuted: normalizeBoolean(
            data.masterMuted ?? DEFAULT_SETTINGS.masterMuted,
            'masterMuted'
        ),
        assetVolumes: normalizeAssetVolumes(
            data.assetVolumes ?? {}
        ),
        mutedAssets: normalizeMutedAssets(
            data.mutedAssets ?? {}
        )
    };
}

function getSettingsPath(productionId) {
    const workspace = getProductionWorkspacePath(productionId);
    return join(workspace, 'audio-mixer-settings.json');
}

export async function getAudioMixerSettings(productionId) {
    const filePath = getSettingsPath(productionId);

    try {
        const content = await readFile(filePath, 'utf8');
        const savedSettings = JSON.parse(content);

        return {
            ...DEFAULT_SETTINGS,
            ...normalizeSettings(savedSettings)
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { ...DEFAULT_SETTINGS };
        }

        if (error instanceof SyntaxError) {
            console.error('Invalid audio mixer settings file:', error);
            return { ...DEFAULT_SETTINGS };
        }

        throw error;
    }
}

export async function saveAudioMixerSettings(productionId, data) {
    const settings = normalizeSettings(data);
    const filePath = getSettingsPath(productionId);
    const temporaryPath = `${filePath}.tmp`;

    const fileContent = {
        ...settings,
        updatedAt: new Date().toISOString()
    };

    await writeFile(
        temporaryPath,
        JSON.stringify(fileContent, null, 2),
        'utf8'
    );

    await rename(temporaryPath, filePath);

    return fileContent;
}
