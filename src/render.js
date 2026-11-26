import { spawnSync, execFileSync } from 'node:child_process';
import { mkdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 3 || args.length > 5) {
    console.error('Uso: node src/render.js audio.wav video.mp4 subtitulos.ass [audio-mix.json] [visual-manifest.json]');
    process.exit(1);
}

const [audioInput, videoOutput, subtitleInput, audioMixInput, visualManifestInput] = args;
const audioPath = path.resolve(audioInput);
const outputPath = path.resolve(videoOutput);
const subtitlePath = path.resolve(subtitleInput);
const fontPath = path.resolve('assets/arial.ttf');

function escapeFilterPath(filePath) {
    return path.resolve(filePath)
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/,/g, '\\,')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
}

function getAudioDuration(filePath) {
    const result = execFileSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ], { encoding: 'utf8' }).trim();
    const duration = Number(result);
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`Duración de audio inválida: ${filePath}`);
    }
    return duration;
}

function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

const narrationDuration = getAudioDuration(audioPath);
let audioManifest = { tracks: [] };
let visualManifest = null;

if (audioMixInput) {
    audioManifest = JSON.parse(await readFile(path.resolve(audioMixInput), 'utf8'));
    if (!Array.isArray(audioManifest.tracks)) {
        throw new Error('El manifiesto de mezcla no contiene una lista tracks válida.');
    }
}

if (visualManifestInput) {
    visualManifest = JSON.parse(await readFile(path.resolve(visualManifestInput), 'utf8'));
    if (!Array.isArray(visualManifest.scenes)) {
        throw new Error('El manifiesto visual no contiene una lista scenes válida.');
    }
}

await mkdir(path.dirname(outputPath), { recursive: true });

// Input 0: fondo de respaldo. Input 1: narración. Inputs siguientes: pistas de audio.
const ffmpegArgs = [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=0x18233e:s=1080x1920:r=30',
    '-i', audioPath
];

for (const track of audioManifest.tracks) {
    await access(track.filePath);
    ffmpegArgs.push('-i', track.filePath);
}

const filterParts = [];
filterParts.push(
    '[1:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[narration]'
);

const mixInputs = ['[narration]'];
audioManifest.tracks.forEach((track, index) => {
    const inputIndex = index + 2;
    const label = `track${index}`;
    const duration = safeNumber(track.duration);
    const start = Math.max(0, safeNumber(track.start));
    const delayMs = Math.max(0, Math.round(start * 1000));
    const volume = Math.max(0, Math.min(1, safeNumber(track.volume)));
    const fadeIn = Math.max(0, Math.min(duration, safeNumber(track.fadeIn)));
    const fadeOut = Math.max(0, Math.min(duration - fadeIn, safeNumber(track.fadeOut)));
    if (duration <= 0) throw new Error(`Duración inválida en pista ${track.associationId || index}.`);

    const filters = [
        `atrim=start=0:duration=${duration.toFixed(6)}`,
        'asetpts=PTS-STARTPTS',
        'aresample=48000',
        'aformat=sample_fmts=fltp:channel_layouts=stereo',
        `volume=${volume.toFixed(6)}`
    ];
    if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${fadeIn.toFixed(6)}`);
    if (fadeOut > 0) {
        filters.push(`afade=t=out:st=${Math.max(0, duration - fadeOut).toFixed(6)}:d=${fadeOut.toFixed(6)}`);
    }
    filters.push(`adelay=${delayMs}:all=1`);
    filterParts.push(`[${inputIndex}:a:0]${filters.join(',')}[${label}]`);
    mixInputs.push(`[${label}]`);
});

if (mixInputs.length === 1) {
    filterParts.push(`[narration]atrim=duration=${narrationDuration.toFixed(6)},asetpts=PTS-STARTPTS[aout]`);
} else {
    filterParts.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0,` +
        `atrim=duration=${narrationDuration.toFixed(6)},asetpts=PTS-STARTPTS[aout]`
    );
}

// Construir una secuencia de imágenes por escena. Si una escena no tiene imagen,
// se utiliza el fondo de respaldo. La duración final siempre queda limitada por la voz.
const visualScenes = (visualManifest?.scenes || [])
    .map(scene => ({
        ...scene,
        duration: Math.max(0, Math.min(safeNumber(scene.duration), narrationDuration - Math.max(0, safeNumber(scene.start))))
    }))
    .filter(scene => scene.duration > 0);

const visualLabels = [];
let nextInputIndex = audioManifest.tracks.length + 2;

if (visualScenes.length) {
    for (let index = 0; index < visualScenes.length; index++) {
        const scene = visualScenes[index];
        let inputIndex = 0;
        if (scene.imagePath) {
            const imagePath = path.resolve(scene.imagePath);
            await access(imagePath);
            ffmpegArgs.push('-loop', '1', '-framerate', '30', '-t', scene.duration.toFixed(6), '-i', imagePath);
            inputIndex = nextInputIndex++;
        }
        const label = `vscene${index}`;
        const duration = scene.duration.toFixed(6);
        filterParts.push(
            `[${inputIndex}:v:0]scale=1080:1920:force_original_aspect_ratio=increase,` +
            `crop=1080:1920,fps=30,setsar=1,trim=duration=${duration},` +
            `setpts=PTS-STARTPTS,format=yuv420p[${label}]`
        );
        visualLabels.push(`[${label}]`);
    }
    if (visualLabels.length === 1) {
        filterParts.push(`${visualLabels[0]}null[vbase]`);
    } else {
        filterParts.push(`${visualLabels.join('')}concat=n=${visualLabels.length}:v=1:a=0[vbase]`);
    }
} else {
    filterParts.push(`[0:v:0]fps=30,trim=duration=${narrationDuration.toFixed(6)},setpts=PTS-STARTPTS,format=yuv420p[vbase]`);
}

const escapedFontPath = escapeFilterPath(fontPath);
const escapedSubtitlePath = escapeFilterPath(subtitlePath);
const drawText = [
    `drawtext=fontfile='${escapedFontPath}'`,
    "text='ROBLOX CONTENT ENGINE'",
    'fontcolor=white', 'fontsize=42', 'x=(w-text_w)/2', 'y=160'
].join(':');
filterParts.push(`[vbase]${drawText},subtitles=filename='${escapedSubtitlePath}'[vout]`);

ffmpegArgs.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', narrationDuration.toFixed(6),
    '-shortest',
    outputPath
);

console.log('\nIniciando renderizado...');
console.log('Audio de narración:', audioPath);
console.log('Duración final:', narrationDuration.toFixed(2), 'segundos');
console.log('Pistas adicionales:', audioManifest.tracks.length);
console.log('Escenas visuales:', visualScenes.length);
console.log('Escenas con imagen:', visualScenes.filter(scene => scene.imagePath).length);
console.log('Subtítulos:', subtitlePath);
console.log('Salida:', outputPath);

const result = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
if (result.error) {
    console.error('No se pudo ejecutar FFmpeg:', result.error.message);
    process.exit(1);
}
if (result.status !== 0) {
    console.error('El renderizado falló.');
    process.exit(result.status ?? 1);
}
console.log('\nVídeo generado correctamente:', outputPath);
