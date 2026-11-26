# Flujo visual y de vídeo sin API de imágenes

## Crear imágenes con ChatGPT Go

La aplicación genera un prompt por escena a partir de la narración y la dirección visual. En el editor, usa **Abrir ChatGPT y copiar prompt**, pega el texto en ChatGPT, genera la imagen y guárdala localmente. Luego usa **Importar imagen generada** para subirla y asociarla automáticamente a la escena.

Para varias escenas, **Copiar prompts de todas** copia el bloque de prompts. Genera y guarda una imagen por escena. El nombre `scene-01.png`, `scene-02.png` o `escena-01.png` permite asociar automáticamente cada archivo al número de escena correspondiente. Si no hay número en el nombre, el importador usa orden alfabético natural y escenas que no tengan fondo.

La importación utiliza el endpoint de recursos de la producción y la asociación existente de `scene_assets`. Admite PNG, JPEG, WEBP y GIF, con límite de 25 MB por archivo.

## Límite de ChatGPT Go

ChatGPT Go no proporciona una API para que un programa local llame a la generación de imágenes con la cuota del plan. Por eso la generación se hace en la interfaz de ChatGPT y la importación se hace desde Scene Manager. No se requiere `OPENAI_API_KEY`, ni hay llamadas al endpoint de imágenes de OpenAI en este flujo. Los límites de generación de ChatGPT dependen del plan y de la disponibilidad del servicio.

## Render

El render visual utiliza las imágenes asociadas a cada escena y compone el vídeo vertical con FFmpeg. La narración Piper determina la duración final. Música, efectos, volumen, mute y fades se mezclan según el timeline y los ajustes de la producción.
