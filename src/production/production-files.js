
import {
    mkdirSync,
    writeFileSync,
    rmSync,
    existsSync
} from 'node:fs';

import path from 'node:path';

// Directorio principal del proyecto
const projectRoot = process.cwd();

// Directorio principal de producciones
const projectsDirectory = path.join(
    projectRoot,
    'projects'
);

// Carpetas que tendrá cada producción
const productionFolders = [
    'script',
    'audio',
    'subtitles',
    'scenes',
    'assets',
    'assets/characters',
    'assets/backgrounds',
    'assets/music',
    'assets/sound-effects',
    'assets/other',
    'renders',
    'clips'
];

/**
 * Crea el espacio de trabajo de una producción.
 * También guarda el guion en un archivo Markdown.
 */
export function createProductionWorkspace({
    id,
    title,
    script
}) {
    if (!id || !title || !script) {
        throw new Error(
            'Se requiere ID, título y guion para crear el espacio de trabajo.'
        );
    }

    const workspacePath = path.join(
        projectsDirectory,
        id
    );

    // Crear directorio principal
    mkdirSync(workspacePath, {
        recursive: true
    });

    // Crear subdirectorios
    for (const folder of productionFolders) {
        mkdirSync(
            path.join(workspacePath, folder),
            { recursive: true }
        );
    }

    // Definir ubicación del guion
    const scriptPath = path.join(
        workspacePath,
        'script',
        'guion.md'
    );

    // Guardar contenido del guion
    const scriptContent = `# ${title}\n\n${script}\n`;

    writeFileSync(
        scriptPath,
        scriptContent,
        'utf8'
    );

    return {
        workspacePath,
        scriptPath,
        relativeScriptPath: path
            .relative(projectRoot, scriptPath)
            .split(path.sep)
            .join('/')
    };
}

/**
 * Elimina el espacio de trabajo de una producción.
 */
export function deleteProductionWorkspace(id) {
    if (!id) {
        throw new Error('Se requiere el ID de la producción.');
    }

    const workspacePath = path.resolve(
        projectsDirectory,
        id
    );

    const resolvedProjectsDirectory = path.resolve(
        projectsDirectory
    );

    // Protección contra eliminación fuera de projects
    if (
        path.dirname(workspacePath) !==
        resolvedProjectsDirectory
    ) {
        throw new Error(
            'Ruta de producción no válida.'
        );
    }

    if (existsSync(workspacePath)) {
        rmSync(workspacePath, {
            recursive: true,
            force: true
        });
    }

    return {
        success: true,
        message: 'Espacio de trabajo eliminado correctamente.'
    };
}

/**
 * Devuelve la ruta del espacio de trabajo.
 */
export function getProductionWorkspacePath(id) {
    if (!id) {
        throw new Error('Se requiere el ID de la producción.');
    }

    return path.join(
        projectsDirectory,
        id
    );
}

/**
 * Devuelve las carpetas necesarias para una producción.
 */
export function getProductionFolders() {
    return [...productionFolders];
}
