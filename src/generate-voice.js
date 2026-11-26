
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(
    'Uso: npm run voice -- ruta/salida.wav "Texto"'
  );
  process.exit(1);
}

const [outputPath, ...textParts] = args;

const originalText = textParts.join(' ');

async function resolvePython() {
  const candidates = [
    path.resolve('.venv/Scripts/python.exe'),
    path.resolve('.venv/bin/python'),
    process.env.PYTHON || 'python'
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Probar el siguiente intérprete disponible.
    }
  }

  return 'python';
}

const python = await resolvePython();
const dictionaryPath = 'data/pronunciation-dictionary.json';

await mkdir(path.dirname(outputPath), {
  recursive: true
});

const dictionary = JSON.parse(
  await readFile(dictionaryPath, 'utf8')
);

let narrationText = originalText;

for (const [word, pronunciation] of Object.entries(dictionary)) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

  narrationText = narrationText.replace(regex, pronunciation);
}

console.log('Generando narracion...');
console.log('Texto original:', originalText);
console.log('Texto adaptado:', narrationText);

const result = spawnSync(
  python,
  [
    '-m', 'piper',
    '--data-dir', 'models/voices',
    '-m', 'es_MX-claude-high',
    '-f', outputPath,
    '--',
    narrationText
  ],
  { stdio: 'inherit' }
);

if (result.error || result.status !== 0) {
  console.error('Error generando la voz.');
  process.exit(1);
}

console.log('Audio generado:', outputPath);
