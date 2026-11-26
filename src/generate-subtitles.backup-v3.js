
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_WORDS_PER_BLOCK = 7;
const MAX_CHARS_PER_LINE = 34;

// Palabras que no deberían quedar aisladas al final de un bloque.
const WEAK_ENDINGS = new Set([
  'a', 'al', 'con', 'de', 'del', 'desde',
  'en', 'entre', 'hacia', 'hasta', 'para',
  'por', 'sobre', 'sin', 'tras', 'y', 'o',
  'que', 'como', 'cuando', 'donde', 'si'
]);

// Palabras que no deberían quedar aisladas al principio.
const WEAK_BEGinnings = new Set([
  'el', 'la', 'los', 'las', 'un', 'una',
  'unos', 'unas', 'mi', 'tu', 'su',
  'este', 'esta', 'estos', 'estas'
]);

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

function normalizeWord(word) {
  return word
    .toLowerCase()
    .replace(/^[¿¡"'“”‘’([{]+|[.,!?;:)"'“”‘’\]}]+$/g, '');
}

function splitIntoCaptionBlocks(text) {
  const words = text.trim().split(/\s+/);

  if (words.length <= MAX_WORDS_PER_BLOCK) {
    return [words];
  }

  const blocks = [];
  let current = [];

  for (let i = 0; i < words.length; i++) {
    current.push(words[i]);

    const currentWord = normalizeWord(words[i]);
    const nextWord = normalizeWord(words[i + 1] ?? '');

    const hasNaturalPause = /[,;:.!?]$/.test(words[i]);
    const reachedLimit = current.length >= MAX_WORDS_PER_BLOCK;

    const nextStartsWeak =
      WEAK_BEGinnings.has(nextWord);

    const currentEndsWeak =
      WEAK_ENDINGS.has(currentWord);

    if (
      current.length >= 3 &&
      (hasNaturalPause || reachedLimit)
    ) {
      if (currentEndsWeak || nextStartsWeak) {
        continue;
      }

      blocks.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    if (blocks.length > 0) {
      const previous = blocks[blocks.length - 1];
      const previousWord = normalizeWord(previous.at(-1));

      if (
        previousWord.length <= 3 ||
        current.length <= 2
      ) {
        blocks[blocks.length - 1] = [
          ...previous,
          ...current
        ];
      } else {
        blocks.push(current);
      }
    } else {
      blocks.push(current);
    }
  }

  return blocks;
}

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
    return (
      `Dialogue: 0,${formatAssTime(block.start)},` +
      `${formatAssTime(block.end)},Default,,0,0,0,,${block.text}`
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
