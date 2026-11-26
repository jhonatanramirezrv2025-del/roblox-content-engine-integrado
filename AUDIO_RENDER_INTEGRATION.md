# Integración de audio en el render final

## Qué se incorporó

- `produce.js` obtiene las escenas ordenadas y crea un manifiesto temporal de mezcla para cada render de una producción.
- `production-audio-mix-service.js` transforma los tiempos relativos de cada asociación en tiempos globales acumulando `duration_seconds` de las escenas.
- Solo se mezclan recursos asociados con tipo `music`, `sound-effect`, `sound-effects` o `sfx`. La narración generada por Piper permanece como pista principal.
- El volumen maestro y los volúmenes/mutes individuales se leen de `audio-mixer-settings.json`. Las claves individuales siguen siendo el ID de asociación `scene_assets.id`, igual que en `ScenePreview`.
- Los fades se aplican con filtros `afade` de FFmpeg.
- El final del vídeo se limita a la duración real de `narration.wav`. Las pistas adicionales se recortan si exceden ese límite.
- `render.js` mantiene compatibilidad con su invocación anterior de tres argumentos; el manifiesto de mezcla es opcional.
- Al unir escenas, los tiempos de los recursos que pertenecían a la segunda escena se desplazan por la duración de la primera.
- Se corrigió el registro del evento de reordenamiento de escenas para asociarlo a una escena válida (la tabla `scene_events` requiere `scene_id`).

## Cómo funciona la línea de tiempo

Los campos `start_seconds` y `end_seconds` de `scene_assets` se interpretan como tiempos locales a la escena. La posición absoluta se calcula así:

`posición absoluta = suma de duraciones de escenas anteriores + tiempo local`

Si una pista empieza o termina fuera de la duración de la narración, se recorta al intervalo disponible.

## Archivos principales modificados

- `src/produce.js`
- `src/render.js`
- `src/production/production-audio-mix-service.js` (nuevo)
- `src/production/production-scene-service.js`
- `src/server.js`
- `src/generate-voice.js`
- `requirements-voice.txt` (nuevo)

## Ejecución

Desde la raíz del proyecto:

```powershell
npm start
```

En otra terminal, inicia el frontend como lo haces normalmente desde `frontend`.

Para producir una producción:

```powershell
npm run produce -- --production ID_DE_LA_PRODUCCION
```

FFmpeg y ffprobe deben estar instalados y disponibles en `PATH`.

### Entorno Piper

Los entornos virtuales de Python no se distribuyen dentro del ZIP porque dependen del sistema operativo y de la instalación local. Si necesitas recrear el entorno de voz en Windows:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-voice.txt
```

El modelo `models/voices/es_MX-claude-high.onnx` y su archivo JSON se conservan en el proyecto.

## Validaciones realizadas

- Sintaxis JavaScript de los archivos modificados: correcta.
- `tests/test-scene-manager.js`: todas las pruebas superadas.
- Render FFmpeg de prueba con narración, música, efecto, volumen y fades: correcto.
- Render de compatibilidad sin manifiesto (tres argumentos): correcto.
- Ambos renders de prueba mantuvieron una duración de 5 segundos, coincidente con la narración de prueba.

La prueba de render utilizó audios sintéticos y no reemplaza una prueba final con los recursos reales de cada producción en el equipo Windows.
