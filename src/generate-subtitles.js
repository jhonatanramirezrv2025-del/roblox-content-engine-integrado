
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MIN_WORDS = 3;
const MAX_WORDS = 7;
const IDEAL_WORDS = 5;
const MAX_CHARS_PER_LINE = 34;


// Combinaciones que no queremos separar entre subtítulos.
const PROTECTED_PAIRS = [
  ['nuevas', 'posibilidades'],
  ['probablemente', 'no'],
  ['no', 'conocías'],
  ['no', 'depende'],
  ['depende', 'únicamente'],
  ['buena', 'experiencia'],
  ['una', 'vez'],
  ['cada', 'vez'],
  ['durante', 'la'],
  ['por', 'eso'],
  ['más', 'riesgos'],
  ['una', 'noche'],
  ['un', 'poco'],
    ['poco', 'más'],
    ['durante', 'el'],
    ['durante', 'la'],
    ['durante', 'los'],
    ['durante', 'las']
];


// Palabras que conviene mantener unidas a lo que sigue.

const WEAK_ENDINGS = new Set([
  'a', 'al', 'con', 'de', 'del', 'desde',
  'en', 'entre', 'hacia', 'hasta', 'para',
  'por', 'sobre', 'sin', 'tras', 'y', 'o',
  'que', 'como', 'cuando', 'donde', 'si',
  'tu', 'tus', 'mi', 'mis', 'su', 'sus',
  'probablemente', 'especialmente',
  'principalmente', 'no', 'muy', 'más',
  'menos', 'tan', 'cada', 'un', 'una'
]);


// Palabras que conviene no dejar al comienzo de un bloque.
const WEAK_STARTS = new Set([
    'el', 'la', 'los', 'las', 'un', 'una',
    'unos', 'unas', 'y', 'o', 'pero',
    'porque', 'aunque', 'que', 'de', 'del',
    'con', 'para', 'por', 'en', 'sobre',
    'tu', 'tus', 'mi', 'mis', 'su', 'sus',
    'el', 'la', 'los', 'las',
    'este', 'esta', 'estos', 'estas',
    'ese', 'esa', 'esos', 'esas'
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

function endsWithPunctuation(word) {
  return /[,;:.!?]$/.test(word);
}

function calculateLineCount(words) {
  let lines = 1;
  let currentLength = 0;

  for (const word of words) {
    const nextLength = currentLength === 0
      ? word.length
      : currentLength + 1 + word.length;

    if (nextLength > MAX_CHARS_PER_LINE && currentLength > 0) {
      lines++;
      currentLength = word.length;
    } else {
      currentLength = nextLength;
    }
  }

  return lines;
}


function calculateLineBalancePenalty(words) {
  const text = words.join(' ');

  if (text.length <= MAX_CHARS_PER_LINE) {
    return 0;
  }

  let bestDifference = Infinity;

  for (let i = 1; i < words.length; i++) {
    const firstLine = words.slice(0, i).join(' ');
    const secondLine = words.slice(i).join(' ');

    if (
      firstLine.length > MAX_CHARS_PER_LINE ||
      secondLine.length > MAX_CHARS_PER_LINE
    ) {
      continue;
    }

    const difference = Math.abs(
      firstLine.length - secondLine.length
    );

    bestDifference = Math.min(
      bestDifference,
      difference
    );
  }

  return Number.isFinite(bestDifference)
    ? bestDifference * 0.15
    : 10;
}


// Evalúa qué tan natural resulta terminar un bloque en esta posición.


function calculateBoundaryPenalty(words, nextWord) {
  const lastOriginal = words.at(-1);
  const lastWord = normalizeWord(lastOriginal);
  const next = normalizeWord(nextWord ?? '');

  // No separar números de la palabra siguiente.
  if (/^\d+[.,]?$/u.test(lastWord)) {
    return Infinity;
  }

  // Proteger expresiones de dos palabras.
  const protectedPair = PROTECTED_PAIRS.some(
    ([first, second]) =>
      lastWord === first && next === second
  );

  if (protectedPair) {
    return 100;
  }

  // Evitar cortes después de palabras dependientes.
 // Penalización fuerte para artículos y determinantes.
// Evita terminar un subtítulo con estas palabras.
const ARTICLES = new Set([
  'el', 'la', 'los', 'las',
  'un', 'una', 'unos', 'unas',
  'este', 'esta', 'estos', 'estas',
  'ese', 'esa', 'esos', 'esas'
]);

if (ARTICLES.has(lastWord)) {
  return 100;
}

if (WEAK_ENDINGS.has(lastWord)) {
  return 25;
}

  // Evitar comenzar un bloque con palabras débiles.
  if (WEAK_STARTS.has(next)) {
    return 20;
  }

  // Favorecer los cortes después de puntuación.
  if (endsWithPunctuation(lastOriginal)) {
    return -8;
  }

  return 0;
}



// Segmentación global: compara diferentes cortes y elige
// la combinación con menor coste.
function splitIntoCaptionBlocks(text) {
  const words = text.trim().split(/\s+/);
  const count = words.length;

  if (count <= MAX_WORDS) {
    return [words];
  }

  const costs = Array(count + 1).fill(Infinity);
  const previous = Array(count + 1).fill(-1);

  costs[0] = 0;

  for (let end = 1; end <= count; end++) {
    for (
      let size = 1;
      size <= MAX_WORDS && size <= end;
      size++
    ) {
      const start = end - size;
      const block = words.slice(start, end);
      const isFirst = start === 0;
      const isLast = end === count;

      if (!isFirst && size < MIN_WORDS && !isLast) {
        continue;
      }

      const lineCount = calculateLineCount(block);

      if (lineCount > 2) {
        continue;
      }

      let cost = costs[start];

      // Favorece bloques de unas cinco palabras.
      cost += Math.pow(size - IDEAL_WORDS, 2) * 1.2;

      // Penaliza bloques demasiado cortos.
      if (size < MIN_WORDS) {
        cost += 14;
      }

      // Penaliza líneas excesivamente largas.
      const characters = block.join(' ').length;

      if (characters > MAX_CHARS_PER_LINE) {
        cost += 2;
      }
      // Favorece una distribución equilibrada entre líneas.
        cost += calculateLineBalancePenalty(block);

      // Penaliza cortes lingüísticamente incómodos.
      if (!isLast) {
        cost += calculateBoundaryPenalty(
          block,
          words[end]
        );
      }

      // Evita dejar una última palabra demasiado corta.
      if (isLast && size === 1) {
        cost += 10;
      }

      if (cost < costs[end]) {
        costs[end] = cost;
        previous[end] = start;
      }
    }
  }

  if (previous[count] === -1) {
    // Respaldo si no existe una combinación válida.
    const fallback = [];

    for (let i = 0; i < count; i += MAX_WORDS) {
      fallback.push(words.slice(i, i + MAX_WORDS));
    }

    return fallback;
  }

  const blocks = [];
  let position = count;

  while (position > 0) {
    const start = previous[position];

    blocks.unshift(words.slice(start, position));
    position = start;
  }

  return blocks;
}


function wrapText(words) {
  const text = words.join(' ');

  // Si cabe en una línea, no necesita división.
  if (text.length <= MAX_CHARS_PER_LINE) {
    return text;
  }

  let bestSplit = null;
  let bestCost = Infinity;

  // Evaluar todos los posibles puntos de división.
  for (let i = 1; i < words.length; i++) {
    const firstLine = words.slice(0, i).join(' ');
    const secondLine = words.slice(i).join(' ');

    if (
      firstLine.length > MAX_CHARS_PER_LINE ||
      secondLine.length > MAX_CHARS_PER_LINE
    ) {
      continue;
    }

    const lastFirst = normalizeWord(words[i - 1]);
    const firstSecond = normalizeWord(words[i]);

    let cost = Math.abs(
      firstLine.length - secondLine.length
    ) * 0.15;

    // Evitar terminar una línea con artículos,
    // preposiciones o palabras dependientes.
    if (WEAK_ENDINGS.has(lastFirst)) {
      cost += 25;
    }

    // Evitar comenzar la segunda línea
    // con palabras que dependen de lo anterior.
    if (WEAK_STARTS.has(firstSecond)) {
      cost += 20;
    }

    // Favorecer divisiones después de puntuación.
    if (endsWithPunctuation(words[i - 1])) {
      cost -= 5;
    }

    if (cost < bestCost) {
      bestCost = cost;
      bestSplit = i;
    }
  }

  // Respaldo si no encuentra una división válida.
  if (bestSplit === null) {
    return words.join(' ');
  }

  return [
    words.slice(0, bestSplit).join(' '),
    words.slice(bestSplit).join(' ')
  ].join('\\N');
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
