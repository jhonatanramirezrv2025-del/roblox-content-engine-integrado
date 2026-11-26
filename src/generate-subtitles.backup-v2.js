
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_WORDS_PER_BLOCK = 7;
const MAX_CHARS_PER_LINE = 34;

function formatAssTime(seconds) {
  const total = Math.round(seconds * 100);

  const hours = Math.floor(total / 360000);
  const minutes = Math.floor((total % 360000) / 6000);
  const secs = Math.floor((total % 6000) / 100);
  const centiseconds = total % 100;

  return [
    String(hours),
    String(minutes).padStart(2, '0'),
    `${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
  ].join(':');
}

// Divide una frase larga en bloques equilibrados.
function splitIntoCaptionBlocks(text) {
  const words = text.trim().split(/\s+/);

  if (words.length <= MAX_WORDS_PER_BLOCK) {
    return [words];
  }

  const blockCount = Math.ceil(
    words.length / MAX_WORDS_PER_BLOCK
  );

  const baseSize = Math.floor(words.length / blockCount);
  const remainder = words.length % blockCount;

  const blocks = [];
  let position = 0;

  for (let i = 0; i < blockCount; i++) {
    const blockSize = baseSize + (i < remainder ? 1 : 0);

    blocks.push(words.slice(position, position + blockSize));
    position += blockSize;
  }

  return blocks;
}

// Organiza cada bloque en un máximo habitual de dos líneas.
function wrapText(words) {
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine
      ? `${currentLine} ${word}`
      : word;

    if (
      candidate.length > MAX_CHARS_PER_LINE &&
      currentLine
    ) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\\N');
}

// Distribuye el tiempo de cada frase entre sus bloques.
// Es una estimación proporcional por cantidad de palabras.
function createTimedBlocks(segment) {
  const blocks = splitIntoCaptionBlocks(segment.text);

  const totalWords = blocks.reduce(
    (total, block) => total + block.length,
    0
  );

  let currentTime = segment.start;

  return blocks.map((words, index) => {
    const duration =
      (segment.end - segment.start) *
      words.length / totalWords;

    const start = currentTime;
    const end = index === blocks.length - 1
      ? segment.end
      : currentTime + duration;

    currentTime = end;

    return {
      start,
      end,
      text: wrapText(words)
    };
  });
}

export async function generateSubtitlesFromSegments(
  segments,
  outputPath
) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error(
      'Se necesitan fragmentos para generar subtítulos.'
    );
  }

  const captionBlocks = segments.flatMap(
    createTimedBlocks
  );

  const events = captionBlocks.map(block => {
    const start = formatAssTime(block.start);
    const end = formatAssTime(block.end);

    return (
      `Dialogue: 0,${start},${end},Default,,0,0,0,,${block.text}`
    );
  });

  const assContent = `[Script Info]
Title: Roblox Content Engine
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,2,100,100,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;

  await mkdir(path.dirname(outputPath), {
    recursive: true
  });

  await writeFile(outputPath, assContent, 'utf8');

  console.log(
    `Subtítulos generados: ${captionBlocks.length} bloques`
  );

  console.log('Archivo:', outputPath);
}
