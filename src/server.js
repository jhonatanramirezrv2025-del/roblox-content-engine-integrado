import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

import {
    createReadStream,
    createWriteStream
} from 'node:fs';

import {
    readFile,
    writeFile,
    mkdir,
    stat
} from 'node:fs/promises';

import {
    join,
    resolve,
    relative,
    isAbsolute
} from 'node:path';

import {
    createProduction,
    getProduction,
    listProductions,
    updateProductionStatus,
    getProductionEvents,
    updateProduction,
    deleteProduction,
    addProductionEvent
} from './production/production-service.js';

import {
    getAudioMixerSettings,
    saveAudioMixerSettings
} from './production/production-audio-mixer-service.js';

import './production/scene-schema.js';

import {
    createSceneProposals,
    generateVisualProposals,
    duplicateProductionScene,
    getProductionScenes,
    mergeProductionScenes,
    reorderProductionScenes,
    splitProductionScene,
    updateProductionScene,
    updateSceneStatus,
    updateVisualStatus
} from './production/production-scene-service.js';

import { getProductionWorkspacePath } from './production/production-files.js';
import {
    getProductionAssets,
    attachAssetToScene,
    getSceneAssets,
    detachAssetFromScene,
    updateSceneAssetTiming
} from './production/production-asset-service.js';

import {
    storeProductionAsset
} from './production/production-asset-storage.js';

import {
    getSceneImagePrompt
} from './production/production-visual-service.js';

// =====================================
// CONFIGURACIÓN
// =====================================

const root = process.cwd();
const jobsPath = join(root, 'data', 'jobs.json');

const PORT = 3005;
const HOST = '127.0.0.1';

const activeProductions = new Map();

const allowedJobStatuses = new Set([
    'draft',
    'approved',
    'rendered',
    'scheduled',
    'published',
    'failed'
]);

// =====================================
// FUNCIONES AUXILIARES
// =====================================

async function loadJobs() {
    try {
        return JSON.parse(
            await readFile(jobsPath, 'utf8')
        );
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }

        throw error;
    }
}

async function readBody(req, maxSize = 100000) {
    let raw = '';

    for await (const part of req) {
        raw += part;

        if (Buffer.byteLength(raw, 'utf8') > maxSize) {
            const error = new Error('Payload too large');
            error.statusCode = 413;
            throw error;
        }
    }

    if (!raw.trim()) {
        return {};
    }

    return JSON.parse(raw);
}


async function readBinaryBody(req, maxSize = 25 * 1024 * 1024) {
    const chunks = [];
    let totalBytes = 0;

    for await (const part of req) {
        const chunk = Buffer.isBuffer(part)
            ? part
            : Buffer.from(part);

        totalBytes += chunk.length;

        if (totalBytes > maxSize) {
            const error = new Error('El archivo supera el límite de 25 MB.');
            error.statusCode = 413;
            throw error;
        }

        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}


function send(res, status, data) {
    if (res.headersSent) {
        return;
    }

    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-File-Name, X-File-Type'
    });

    if (status === 204) {
        return res.end();
    }

    res.end(JSON.stringify(data));
}

// =====================================
// GENERACIÓN EN SEGUNDO PLANO
// =====================================

function startProductionGeneration(id) {
    const production = getProduction(id);

    if (!production) {
        throw new Error('Production not found');
    }

    if (activeProductions.has(id)) {
        const error = new Error('This production is already running');
        error.statusCode = 409;
        throw error;
    }

    if (production.status === 'processing') {
        const error = new Error('This production is already processing');
        error.statusCode = 409;
        throw error;
    }

    const workspace = getProductionWorkspacePath(id);
    const rendersDirectory = join(workspace, 'renders');
    const logPath = join(rendersDirectory, 'generation.log');

    return mkdir(rendersDirectory, { recursive: true }).then(() => {
        const logStream = createWriteStream(logPath, {
            flags: 'a'
        });

        logStream.write(
            `\n\n===== GENERATION STARTED: ${new Date().toISOString()} =====\n`
        );

        const scriptPath = join(root, 'src', 'produce.js');

        const child = spawn(
            process.execPath,
            [
                scriptPath,
                '--production',
                id
            ],
            {
                cwd: root,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        activeProductions.set(id, child);

        child.stdout.pipe(logStream, { end: false });
        child.stderr.pipe(logStream, { end: false });

        addProductionEvent(
            id,
            'generation_started',
            'La generación del vídeo fue iniciada desde el panel.'
        );

        child.on('error', (error) => {
            console.error('Generation process error:', error);

            activeProductions.delete(id);

            try {
                const current = getProduction(id);

                if (current && current.status === 'processing') {
                    updateProductionStatus(id, 'failed');
                }

                addProductionEvent(
                    id,
                    'generation_error',
                    `No se pudo iniciar el proceso: ${error.message}`
                );
            } catch (dbError) {
                console.error('Could not update production:', dbError);
            }

            logStream.write(
                `\nPROCESS ERROR: ${error.message}\n`
            );

            logStream.end();
        });

        child.on('close', (code) => {
            activeProductions.delete(id);

            logStream.write(
                `\n===== GENERATION FINISHED: ${new Date().toISOString()} | EXIT CODE: ${code} =====\n`
            );

            logStream.end();

            console.log(
                `Production ${id} finished with exit code ${code}`
            );

            if (code !== 0) {
                try {
                    const current = getProduction(id);

                    if (current && current.status === 'processing') {
                        updateProductionStatus(id, 'failed');

                        addProductionEvent(
                            id,
                            'generation_error',
                            `El proceso terminó con código ${code}.`
                        );
                    }
                } catch (error) {
                    console.error('Could not update failed production:', error);
                }
            }
        });

        return {
            success: true,
            productionId: id,
            pid: child.pid,
            message: 'Video generation started'
        };
    });
}

// =====================================
// SERVIDOR HTTP
// =====================================

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(
            req.url,
            `http://${HOST}:${PORT}`
        );

        const pathname = url.pathname;

        // CORS preflight
        if (req.method === 'OPTIONS') {
            return send(res, 204, {});
        }

        // =====================================
        // HEALTH CHECK
        // =====================================

        if (req.method === 'GET' && pathname === '/health') {
            return send(res, 200, {
                ok: true,
                service: 'roblox-content-engine'
            });
        }

        // =====================================
        // API ANTIGUA: JOBS
        // =====================================

        if (req.method === 'GET' && pathname === '/jobs') {
            return send(res, 200, await loadJobs());
        }

        if (req.method === 'POST' && pathname === '/jobs') {
            const data = await readBody(req);

            const title = String(data.title || '').trim();
            const script = String(data.script || '').trim();

            if (
                !title ||
                !script ||
                title.length > 180 ||
                script.length > 15000
            ) {
                return send(res, 400, {
                    error: 'title and script required; length limits apply'
                });
            }

            const jobs = await loadJobs();

            const job = {
                id: crypto.randomUUID(),
                title,
                script,
                status: 'draft',
                createdAt: new Date().toISOString()
            };

            jobs.push(job);

            await mkdir(join(root, 'data'), {
                recursive: true
            });

            await writeFile(
                jobsPath,
                JSON.stringify(jobs, null, 2)
            );

            return send(res, 201, job);
        }

        const jobMatch = pathname.match(
            /^\/jobs\/([a-f0-9-]+)$/i
        );

        if (req.method === 'PATCH' && jobMatch) {
            const data = await readBody(req);

            if (!allowedJobStatuses.has(data.status)) {
                return send(res, 400, {
                    error: 'Invalid status'
                });
            }

            const jobs = await loadJobs();

            const job = jobs.find(
                item => item.id === jobMatch[1]
            );

            if (!job) {
                return send(res, 404, {
                    error: 'Not found'
                });
            }

            job.status = data.status;

            await writeFile(
                jobsPath,
                JSON.stringify(jobs, null, 2)
            );

            return send(res, 200, job);
        }

        // =====================================
        // API: PRODUCTIONS
        // =====================================

        // Listar producciones
        if (
            req.method === 'GET' &&
            pathname === '/productions'
        ) {
            return send(res, 200, listProductions());
        }

        // Crear producción
        if (
            req.method === 'POST' &&
            pathname === '/productions'
        ) {
            const data = await readBody(req);

            const production = createProduction({
                title: String(data.title || ''),
                description: String(data.description || ''),
                script: String(data.script || '')
            });

            return send(res, 201, production);
        }

                // =====================================
        // SCENE MANAGER
        // =====================================

        // Consultar escenas de una producción
        const scenesMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/scenes$/i
        );

        if (
            req.method === 'GET' &&
            scenesMatch
        ) {
            return send(
                res,
                200,
                getProductionScenes(scenesMatch[1])
            );
        }

        // Generar propuestas automáticas desde el guion
        const generateScenesMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/scenes\/generate$/i
        );

        if (
            req.method === 'POST' &&
            generateScenesMatch
        ) {
            const scenes = createSceneProposals(
                generateScenesMatch[1]
            );

            return send(res, 201, scenes);
        }

        // Generar propuestas visuales
        const generateVisualsMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/scenes\/generate-visuals$/i
        );

        if (
            req.method === 'POST' &&
            generateVisualsMatch
        ) {
            const scenes = generateVisualProposals(
                generateVisualsMatch[1]
            );

            return send(res, 200, scenes);
        }

        // Crear prompt de imagen para una escena (no requiere API key)
        const sceneImagePromptMatch = pathname.match(
            /^\/scenes\/([a-f0-9-]+)\/image-prompt$/i
        );

        if (req.method === 'POST' && sceneImagePromptMatch) {
            const data = await readBody(req);
            const prompt = getSceneImagePrompt(sceneImagePromptMatch[1], data.scene || data);
            return send(res, 200, { prompt });
        }

        // La generación de imágenes se realiza manualmente en ChatGPT.
        // El proyecto solo prepara prompts y permite importar/adjuntar imágenes.

        // Reordenar escenas
        const reorderScenesMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/scenes\/reorder$/i
        );

        if (
            req.method === 'PUT' &&
            reorderScenesMatch
        ) {
            const data = await readBody(req);

            const scenes = reorderProductionScenes(
                reorderScenesMatch[1],
                data.sceneIds
            );

            return send(res, 200, scenes);
        }

        // Unir dos escenas consecutivas
        if (
            req.method === 'POST' &&
            pathname === '/scenes/merge'
        ) {
            const data = await readBody(req);

            const scenes = mergeProductionScenes(
                data.firstSceneId,
                data.secondSceneId
            );

            return send(res, 200, scenes);
        }

        // Cambiar estado narrativo de una escena
        const sceneStatusMatch = pathname.match(
            /^\/scenes\/([a-f0-9-]+)\/status$/i
        );

        if (
            req.method === 'PATCH' &&
            sceneStatusMatch
        ) {
            const data = await readBody(req);

            const scene = updateSceneStatus(
                sceneStatusMatch[1],
                data.status
            );

            return send(res, 200, scene);
        }

        // Cambiar estado de aprobación visual
        const visualStatusMatch = pathname.match(
            /^\/scenes\/([a-f0-9-]+)\/visual-status$/i
        );

        if (
            req.method === 'PATCH' &&
            visualStatusMatch
        ) {
            const data = await readBody(req);

            const scene = updateVisualStatus(
                visualStatusMatch[1],
                data.status
            );

            return send(res, 200, scene);
        }

        // Dividir una escena
        const splitSceneMatch = pathname.match(
            /^\/scenes\/([a-f0-9-]+)\/split$/i
        );

        if (
            req.method === 'POST' &&
            splitSceneMatch
        ) {
            const data = await readBody(req);

            const scenes = splitProductionScene(
                splitSceneMatch[1],
                data.firstText,
                data.secondText
            );

            return send(res, 200, scenes);
        }

        // Duplicar una escena
        const duplicateSceneMatch = pathname.match(
            /^\/scenes\/([a-f0-9-]+)\/duplicate$/i
        );

        if (
            req.method === 'POST' &&
            duplicateSceneMatch
        ) {
            const scenes = duplicateProductionScene(
                duplicateSceneMatch[1]
            );

            return send(res, 201, scenes);
        }

        // Editar una escena
        const sceneMatch = pathname.match(
            /^\/scenes\/([a-f0-9-]+)$/i
        );

        if (
            req.method === 'PATCH' &&
            sceneMatch
        ) {
            const data = await readBody(req);

            const scene = updateProductionScene(
                sceneMatch[1],
                data
            );

            return send(res, 200, scene);
        }


        // =====================================
        // ASSET MANAGER
        // =====================================

        // Consultar recursos de una producción
        const productionAssetsMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/assets$/i
        );

        if (req.method === 'GET' && productionAssetsMatch) {
            const productionId = productionAssetsMatch[1];

            if (!getProduction(productionId)) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            return send(res, 200, getProductionAssets(productionId));
        }

        // Subir un recurso
        const uploadAssetMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/assets\/upload$/i
        );

        if (req.method === 'POST' && uploadAssetMatch) {
            const productionId = uploadAssetMatch[1];

            if (!getProduction(productionId)) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            const category = url.searchParams.get('category');
            const originalName = decodeURIComponent(
                req.headers['x-file-name'] || 'archivo'
            );
            const mimeType = String(
                req.headers['x-file-type'] || ''
            ).toLowerCase();

            const buffer = await readBinaryBody(req);

            const asset = await storeProductionAsset({
                productionId,
                category,
                originalName,
                mimeType,
                buffer
            });

            return send(res, 201, {
                success: true,
                asset
            });
        }

        // Previsualizar o descargar un recurso
        const assetFileMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/assets\/([a-f0-9-]+)\/file$/i
        );

        if (req.method === 'GET' && assetFileMatch) {
            const productionId = assetFileMatch[1];
            const assetId = assetFileMatch[2];

            if (!getProduction(productionId)) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            const assets = getProductionAssets(productionId);
            const asset = assets.find(item => item.id === assetId);

            if (!asset) {
                return send(res, 404, {
                    error: 'Asset not found'
                });
            }

            const workspaceRoot = resolve(
                getProductionWorkspacePath(productionId)
            );

            const filePath = resolve(
                process.cwd(),
                asset.file_path
            );

            const relativePath = relative(
                workspaceRoot,
                filePath
            );

            if (
                relativePath.startsWith('..') ||
                isAbsolute(relativePath)
            ) {
                return send(res, 403, {
                    error: 'Invalid asset path'
                });
            }

            try {
                const fileInfo = await stat(filePath);

                res.writeHead(200, {
                    'Content-Type': asset.mime_type || 'application/octet-stream',
                    'Content-Length': fileInfo.size,
                    'Access-Control-Allow-Origin': 'http://localhost:5173',
                    'Content-Disposition': 'inline',
                    'X-Content-Type-Options': 'nosniff'
                });

                const stream = createReadStream(filePath);

                stream.on('error', error => {
                    console.error('Asset stream error:', error);
                    res.destroy(error);
                });

                return stream.pipe(res);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return send(res, 404, {
                        error: 'Asset file not found'
                    });
                }

                throw error;
            }
        }

        // =====================================
// AUDIO MIXER SETTINGS
// =====================================

// Consultar configuración del mezclador
const audioMixerSettingsMatch = pathname.match(
    /^\/productions\/([a-f0-9-]+)\/audio-mixer-settings$/i
);

if (
    req.method === 'GET' &&
    audioMixerSettingsMatch
) {
    const productionId = audioMixerSettingsMatch[1];

    if (!getProduction(productionId)) {
        return send(res, 404, {
            error: 'Production not found'
        });
    }

    const settings = await getAudioMixerSettings(productionId);

    return send(res, 200, settings);
}

// Guardar configuración del mezclador
if (
    req.method === 'PUT' &&
    audioMixerSettingsMatch
) {
    const productionId = audioMixerSettingsMatch[1];

    if (!getProduction(productionId)) {
        return send(res, 404, {
            error: 'Production not found'
        });
    }

    const data = await readBody(req);

    const settings = await saveAudioMixerSettings(
        productionId,
        data
    );

    return send(res, 200, {
        success: true,
        settings
    });
}

        // =====================================
// ASOCIACIÓN DE RECURSOS CON ESCENAS
// =====================================

// Consultar recursos asociados a una escena
const sceneAssetsMatch = pathname.match(
    /^\/scenes\/([a-f0-9-]+)\/assets$/i
);

if (
    req.method === 'GET' &&
    sceneAssetsMatch
) {
    const assets = getSceneAssets(sceneAssetsMatch[1]);

    return send(res, 200, assets);
}

// Asociar un recurso existente a una escena
if (
    req.method === 'POST' &&
    sceneAssetsMatch
) {
    const data = await readBody(req);

    const association = attachAssetToScene({
        assetId: data.assetId,
        sceneId: sceneAssetsMatch[1],
        startSeconds: data.startSeconds ?? null,
        endSeconds: data.endSeconds ?? null,
        metadata: data.metadata ?? {}
    });

    return send(res, 201, {
        success: true,
        association
    });
}


// Actualizar tiempos de un recurso en una escena
const sceneAssetTimingMatch = pathname.match(
    /^\/scene-assets\/([a-f0-9-]+)\/timing$/i
);

if (
    req.method === 'PATCH' &&
    sceneAssetTimingMatch
) {
    const data = await readBody(req);

    const association = updateSceneAssetTiming({
      associationId: sceneAssetTimingMatch[1],
      startSeconds: data.startSeconds,
      endSeconds: data.endSeconds,
      fadeIn: data.fadeIn,
      fadeOut: data.fadeOut
    });

    return send(res, 200, {
        success: true,
        association
    });
}


// Desasociar un recurso de una escena
const detachSceneAssetMatch = pathname.match(
    /^\/scene-assets\/([a-f0-9-]+)$/i
);

if (
    req.method === 'DELETE' &&
    detachSceneAssetMatch
) {
    const result = detachAssetFromScene(
        detachSceneAssetMatch[1]
    );

    return send(res, 200, result);
}

                // =====================================
        // GENERAR VÍDEO
        // POST /productions/:id/produce
        // =====================================

        const produceMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/produce$/i
        );

        if (
            req.method === 'POST' &&
            produceMatch
        ) {
            const id = produceMatch[1];

            const result = await startProductionGeneration(id);

            return send(res, 202, result);
        }

        // =====================================
        // REPRODUCIR VÍDEO
        // GET /productions/:id/video
        // =====================================

        const videoMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/video$/i
        );

        if (
            req.method === 'GET' &&
            videoMatch
        ) {
            const id = videoMatch[1];
            const production = getProduction(id);

            if (!production) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            const videoPath = join(
                getProductionWorkspacePath(id),
                'renders',
                'episode.mp4'
            );

            try {
                const fileInfo = await stat(videoPath);

                res.writeHead(200, {
                    'Content-Type': 'video/mp4',
                    'Content-Length': fileInfo.size,
                    'Access-Control-Allow-Origin': 'http://localhost:5173',
                    'Accept-Ranges': 'bytes'
                });

                const stream = createReadStream(videoPath);

                stream.on('error', (error) => {
                    console.error('Video stream error:', error);
                    res.destroy(error);
                });

                return stream.pipe(res);

            } catch (error) {
                if (error.code === 'ENOENT') {
                    return send(res, 404, {
                        error: 'Video has not been generated yet'
                    });
                }

                throw error;
            }
        }

        // =====================================
        // HISTORIAL
        // GET /productions/:id/events
        // =====================================

        const eventsMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/events$/i
        );

        if (
            req.method === 'GET' &&
            eventsMatch
        ) {
            const production = getProduction(eventsMatch[1]);

            if (!production) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            return send(
                res,
                200,
                getProductionEvents(eventsMatch[1])
            );
        }

        // =====================================
        // CAMBIAR ESTADO DE PRODUCCIÓN
        // PATCH /productions/:id/status
        // =====================================

        const statusMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)\/status$/i
        );

        if (
            req.method === 'PATCH' &&
            statusMatch
        ) {
            const data = await readBody(req);

            const production = updateProductionStatus(
                statusMatch[1],
                data.status
            );

            return send(res, 200, production);
        }

        // =====================================
        // PRODUCCIÓN INDIVIDUAL
        // =====================================

        const productionMatch = pathname.match(
            /^\/productions\/([a-f0-9-]+)$/i
        );

        // Editar producción
        if (
            req.method === 'PUT' &&
            productionMatch
        ) {
            const id = productionMatch[1];

            if (!getProduction(id)) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            const data = await readBody(req);

            const updated = updateProduction(id, {
                title: String(data.title || ''),
                description: String(data.description || ''),
                script: String(data.script || '')
            });

            return send(res, 200, updated);
        }

        // Eliminar producción
        if (
            req.method === 'DELETE' &&
            productionMatch
        ) {
            const id = productionMatch[1];

            if (activeProductions.has(id)) {
                return send(res, 409, {
                    error: 'Cannot delete a production while it is processing'
                });
            }

            const result = deleteProduction(id);

            return send(res, 200, result);
        }

        // Consultar producción individual
        if (
            req.method === 'GET' &&
            productionMatch
        ) {
            const production = getProduction(
                productionMatch[1]
            );

            if (!production) {
                return send(res, 404, {
                    error: 'Production not found'
                });
            }

            return send(res, 200, production);
        }

        // =====================================
        // RUTA NO ENCONTRADA
        // =====================================

        return send(res, 404, {
            error: 'Route not found'
        });

    } catch (error) {
        console.error('API error:', error);

        const status = error.statusCode ||
            (error instanceof SyntaxError ? 400 : 500);

        return send(res, status, {
            error: status === 400
                ? 'Invalid JSON or data'
                : status === 413
                    ? 'Payload too large'
                    : error.message || 'Internal server error'
        });
    }
});

// =====================================
// INICIAR SERVIDOR
// =====================================

server.listen(PORT, HOST, () => {
    console.log(
        `API running at http://${HOST}:${PORT}`
    );
});