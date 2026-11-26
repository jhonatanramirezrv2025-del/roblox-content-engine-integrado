# Roblox Content Engine

Motor local de producción audiovisual para historias y contenido de Roblox. El flujo combina guion, escenas, prompts visuales, imágenes importadas, narración Piper, subtítulos ASS, música/efectos y render vertical con FFmpeg.

## Generación de imágenes con ChatGPT Go (sin API)

Esta versión **no llama a OpenAI Images API** y no requiere `OPENAI_API_KEY`. La suscripción ChatGPT Go se utiliza desde la web de ChatGPT, manualmente: la suscripción de ChatGPT no incluye acceso API ni permite que una aplicación local consuma directamente el cupo de imágenes.

1. Abre una escena en Scene Manager y pulsa **Generar prompt**.
2. Pulsa **Abrir ChatGPT y copiar prompt**. Se abrirá ChatGPT y el prompt quedará copiado.
3. Pégalo en ChatGPT y genera la imagen.
4. Guarda la imagen en el PC como PNG, JPG o WEBP.
5. Vuelve al editor de escena y pulsa **Importar imagen generada**. La imagen se subirá a la biblioteca de la producción y quedará asociada a esa escena.
6. Para importar varias imágenes, usa **Importar imágenes por lote**. Si los nombres contienen `scene-01`, `scene-02` o `escena-01`, `escena-02`, se asignarán por número. Si no, se asignarán en orden alfabético natural a las escenas sin fondo.
7. **Copiar prompts de todas** copia los prompts en un bloque para trabajar escena por escena en ChatGPT. ChatGPT puede aplicar límites de generación gratuitos/por plan; el proyecto no puede aumentarlos ni consultarlos.

No se usa API de pago ni se almacena ninguna clave. La generación de imágenes ocurre dentro de ChatGPT y la importación es manual.

## Requisitos

- Windows 10/11.
- Node.js 20 o superior (probado con Node 24).
- FFmpeg y FFprobe disponibles en `PATH`.
- Python 3.12 recomendado para Piper.
- Modelo Piper `models/voices/es_MX-claude-high.onnx` y su JSON de configuración.
- Frontend instalado con `cd frontend; npm install`.

## Instalación

En la raíz del proyecto, en una terminal: `npm start`. En otra terminal: `cd frontend` y `npm run dev`. Abre `http://localhost:5173`.

### Entorno Piper

```powershell
py -3.12 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-voice.txt
```

Si PowerShell bloquea npm, utiliza `npm.cmd`.

## Flujo de producción

1. Crear una producción y escribir el guion.
2. Abrir Scene Manager y pulsar **Generar escenas**.
3. Pulsar **Generar propuestas visuales** para completar ubicación, personajes, acción, plano, cámara, iluminación y ambiente.
4. Generar y copiar el prompt visual de cada escena.
5. Crear las imágenes en ChatGPT Go y guardarlas localmente.
6. Importar imágenes individualmente o por lote; comprobar que cada imagen esté asociada a la escena correcta.
7. Ajustar tiempos de escenas, música y efectos, volúmenes, mute y fades.
8. Generar la producción desde la aplicación o con `npm run produce -- --production ID_DE_LA_PRODUCCION`.

El MP4 se guarda en `projects/ID_DE_LA_PRODUCCION/renders/episode.mp4`.

## Render visual y audio

- Salida vertical 1080x1920, 30 FPS, H.264/AAC.
- Una imagen principal por escena, priorizando recursos de tipo `background`; si no existe, utiliza una imagen `character` u otra imagen asociada.
- Los tiempos de imagen asociados a la escena se respetan.
- Los subtítulos ASS se superponen a la secuencia visual.
- La narración Piper define la duración final.
- Música y efectos se mezclan con volumen maestro/individual, mute y fades guardados en el mezclador.
- `render.js` conserva compatibilidad con la invocación anterior de tres argumentos.

## Pruebas

```powershell
node tests/test-scene-manager.js
node tests/test-visual-pipeline.js
```

No se necesita clave API para crear prompts, importar imágenes ni renderizar el vídeo.

## Límites actuales

- La generación de imágenes en ChatGPT es manual; no existe una API de ChatGPT Go para automatizarla desde el proyecto.
- Las imágenes generadas son fotogramas estáticos; el sistema no crea modelos 3D animados ni captura gameplay automáticamente.
- La composición usa una imagen principal por escena, no capas separadas de avatar y fondo ni animación de cámara.
- Mantén revisión humana de guion, imágenes, audio y derechos de uso antes de publicar.
