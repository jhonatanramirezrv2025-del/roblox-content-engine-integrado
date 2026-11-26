
import { spawnSync, execFileSync } from 'node:child_process';
import {
    mkdir,
    writeFile,
    readFile
} from 'node:fs/promises';

import path from 'node:path';

import {
    generateSubtitlesFromSegments
} from './generate-subtitles.js';

import {
    getProduction,
    updateProductionStatus,
    addProductionEvent,
    registerProductionAsset
} from './production/production-service.js';

import {
    getProductionWorkspacePath
} from './production/production-files.js';

import {
    buildProductionAudioMixManifest
} from './production/production-audio-mix-service.js';

import {
    buildProductionVisualManifest
} from './production/production-visual-service.js';

// ======================================================
// ARGUMENTOS
// ======================================================

const args = process.argv.slice(2);

let productionId = null;
let narration = '';
let outputDir = path.resolve('output');

if (args[0] === '--production' && args[1]) {
    productionId = args[1];

    const production = getProduction(productionId);

    if (!production) {
        console.error('No se encontró la producción.');
        process.exit(1);
    }

    narration = production.script;
    outputDir = getProductionWorkspacePath(productionId);

    console.log('\nPRODUCCIÓN SELECCIONADA');
    console.log('Título:', production.title);
    console.log('ID:', production.id);

} else if (args[0] === '--file' && args[1]) {
    narration = await readFile(
        path.resolve(args[1]),
        'utf8'
    );

} else {
    narration = args.join(' ');
}

if (!narration.trim()) {
    console.error(`
Uso:
npm run produce -- --production ID

También puedes utilizar:
npm run produce -- --file guion.txt
npm run produce -- "Texto de narración"
`);
    process.exit(1);
}

// ======================================================
// RUTAS DE PRODUCCIÓN
// ======================================================

const audioDir = path.join(outputDir, 'audio');
const segmentsDir = path.join(audioDir, 'segments');

const subtitlesDir = path.join(outputDir, 'subtitles');
const rendersDir = path.join(outputDir, 'renders');

const audioPath = path.join(
    audioDir,
    'narration.wav'
);

const subtitlePath = path.join(
    subtitlesDir,
    'captions.ass'
);

const videoPath = path.join(
    rendersDir,
    'episode.mp4'
);

const concatPath = path.join(
    audioDir,
    'concat-list.txt'
);

const audioMixPath = path.join(
    audioDir,
    'render-audio-mix.json'
);

const visualManifestPath = path.join(
    outputDir,
    'scenes',
    'render-visuals.json'
);

// ======================================================
// UTILIDADES
// ======================================================

async function prepareDirectories() {
    await Promise.all([
        mkdir(segmentsDir, { recursive: true }),
        mkdir(subtitlesDir, { recursive: true }),
        mkdir(path.join(outputDir, 'scenes'), { recursive: true }),
        mkdir(rendersDir, { recursive: true })
    ]);
}

function runCommand(label, command, commandArgs) {
    console.log(`\n--- ${label} ---`);

    const result = spawnSync(command, commandArgs, {
        stdio: 'inherit'
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`Fallo durante: ${label}`);
    }
}

function splitNarration(text) {
    return text
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
        ?.map(sentence => sentence.trim())
        .filter(Boolean) ?? [];
}

function getAudioDuration(audioFile) {
    const result = execFileSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioFile
    ], {
        encoding: 'utf8'
    }).trim();

    const duration = Number(result);

    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`Duración inválida: ${audioFile}`);
    }

    return duration;
}

// ======================================================
// REGISTRO DE RECURSOS
// ======================================================

function registerAsset(assetType, absolutePath) {
    if (!productionId) return null;

    const relativePath = path
        .relative(process.cwd(), absolutePath)
        .split(path.sep)
        .join('/');

    const asset = registerProductionAsset(
        productionId,
        assetType,
        relativePath
    );

    console.log(
        `Recurso registrado: ${assetType} -> ${relativePath}`
    );

    return asset;
}

// ======================================================
// PRODUCCIÓN
// ======================================================

async function produce() {
    if (productionId) {
        updateProductionStatus(productionId, 'processing');

        addProductionEvent(
            productionId,
            'production_started',
            'Generación audiovisual iniciada'
        );
    }

    await prepareDirectories();

    const sentences = splitNarration(narration);

    if (sentences.length === 0) {
        throw new Error('No se encontraron frases para producir.');
    }

    console.log('\nFRASES IDENTIFICADAS:', sentences.length);

    const segments = [];
    const concatEntries = [];

    let currentTime = 0;

    // --------------------------------------------------
    // GENERAR VOZ
    // --------------------------------------------------

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];

        const filename =
            `segmento-${String(i + 1).padStart(3, '0')}.wav`;

        const segmentPath = path.join(
            segmentsDir,
            filename
        );

        console.log(`\n--- GENERANDO FRAGMENTO ${i + 1} ---`);
        console.log(sentence);

        runCommand(
            `GENERANDO VOZ ${i + 1}`,
            process.execPath,
            [
                'src/generate-voice.js',
                segmentPath,
                sentence
            ]
        );

        const duration = getAudioDuration(segmentPath);

        const segment = {
            text: sentence,
            start: currentTime,
            end: currentTime + duration,
            duration
        };

        segments.push(segment);

        // Registrar cada fragmento de audio
        registerAsset('audio_segment', segmentPath);

        console.log(
            `Duración: ${duration.toFixed(2)} segundos`
        );

        currentTime = segment.end;

        concatEntries.push(
            `file 'segments/${filename}'`
        );
    }

    // --------------------------------------------------
    // UNIR AUDIOS
    // --------------------------------------------------

    console.log('\n--- UNIENDO FRAGMENTOS DE AUDIO ---');

    await writeFile(
        concatPath,
        concatEntries.join('\n'),
        'utf8'
    );

    runCommand('UNIENDO AUDIOS', 'ffmpeg', [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatPath,
        '-c', 'copy',
        audioPath
    ]);

    // Registrar narración completa
    registerAsset('audio_narration', audioPath);

    console.log(
        '\nDuración total:',
        currentTime.toFixed(2),
        'segundos'
    );

    // --------------------------------------------------
    // GENERAR SUBTÍTULOS
    // --------------------------------------------------

    console.log('\n--- GENERANDO SUBTÍTULOS ---');

    await generateSubtitlesFromSegments(
        segments,
        subtitlePath
    );

    // Registrar subtítulos
    registerAsset('subtitles', subtitlePath);

    // --------------------------------------------------
    // RENDERIZAR VÍDEO
    // --------------------------------------------------

    const narrationDuration = getAudioDuration(audioPath);

    const renderArgs = [
        'src/render.js',
        audioPath,
        videoPath,
        subtitlePath
    ];

    if (productionId) {
        const mixManifest = await buildProductionAudioMixManifest(
            productionId,
            narrationDuration
        );

        await writeFile(
            audioMixPath,
            JSON.stringify(mixManifest, null, 2),
            'utf8'
        );

        console.log(
            `[AUDIO MIX] ${mixManifest.tracks.length} pista(s) de música/efectos preparadas.`
        );

        renderArgs.push(audioMixPath);

        const visualManifest = await buildProductionVisualManifest(
            productionId,
            narrationDuration
        );

        await writeFile(
            visualManifestPath,
            JSON.stringify(visualManifest, null, 2),
            'utf8'
        );

        const imageScenes = visualManifest.scenes.filter(scene => scene.imagePath).length;
        console.log(
            `[VISUAL RENDER] ${imageScenes}/${visualManifest.scenes.length} escena(s) con imagen asociada.`
        );
        renderArgs.push(visualManifestPath);
    }

    runCommand(
        'RENDERIZANDO VIDEO',
        process.execPath,
        renderArgs
    );

    // Registrar vídeo final
    registerAsset('video', videoPath);

    // --------------------------------------------------
    // REGISTRAR RESULTADO
    // --------------------------------------------------

    if (productionId) {
        updateProductionStatus(productionId, 'completed');

        addProductionEvent(
            productionId,
            'production_completed',
            'Audio, subtítulos y vídeo generados y registrados correctamente'
        );
    }

    console.log('\n====================================');
    console.log('PRODUCCIÓN COMPLETADA');
    console.log('====================================');

    console.log('Audio:', audioPath);
    console.log('Subtítulos:', subtitlePath);
    console.log('Vídeo:', videoPath);
}

// ======================================================
// EJECUCIÓN Y MANEJO DE ERRORES
// ======================================================

try {
    await produce();

} catch (error) {
    console.error('\nERROR DURANTE LA PRODUCCIÓN:');
    console.error(error);

    if (productionId) {
        try {
            updateProductionStatus(productionId, 'failed');

            addProductionEvent(
                productionId,
                'production_failed',
                error.message
            );

        } catch (databaseError) {
            console.error(
                'No se pudo actualizar el estado:',
                databaseError.message
            );
        }
    }

    process.exitCode = 1;
}
