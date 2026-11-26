import { useEffect, useMemo, useRef, useState } from 'react';import {
  ArrowLeft, RefreshCw, Clock3, UserRound, Trees, Music2,
  Volume2, File, Link2, Save, AlertCircle, ZoomIn, ZoomOut, Play, Pause, SkipBack
} from 'lucide-react';
import './SceneTimeline.css';
import ScenePreview from './ScenePreview';

const API = 'http://127.0.0.1:3005';

const tracks = [
  { id: 'character', label: 'Personajes', icon: UserRound, color: 'character' },
  { id: 'background', label: 'Fondos', icon: Trees, color: 'background' },
  { id: 'music', label: 'Música', icon: Music2, color: 'music' },
  { id: 'sound-effect', label: 'Efectos de sonido', icon: Volume2, color: 'sound' },
  { id: 'other', label: 'Otros', icon: File, color: 'other' }
];

const getName = asset =>
  asset.original_name || asset.file_path?.split('/').pop() || 'Recurso';

const formatTime = value => {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)} s` : '—';
};

export default function SceneTimeline({ production, onClose, onNotify }) {
  const [scenes, setScenes] = useState([]);
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [sceneAssets, setSceneAssets] = useState([]);
  const [loadingScenes, setLoadingScenes] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [draftTimes, setDraftTimes] = useState({});

  // Controles de la línea de tiempo
  const [zoom, setZoom] = useState(1);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

// Control del movimiento de los recursos
const dragRef = useRef(null);

  const selectedScene = scenes.find(scene => scene.id === selectedSceneId) || null;
  const duration = Math.max(0, Number(selectedScene?.duration_seconds) || 0);

  async function readJson(response, fallback) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || fallback);
    return data;
  }

  async function loadScenes() {
    try {
      setError('');
      setLoadingScenes(true);
      const response = await fetch(`${API}/productions/${production.id}/scenes`);
      const data = await readJson(response, 'No se pudieron cargar las escenas.');
      const list = Array.isArray(data) ? data : data.scenes || [];
      setScenes(list);
      setSelectedSceneId(current =>
        list.some(scene => scene.id === current) ? current : list[0]?.id || ''
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingScenes(false);
    }
  }

  async function loadSceneAssets(sceneId) {
    if (!sceneId) {
      setSceneAssets([]);
      return;
    }
    try {
      setError('');
      setLoadingAssets(true);
      const response = await fetch(`${API}/scenes/${sceneId}/assets`);
      const data = await readJson(response, 'No se pudieron cargar los recursos de la escena.');
      const list = Array.isArray(data) ? data : data.assets || [];
      setSceneAssets(list);
      setDraftTimes(Object.fromEntries(list.map(asset => {
        let metadata = {};

        try {
            metadata = JSON.parse(asset.metadata_json || '{}');
        } catch {
            metadata = {};
        }

        return [
            asset.id,
            {
                startSeconds: asset.start_seconds == null
                    ? 0
                    : Number(asset.start_seconds),

                endSeconds: asset.end_seconds == null
                    ? (Number(selectedScene?.duration_seconds) || 0)
                    : Number(asset.end_seconds),

                fadeIn: Number(metadata.fadeIn) || 0,
                fadeOut: Number(metadata.fadeOut) || 0
            }
        ];
    })));
    } catch (err) {
      setError(err.message);
      setSceneAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => { loadScenes(); }, [production.id]);
  useEffect(() => {
  setIsPlaying(false);
  setPlayhead(0);
  setSceneAssets([]);
  loadSceneAssets(selectedSceneId);
}, [selectedSceneId]);
  useEffect(() => {
  if (!isPlaying || duration <= 0) return undefined;

  const timer = window.setInterval(() => {
    setPlayhead(current => {
      if (current + 0.05 >= duration) {
        setIsPlaying(false);
        return 0;
      }

      return current + 0.05;
    });
  }, 50);

  return () => window.clearInterval(timer);
}, [isPlaying, duration]);


  const grouped = useMemo(() => {
    const result = {};
    for (const track of tracks) result[track.id] = [];
    for (const asset of sceneAssets) {
      const type = tracks.some(track => track.id === asset.asset_type)
        ? asset.asset_type
        : 'other';
      result[type].push(asset);
    }
    return result;
  }, [sceneAssets]);

  async function saveTiming(asset, valuesOverride) {
    const values = valuesOverride || draftTimes[asset.id];
    
    if (!values) return;

        const start = Number(values.startSeconds);
    const end = Number(values.endSeconds);
    const fadeIn = Number(values.fadeIn) || 0;
    const fadeOut = Number(values.fadeOut) || 0;

    const clipDuration = end - start;

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        !Number.isFinite(fadeIn) ||
        !Number.isFinite(fadeOut) ||
        start < 0 ||
        end <= start ||
        end > duration
    ) {
        setError('Los tiempos del recurso no son válidos.');
        return;
    }

    if (
        fadeIn < 0 ||
        fadeOut < 0 ||
        fadeIn + fadeOut > clipDuration
    ) {
        setError(
            'La suma de Fade In y Fade Out no puede superar la duración del recurso.'
        );
        return;
    }
    try {
      setSavingId(asset.id);
      setError('');
      const response = await fetch(`${API}/scene-assets/${asset.id}/timing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            startSeconds: Number(values.startSeconds),
            endSeconds: Number(values.endSeconds),
            fadeIn: Number(values.fadeIn) || 0,
            fadeOut: Number(values.fadeOut) || 0
        })
      });
      const result = await readJson(
          response,
          'No se pudieron guardar los tiempos.'
      );
        setSceneAssets(current =>
          current.map(item =>
              item.id === asset.id
                  ? {
                      ...item,
                      ...result.association
                  }
                  : item
          )
        );
      onNotify?.('Tiempos del recurso guardados.');
    } catch (err) {
      setError(err.message);
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setSavingId('');
    }
  }

  function changeTime(assetId, field, value) {
    setDraftTimes(previous => ({
      ...previous,
      [assetId]: { ...previous[assetId], [field]: value }
    }));
  }

  function assetUrl(asset) {
    return `${API}/productions/${production.id}/assets/${asset.asset_id}/file`;
  }


const visibleDuration = Math.max(duration, 1) / zoom;

function beginClipDrag(event, asset, mode = 'move') {
  if (event.button !== 0 || duration <= 0) return;

  event.preventDefault();
  event.stopPropagation();

  const current = draftTimes[asset.id] || {
    startSeconds: Number(asset.start_seconds) || 0,
    endSeconds: asset.end_seconds == null
      ? duration
      : Number(asset.end_seconds)
  };

  const lane = event.currentTarget.closest('.timeline-track-lane');

  dragRef.current = {
    asset,
    mode,
    pointerId: event.pointerId,
    originX: event.clientX,
    laneWidth: lane?.getBoundingClientRect().width || 1,
    startSeconds: Number(current.startSeconds),
    endSeconds: Number(current.endSeconds),
    latest: current
  };

  const clip = event.currentTarget.closest('.timeline-clip');

  clip?.setPointerCapture?.(event.pointerId);
}

function moveClipDrag(event, asset) {
  const drag = dragRef.current;

  if (
    !drag ||
    drag.asset.id !== asset.id ||
    drag.pointerId !== event.pointerId
  ) return;

  const delta =
    (event.clientX - drag.originX) /
    drag.laneWidth * visibleDuration;

  let start = drag.startSeconds;
  let end = drag.endSeconds;

  if (drag.mode === 'move') {
    const length = end - start;

    start = Math.max(
      0,
      Math.min(duration - length, start + delta)
    );

    end = start + length;

  } else if (drag.mode === 'left') {
    start = Math.max(
      0,
      Math.min(end - 0.05, start + delta)
    );

  } else {
    end = Math.min(
      duration,
      Math.max(start + 0.05, end + delta)
    );
  }

  const next = {
    startSeconds: Number(start.toFixed(2)),
    endSeconds: Number(end.toFixed(2))
  };

  drag.latest = next;

  setDraftTimes(previous => ({
    ...previous,
    [asset.id]: next
  }));
}

async function finishClipDrag(event, asset) {
  const drag = dragRef.current;

  if (
    !drag ||
    drag.asset.id !== asset.id ||
    drag.pointerId !== event.pointerId
  ) return;

  dragRef.current = null;

  await saveTiming(asset, drag.latest);
}


  const rulerStep =
  duration <= 10 ? 1 :
  duration <= 30 ? 2 : 5;

const rulerMarks = Array.from(
  {
    length: Math.max(
      2,
      Math.floor(visibleDuration / rulerStep) + 1
    )
  },
  (_, index) => index * rulerStep
);

  return (
    <div className="timeline-page">
      <header className="timeline-topbar">
        <button className="timeline-back" onClick={onClose}>
          <ArrowLeft size={17} /> Volver al dashboard
        </button>
        <span>Workspace <b>/</b> {production.title} <b>/</b> Timeline</span>
      </header>

      <main className="timeline-content">
        <div className="timeline-heading">
          <div>
            <div className="timeline-eyebrow"><Clock3 size={14} /> EDICIÓN AUDIOVISUAL</div>
            <h1>Scene Timeline</h1>
            <p>Organiza los recursos audiovisuales de cada escena.</p>
          </div>
          <button className="timeline-refresh" onClick={() => {
            loadScenes();
            if (selectedSceneId) loadSceneAssets(selectedSceneId);
          }}>
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>

        <section className="timeline-scene-picker">
          <label htmlFor="timeline-scene">Escena de la producción</label>
          <select
            id="timeline-scene"
            value={selectedSceneId}
            onChange={event => setSelectedSceneId(event.target.value)}
            disabled={loadingScenes || scenes.length === 0}
          >
            {scenes.length === 0 && <option value="">No hay escenas disponibles</option>}
            {scenes.map(scene => (
              <option key={scene.id} value={scene.id}>
                Escena {scene.scene_number}: {scene.title}
              </option>
            ))}
          </select>
          <div className="timeline-duration">
            <Clock3 size={16} />
            Duración: <strong>{formatTime(duration)}</strong>
          </div>
        </section>

        {error && <div className="timeline-error"><AlertCircle size={16} />{error}</div>}
        {loadingScenes && <p className="timeline-status">Cargando escenas...</p>}
        {!loadingScenes && scenes.length === 0 && !error && (
          <div className="timeline-empty">Esta producción todavía no tiene escenas.</div>
        )}

        {selectedScene && (
          <>
            <section className="timeline-scene-summary">
              <div>
                <span>ESCENA SELECCIONADA</span>
                <h2>{selectedScene.title}</h2>
                <p>{selectedScene.narration_text || 'Esta escena no tiene narración.'}</p>
              </div>
              <div className="timeline-summary-duration">{formatTime(duration)}</div>
            </section>

            <ScenePreview
              production={production}
              scene={selectedScene}
              assets={sceneAssets}
              playhead={playhead}
              duration={duration}
              isPlaying={isPlaying}
            />


            <section className="timeline-transport">
              <div className="timeline-transport-buttons">
                <button onClick={() => {
                  setIsPlaying(false);
                  setPlayhead(0);
                }}>
                  <SkipBack size={16}/>
                </button>

                <button onClick={() => setIsPlaying(value => !value)}>
                  {isPlaying ? <Pause size={16}/> : <Play size={16}/>}
                </button>

                <span>{formatTime(playhead)} / {formatTime(duration)}</span>
              </div>

                        <div className="timeline-zoom">
                          <button
                            onClick={() => setZoom(value => Math.max(1, value / 1.25))}
                            disabled={zoom <= 1}
                          >
                            <ZoomOut size={15}/>
                          </button>

                          <span>{zoom.toFixed(2)}×</span>

                          <button
                            onClick={() => setZoom(value => Math.min(8, value * 1.25))}
                            disabled={zoom >= 8}
                          >
                            <ZoomIn size={15}/>
                          </button>
                        </div>
            </section>


            <section className="timeline-editor">
              <div className="timeline-ruler-row">
                <div className="timeline-track-label">PISTAS</div>
                <div
                  className="timeline-ruler"
                  style={{ '--duration': visibleDuration }}
                >
                  {rulerMarks.map(mark => (
                    <span key={mark} style={{ left: `${(mark / visibleDuration) * 100}%` }}>
                      {mark}s
                    </span>
                  ))}
                </div>
              </div>

              {loadingAssets && <p className="timeline-status">Cargando recursos asociados...</p>}

              {!loadingAssets && tracks.map(track => {
                const Icon = track.icon;
                const items = grouped[track.id] || [];
                return (
                  <div className="timeline-track-row" key={track.id}>
                    <div className="timeline-track-label">
                      <Icon size={16} />
                      <span>{track.label}</span>
                      <small>{items.length}</small>
                    </div>
                    <div className="timeline-track-lane" style={{ '--duration': Math.max(duration, 1) }}>
                      {items.length === 0 && <span className="timeline-no-clip">Sin recursos</span>}
                      {items.map(asset => {
                        const values = draftTimes[asset.id] || {};
                        const start = Math.max(0, Number(values.startSeconds) || 0);
                        const end = Math.max(start, Number(values.endSeconds) || 0);
                        const left = visibleDuration > 0
                        ? Math.min(100, start / visibleDuration * 100)
                        : 0;
                        const width = visibleDuration > 0
                        ? Math.max(
                            1.5,
                            Math.min(
                              100 - left,
                              (end - start) / visibleDuration * 100
                            )
                          )
                        : 8;
                        return (
                          <div
                            className={`timeline-clip ${track.color}`}
                            key={asset.id}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`
                            }}
                            title={`${getName(asset)} · ${formatTime(start)} – ${formatTime(end)}`}
                            onPointerDown={event =>
                              beginClipDrag(event, asset, 'move')
                            }
                            onPointerMove={event =>
                              moveClipDrag(event, asset)
                            }
                            onPointerUp={event =>
                              finishClipDrag(event, asset)
                            }
                            onPointerCancel={event =>
                              finishClipDrag(event, asset)
                            }
                          >
                            <span
                              className="timeline-resize-handle left"
                              onPointerDown={event => {
                                event.stopPropagation();
                                beginClipDrag(event, asset, 'left');
                              }}
                            />

                            {asset.mime_type?.startsWith('image/') && asset.asset_id && (
                              <img
                                src={assetUrl(asset)}
                                alt=""
                                draggable="false"
                              />
                            )}

                            <span className="timeline-clip-name">
                              {getName(asset)}
                            </span>

                            <span
                              className="timeline-resize-handle right"
                              onPointerDown={event => {
                                event.stopPropagation();
                                beginClipDrag(event, asset, 'right');
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="timeline-assets-panel">
              <div className="timeline-panel-heading">
                <div>
                  <h2><Link2 size={17} /> Recursos y tiempos</h2>
                  <p>Define el momento de entrada y salida de cada recurso.</p>
                </div>
                <span>{sceneAssets.length} recursos</span>
              </div>

              {loadingAssets && <p className="timeline-status">Cargando...</p>}
              {!loadingAssets && sceneAssets.length === 0 && (
                <div className="timeline-empty">
                  No hay recursos vinculados. Asócialos primero desde la Biblioteca o Scene Manager.
                </div>
              )}

              <div className="timeline-asset-list">
                {sceneAssets.map(asset => {
                  const Icon = tracks.find(track => track.id === asset.asset_type)?.icon || File;
                  const values = draftTimes[asset.id] || {};
                  return (
                    <article className="timeline-asset-card" key={asset.id}>
                      <div className="timeline-asset-identity">
                        {asset.mime_type?.startsWith('image/') && asset.asset_id ? (
                          <img src={assetUrl(asset)} alt="" />
                        ) : <Icon size={21} />}
                        <div>
                          <strong>{getName(asset)}</strong>
                          <span>{asset.asset_type}</span>
                        </div>
                      </div>
                      <label>
                        Inicio (s)
                        <input
                          type="number"
                          min="0"
                          max={duration}
                          step="0.01"
                          value={values.startSeconds ?? 0}
                          onChange={event => changeTime(asset.id, 'startSeconds', event.target.value)}
                        />
                      </label>
                      <label>
                        Final (s)
                        <input
                          type="number"
                          min="0"
                          max={duration}
                          step="0.01"
                          value={values.endSeconds ?? duration}
                          onChange={event => changeTime(asset.id, 'endSeconds', event.target.value)}
                        />
                      </label>

                      {asset.mime_type?.startsWith('audio/') && (
                          <>
                              <label>
                                  Fade In (s)
                                  <input
                                      type="number"
                                      min="0"
                                      max={Math.max(
    0,
                                          Number(values.endSeconds) -
                                          Number(values.startSeconds) -
                                          (Number(values.fadeOut) || 0)
                                      )}
                                      step="0.1"
                                      value={values.fadeIn ?? 0}
                                      onChange={event =>
                                          changeTime(asset.id, 'fadeIn', event.target.value)
                                      }
                                  />
                              </label>

                              <label>
                                Fade Out (s)
                                <input
                                    type="number"
                                    min="0"
                                    max={Math.max(
                                        0,
                                        Number(values.endSeconds) -
                                        Number(values.startSeconds) -
                                        (Number(values.fadeIn) || 0)
                                    )}
                                    step="0.1"
                                    value={values.fadeOut ?? 0}
                                    onChange={event =>
                                        changeTime(asset.id, 'fadeOut', event.target.value)
                                    }
                                />
                            </label>
                          </>
                      )}

                      <button
                        className="timeline-save"
                        onClick={() => saveTiming(asset)}
                        disabled={savingId === asset.id}
                      >
                        <Save size={15} /> {savingId === asset.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
