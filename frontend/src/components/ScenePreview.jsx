
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageOff,
  MonitorPlay,
  Volume2,
  VolumeX,
  Mic2,
  Music2,
  SlidersHorizontal
} from 'lucide-react';
import './ScenePreview.css';

const API = 'http://127.0.0.1:3005';

function getAssetUrl(productionId, asset) {
  if (!productionId || !asset.asset_id) return '';
  return `${API}/productions/${productionId}/assets/${asset.asset_id}/file`;
}

function getAssetName(asset) {
  return asset.original_name || 'Recurso sin nombre';
}

function getAudioCategory(asset) {
  const type = String(asset.asset_type || '')
    .toLowerCase()
    .replaceAll('_', '-');

  if (
    type.includes('narration') ||
    type.includes('voice') ||
    type.includes('dialogue') ||
    type.includes('speech')
  ) {
    return 'narration';
  }

  if (type.includes('music')) {
    return 'music';
  }

  if (
    type.includes('sound-effect') ||
    type.includes('sound-effect') ||
    type === 'sfx' ||
    type.includes('effect')
  ) {
    return 'effects';
  }

  return 'other';
}

const audioCategoryInfo = {
  narration: {
    label: 'Narración',
    icon: Mic2
  },
  music: {
    label: 'Música',
    icon: Music2
  },
  effects: {
    label: 'Efectos de sonido',
    icon: Volume2
  },
  other: {
    label: 'Otros audios',
    icon: SlidersHorizontal
  }
};

export default function ScenePreview({
  production,
  scene,
  assets = [],
  playhead = 0,
  duration = 0,
  isPlaying = false
}) {
  const currentTime = Number(playhead) || 0;
  const audioRefs = useRef({});

  // Mezclador: valores expresados de 0 a 100.
  const [masterVolume, setMasterVolume] = useState(100);
  const [masterMuted, setMasterMuted] = useState(false);
  const [assetVolumes, setAssetVolumes] = useState({});
  const [mutedAssets, setMutedAssets] = useState({});

  // Identifica la producción cuya configuración ya se cargó.
const [settingsLoadedFor, setSettingsLoadedFor] = useState(null);

  const activeAssets = useMemo(() => {
    return assets.filter(asset => {
      const start = asset.start_seconds == null
        ? 0
        : Number(asset.start_seconds);

      const end = asset.end_seconds == null
        ? Number(duration)
        : Number(asset.end_seconds);

      return (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        currentTime >= start &&
        currentTime < end
      );
    });
  }, [assets, currentTime, duration]);

  const background = activeAssets
    .filter(asset =>
      asset.asset_type === 'background' &&
      asset.mime_type?.startsWith('image/') &&
      asset.asset_id
    )
    .at(-1);

  const characters = activeAssets.filter(asset =>
    asset.asset_type === 'character' &&
    asset.mime_type?.startsWith('image/') &&
    asset.asset_id
  );

  const audioAssets = useMemo(() => {
    return assets.filter(asset =>
      asset.mime_type?.startsWith('audio/') &&
      asset.asset_id
    );
  }, [assets]);

  const activeAudio = useMemo(() => {
    return audioAssets.filter(asset => {
      const start = asset.start_seconds == null
        ? 0
        : Number(asset.start_seconds);

      const end = asset.end_seconds == null
        ? Number(duration)
        : Number(asset.end_seconds);

      return currentTime >= start && currentTime < end;
    });
  }, [audioAssets, currentTime, duration]);

  const groupedAudio = useMemo(() => {
    const groups = {
      narration: [],
      music: [],
      effects: [],
      other: []
    };

    audioAssets.forEach(asset => {
      const category = getAudioCategory(asset);
      groups[category].push(asset);
    });

    return groups;
  }, [audioAssets]);

  // Cargar configuración del mezclador al abrir una producción.
useEffect(() => {
  const productionId = production?.id;

  if (!productionId) return;

  let cancelled = false;

  setSettingsLoadedFor(null);

  // Valores iniciales mientras se carga la configuración.
  setMasterVolume(100);
  setMasterMuted(false);
  setAssetVolumes({});
  setMutedAssets({});

  async function loadMixerSettings() {
    try {
      const response = await fetch(
        `${API}/productions/${productionId}/audio-mixer-settings`
      );

      if (!response.ok) {
        throw new Error('No se pudo cargar la configuración del mezclador.');
      }

      const settings = await response.json();

      if (cancelled) return;

      setMasterVolume(settings.masterVolume ?? 100);
      setMasterMuted(settings.masterMuted ?? false);
      setAssetVolumes(settings.assetVolumes ?? {});
      setMutedAssets(settings.mutedAssets ?? {});

      setSettingsLoadedFor(productionId);

      console.log('Configuración del mezclador cargada.');
    } catch (error) {
      console.error('Error cargando el mezclador:', error);
    }
  }

  loadMixerSettings();

  return () => {
    cancelled = true;
  };
}, [production?.id]);

// Guardar automáticamente los cambios del mezclador.
useEffect(() => {
  const productionId = production?.id;

  // No guardar hasta terminar de cargar la configuración.
  if (!productionId || settingsLoadedFor !== productionId) {
    return;
  }

  const settings = {
    masterVolume,
    masterMuted,
    assetVolumes,
    mutedAssets
  };

  const timeoutId = setTimeout(async () => {
    try {
      const response = await fetch(
        `${API}/productions/${productionId}/audio-mixer-settings`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(settings)
        }
      );

      if (!response.ok) {
        throw new Error('No se pudo guardar la configuración del mezclador.');
      }

      console.log('Configuración del mezclador guardada.');
    } catch (error) {
      console.error('Error guardando el mezclador:', error);
    }
  }, 500);

  return () => clearTimeout(timeoutId);
}, [
  production?.id,
  settingsLoadedFor,
  masterVolume,
  masterMuted,
  assetVolumes,
  mutedAssets
]);

  function getVolume(asset) {
    return assetVolumes[asset.id] ?? 100;
  }

  function isAssetMuted(asset) {
    return Boolean(mutedAssets[asset.id]);
  }

  function changeAssetVolume(assetId, value) {
    setAssetVolumes(previous => ({
      ...previous,
      [assetId]: Number(value)
    }));
  }

  function toggleAssetMute(assetId) {
    setMutedAssets(previous => ({
      ...previous,
      [assetId]: !previous[assetId]
    }));
  }

  // Sincronización y mezcla de audio.
  useEffect(() => {
    const activeIds = new Set(activeAudio.map(asset => asset.id));

    audioAssets.forEach(asset => {
      const audio = audioRefs.current[asset.id];
      if (!audio) return;

      const start = asset.start_seconds == null
        ? 0
        : Number(asset.start_seconds);

      const end = asset.end_seconds == null
        ? Number(duration)
        : Number(asset.end_seconds);

        const isActive = activeIds.has(asset.id);

        let metadata = {};

        try {
            metadata = JSON.parse(asset.metadata_json || '{}');
        } catch {
            metadata = {};
        }

        const fadeIn = Math.max(0, Number(metadata.fadeIn) || 0);
        const fadeOut = Math.max(0, Number(metadata.fadeOut) || 0);

        const clipDuration = end - start;
        const elapsed = currentTime - start;
        const remaining = end - currentTime;

        let fadeMultiplier = 1;

        if (fadeIn > 0 && elapsed < fadeIn) {
            fadeMultiplier = Math.min(
                fadeMultiplier,
                elapsed / fadeIn
            );
        }

        if (fadeOut > 0 && remaining < fadeOut) {
            fadeMultiplier = Math.min(
                fadeMultiplier,
                remaining / fadeOut
            );
        }

        const individualVolume = getVolume(asset) / 100;
        const globalVolume = masterVolume / 100;

        audio.volume = Math.max(
            0,
            Math.min(
                1,
                individualVolume * globalVolume * fadeMultiplier
            )
        );

      audio.muted = masterMuted || isAssetMuted(asset);

      if (!isPlaying || !isActive) {
        audio.pause();

        const expectedTime = Math.max(0, currentTime - start);

        if (
          Number.isFinite(expectedTime) &&
          Math.abs(audio.currentTime - expectedTime) > 0.25
        ) {
          try {
            audio.currentTime = expectedTime;
          } catch {
            // Se ajustará cuando estén disponibles los metadatos.
          }
        }

        return;
      }

      const expectedTime = Math.max(0, currentTime - start);

      if (
        Number.isFinite(expectedTime) &&
        Math.abs(audio.currentTime - expectedTime) > 0.35
      ) {
        try {
          audio.currentTime = expectedTime;
        } catch {
          // Se corregirá cuando el navegador cargue el audio.
        }
      }

      if (!audio.ended && audio.paused) {
        audio.play().catch(() => {
          console.warn(
            `No se pudo reproducir: ${getAssetName(asset)}`
          );
        });
      }

      if (audio.currentTime >= end - start) {
        audio.pause();
      }
    });
  }, [
    audioAssets,
    activeAudio,
    currentTime,
    duration,
    isPlaying,
    masterVolume,
    masterMuted,
    assetVolumes,
    mutedAssets
  ]);

  const hasVisuals = Boolean(background) || characters.length > 0;

  return (
    <section className="scene-preview-panel">
      <div className="scene-preview-heading">
        <div>
          <h2>
            <MonitorPlay size={18} />
            Monitor de previsualización
          </h2>
          <p>
            Composición visual y reproducción de audio de la escena.
          </p>
        </div>

        <span className="scene-preview-resolution">16:9</span>
      </div>

      <div className="scene-preview-stage">
        {background && (
          <img
            className="scene-preview-background"
            src={getAssetUrl(production.id, background)}
            alt={getAssetName(background)}
            draggable={false}
          />
        )}

        {characters.length > 0 && (
          <div className="scene-preview-characters">
            {characters.map(asset => (
              <img
                key={asset.id}
                className="scene-preview-character"
                src={getAssetUrl(production.id, asset)}
                alt={getAssetName(asset)}
                title={getAssetName(asset)}
                draggable={false}
              />
            ))}
          </div>
        )}

        {!hasVisuals && (
          <div className="scene-preview-placeholder">
            <ImageOff size={34} />
            <strong>Sin recursos visuales activos</strong>
            <span>
              Vincula fondos o personajes a esta escena
              y configura sus tiempos.
            </span>
          </div>
        )}

        <div className="scene-preview-overlay">
          <span>{scene?.title || 'Escena'}</span>
          <span>{currentTime.toFixed(2)} s</span>
        </div>
      </div>

      <section className="scene-audio-mixer">
        <div className="scene-audio-mixer-heading">
          <div>
            <h3>
              <SlidersHorizontal size={16} />
              Mezclador de audio
            </h3>
            <p>Controla el volumen de cada recurso.</p>
          </div>

          <span>
            {activeAudio.length} / {audioAssets.length} activos
          </span>
        </div>

        <div className="scene-master-volume">
          <div className="scene-mixer-label">
            <Volume2 size={17} />
            <strong>Volumen maestro</strong>
            <span>{masterVolume}%</span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={masterVolume}
            onChange={event =>
              setMasterVolume(Number(event.target.value))
            }
            aria-label="Volumen maestro"
          />

          <button
            type="button"
            className={`scene-mute-button ${masterMuted ? 'muted' : ''}`}
            onClick={() => setMasterMuted(value => !value)}
            title={masterMuted ? 'Activar audio general' : 'Silenciar todo'}
          >
            {masterMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            {masterMuted ? 'Activar todo' : 'Silenciar todo'}
          </button>
        </div>

        {audioAssets.length === 0 ? (
          <p className="scene-mixer-empty">
            No hay archivos de audio asociados a esta escena.
          </p>
        ) : (
          <div className="scene-mixer-groups">
            {Object.entries(groupedAudio).map(([category, items]) => {
              if (items.length === 0) return null;

              const info = audioCategoryInfo[category];
              const CategoryIcon = info.icon;

              return (
                <div className="scene-mixer-group" key={category}>
                  <div className="scene-mixer-group-heading">
                    <CategoryIcon size={15} />
                    <strong>{info.label}</strong>
                    <span>{items.length}</span>
                  </div>

                  {items.map(asset => {
                    const active = activeAudio.some(
                      item => item.id === asset.id
                    );

                    const muted = isAssetMuted(asset);

                    return (
                      <div
                        className="scene-mixer-item"
                        key={asset.id}
                      >
                        <div className="scene-mixer-item-top">
                          <span className="scene-mixer-item-name">
                            {getAssetName(asset)}
                          </span>

                          <span className={active ? 'audio-active' : ''}>
                            {active ? 'Activo' : 'En espera'}
                          </span>
                        </div>

                        <div className="scene-mixer-item-controls">
                          <button
                            type="button"
                            className={`scene-mute-button ${muted ? 'muted' : ''}`}
                            onClick={() => toggleAssetMute(asset.id)}
                            title={muted ? 'Activar recurso' : 'Silenciar recurso'}
                            aria-label={
                              muted
                                ? `Activar ${getAssetName(asset)}`
                                : `Silenciar ${getAssetName(asset)}`
                            }
                          >
                            {muted
                              ? <VolumeX size={16} />
                              : <Volume2 size={16} />
                            }
                          </button>

                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={getVolume(asset)}
                            onChange={event =>
                              changeAssetVolume(asset.id, event.target.value)
                            }
                            aria-label={`Volumen de ${getAssetName(asset)}`}
                          />

                          <span className="scene-mixer-volume-value">
                            {getVolume(asset)}%
                          </span>
                        </div>

                        <audio
                          ref={element => {
                            if (element) {
                              audioRefs.current[asset.id] = element;
                            } else {
                              delete audioRefs.current[asset.id];
                            }
                          }}
                          src={getAssetUrl(production.id, asset)}
                          preload="auto"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="scene-preview-footer">
        <span>
          {activeAssets.length} recurso(s) visual(es) y general(es) activos
        </span>
        <span>
          {currentTime.toFixed(2)} / {Number(duration).toFixed(2)} s
        </span>
      </div>
    </section>
  );
}
