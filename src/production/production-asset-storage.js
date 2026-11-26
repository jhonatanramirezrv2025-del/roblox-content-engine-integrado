
import { randomUUID } from 'node:crypto';
import {
    mkdir,
    writeFile,
    rm
} from 'node:fs/promises';
import path from 'node:path';

import { getProduction } from './production-service.js';
import { getProductionWorkspacePath } from './production-files.js';
import { registerProductionAsset } from './production-asset-service.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const categories = {
    characters: 'character',
    backgrounds: 'background',
    music: 'music',
    'sound-effects': 'sound-effect',
    other: 'other'
};

const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'video/mp4',
    'video/webm'
]);

const extensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'video/mp4': '.mp4',
    'video/webm': '.webm'
};

export async function storeProductionAsset({
    productionId,
    category,
    originalName,
    mimeType,
    buffer
}) {
    if (!getProduction(productionId)) {
        throw new Error('No se encontró la producción.');
    }

    if (!Object.hasOwn(categories, category)) {
        throw new Error('Categoría de recurso no válida.');
    }

    if (!allowedMimeTypes.has(mimeType)) {
        throw new Error('Formato de archivo no permitido.');
    }

    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('El archivo está vacío o no es válido.');
    }

    if (buffer.length > MAX_FILE_SIZE) {
        const error = new Error('El archivo supera el límite de 25 MB.');
        error.statusCode = 413;
        throw error;
    }

    const safeOriginalName = path.basename(
        String(originalName || 'archivo')
    ).replace(/[^\w.\-() ]/g, '_').slice(0, 150);

    const extension = extensions[mimeType];
    const storedName = `${randomUUID()}${extension}`;

    const workspacePath = getProductionWorkspacePath(productionId);
    const categoryPath = path.join(
        workspacePath,
        'assets',
        category
    );

    const absolutePath = path.join(categoryPath, storedName);

    const relativePath = path.relative(
        process.cwd(),
        absolutePath
    ).split(path.sep).join('/');

    await mkdir(categoryPath, { recursive: true });

    await writeFile(absolutePath, buffer, { flag: 'wx' });

    try {
        const asset = registerProductionAsset({
            productionId,
            assetType: categories[category],
            filePath: relativePath,
            originalName: safeOriginalName,
            mimeType,
            fileSize: buffer.length,
            metadata: {
                category
            }
        });

        return {
            ...asset,
            url: `/productions/${productionId}/assets/${asset.id}/file`
        };
    } catch (error) {
        await rm(absolutePath, { force: true });
        throw error;
    }
}
