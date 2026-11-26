
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import db from './database.js';

import {
    createProductionWorkspace
} from './production-files.js';

console.log('\n====================================');
console.log(' PREPARACIÓN DE ESPACIOS DE TRABAJO');
console.log('====================================\n');

const productions = db.prepare(`
    SELECT id, title, script
    FROM productions
    ORDER BY created_at ASC
`).all();

let prepared = 0;
let skipped = 0;
let failed = 0;

for (const production of productions) {
    try {
        console.log(`Procesando: ${production.title}`);

        const workspace = createProductionWorkspace({
            id: production.id,
            title: production.title,
            script: production.script
        });

        const existingAsset = db.prepare(`
            SELECT id
            FROM production_assets
            WHERE production_id = ?
            AND asset_type = ?
        `).get(production.id, 'script');

        if (existingAsset) {
            db.prepare(`
                UPDATE production_assets
                SET file_path = ?
                WHERE id = ?
            `).run(
                workspace.relativeScriptPath,
                existingAsset.id
            );

            skipped++;

        } else {
            db.prepare(`
                INSERT INTO production_assets (
                    id,
                    production_id,
                    asset_type,
                    file_path
                )
                VALUES (?, ?, ?, ?)
            `).run(
                randomUUID(),
                production.id,
                'script',
                workspace.relativeScriptPath
            );

            prepared++;
        }

        console.log('  Espacio de trabajo listo.\n');

    } catch (error) {
        failed++;

        console.error(
            `  Error preparando ${production.id}:`,
            error.message
        );
    }
}

console.log('\n====================================');
console.log(' RESULTADO');
console.log('====================================');
console.log(`Producciones encontradas: ${productions.length}`);
console.log(`Archivos registrados: ${prepared}`);
console.log(`Registros actualizados: ${skipped}`);
console.log(`Errores: ${failed}`);
console.log('====================================\n');

if (failed > 0) {
    process.exitCode = 1;
}
