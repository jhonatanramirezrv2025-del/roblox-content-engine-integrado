
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Upload, Search, Image as ImageIcon, Music2, Video,
  File, UserRound, Trees, Volume2, FolderOpen, X, RefreshCw,
  Link2, Unlink, LoaderCircle, CheckCircle2
} from 'lucide-react';
import './AssetManager.css';

const API = 'http://127.0.0.1:3005';

const categories = [
  { id: 'all', label: 'Todos', types: null, icon: FolderOpen },
  { id: 'characters', label: 'Personajes', types: ['character'], icon: UserRound },
  { id: 'backgrounds', label: 'Fondos', types: ['background'], icon: Trees },
  { id: 'music', label: 'Música', types: ['music'], icon: Music2 },
  { id: 'sound-effects', label: 'Efectos de sonido', types: ['sound-effect'], icon: Volume2 },
  { id: 'other', label: 'Otros', types: ['other', 'script'], icon: File },
];

const sizeLabel = n => !n
  ? 'Tamaño no disponible'
  : n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

const iconFor = asset =>
  asset.mime_type?.startsWith('image/') ? ImageIcon
    : asset.mime_type?.startsWith('audio/') ? Music2
      : asset.mime_type?.startsWith('video/') ? Video
        : File;

export default function AssetManager({ production, onClose, onNotify }) {
  const [assets, setAssets] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const [sceneAssociations, setSceneAssociations] = useState([]);
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [associationsLoading, setAssociationsLoading] = useState(false);
  const [associationSaving, setAssociationSaving] = useState(false);
  const [detachingId, setDetachingId] = useState(null);

  const fileInput = useRef(null);

  async function loadAssets() {
    try {
      setError('');
      const response = await fetch(`${API}/productions/${production.id}/assets`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron cargar los recursos.');
      }

      setAssets(Array.isArray(data) ? data : data.assets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadScenes() {
    try {
      setScenesLoading(true);

      const response = await fetch(`${API}/productions/${production.id}/scenes`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron cargar las escenas.');
      }

      setScenes(Array.isArray(data) ? data : data.scenes || []);
    } catch (err) {
      onNotify?.(`Error cargando escenas: ${err.message}`);
    } finally {
      setScenesLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
    loadScenes();
  }, [production.id]);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    let category = activeCategory;

    if (!['characters', 'backgrounds', 'music', 'sound-effects', 'other'].includes(category)) {
      category = file.type.startsWith('image/')
        ? 'characters'
        : file.type.startsWith('audio/')
          ? 'music'
          : 'other';
    }

    try {
      setUploading(true);

      const response = await fetch(
        `${API}/productions/${production.id}/assets/upload?category=${encodeURIComponent(category)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            'X-File-Type': file.type || 'application/octet-stream',
          },
          body: file,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo subir el archivo.');
      }

      await loadAssets();
      onNotify?.('Recurso subido correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  const filtered = useMemo(() => {
    const selected = categories.find(category => category.id === activeCategory);

    return assets.filter(asset => {
      const name = asset.original_name || asset.file_path?.split('/').pop() || '';

      return (
        (!selected?.types || selected.types.includes(asset.asset_type)) &&
        name.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [assets, activeCategory, search]);

  const url = asset =>
    `${API}/productions/${production.id}/assets/${asset.id}/file`;

  const count = prefix =>
    assets.filter(asset => asset.mime_type?.startsWith(prefix)).length;

  // Cargar las asociaciones del recurso seleccionado.
  async function loadAssetAssociations(asset) {
    if (!asset) return;

    try {
      setAssociationsLoading(true);
      setSceneAssociations([]);

      const results = await Promise.all(
        scenes.map(async scene => {
          const response = await fetch(`${API}/scenes/${scene.id}/assets`);

          if (!response.ok) {
            throw new Error(`No se pudieron consultar los recursos de ${scene.title}.`);
          }

          const data = await response.json();
          const sceneAssets = Array.isArray(data) ? data : data.assets || [];

          return sceneAssets
            .filter(item => item.asset_id === asset.id)
            .map(item => ({
              ...item,
              scene_title: scene.title || `Escena ${scene.scene_number}`,
              scene_number: scene.scene_number,
            }));
        })
      );

      setSceneAssociations(results.flat());
    } catch (err) {
      onNotify?.(`Error consultando asociaciones: ${err.message}`);
    } finally {
      setAssociationsLoading(false);
    }
  }

  async function openPreview(asset) {
    setPreview(asset);
    setSelectedSceneId('');
    await loadAssetAssociations(asset);
  }

  async function attachToScene() {
    if (!preview || !selectedSceneId) return;

    try {
      setAssociationSaving(true);

      const response = await fetch(
        `${API}/scenes/${selectedSceneId}/assets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: preview.id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo asociar el recurso.');
      }

      await loadAssetAssociations(preview);
      await loadAssets();

      setSelectedSceneId('');
      onNotify?.('Recurso asociado a la escena correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setAssociationSaving(false);
    }
  }

  async function detachFromScene(associationId) {
    try {
      setDetachingId(associationId);

      const response = await fetch(
        `${API}/scene-assets/${associationId}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo quitar la asociación.');
      }

      await loadAssetAssociations(preview);
      await loadAssets();

      onNotify?.('Asociación eliminada. El archivo sigue en la biblioteca.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setDetachingId(null);
    }
  }

  const availableScenes = scenes.filter(
    scene => !sceneAssociations.some(item => item.scene_id === scene.id)
  );

  return (
    <div className="asset-page">
      <header className="asset-topbar">
        <button className="asset-back-button" onClick={onClose}>
          <ArrowLeft size={17} /> Volver al dashboard
        </button>
        <span className="asset-breadcrumb">
          Workspace <span>/</span> Biblioteca
        </span>
      </header>

      <main className="asset-content">
        <div className="asset-heading">
          <div>
            <div className="asset-eyebrow">
              <FolderOpen size={14} /> BIBLIOTECA DE PRODUCCIÓN
            </div>
            <h1>Recursos audiovisuales</h1>
            <p>
              Organiza los archivos de <strong>{production.title}</strong>.
            </p>
          </div>

          <button
            className="asset-upload-button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? <LoaderCircle size={17} className="asset-spin" /> : <Upload size={17} />}
            {uploading ? 'Subiendo...' : 'Subir recurso'}
          </button>

          <input
            ref={fileInput}
            className="asset-hidden-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/wav,audio/ogg,audio/mp4,video/mp4,video/webm"
            onChange={uploadFile}
          />
        </div>

        <div className="asset-stats">
          <div><span>Total de recursos</span><strong>{assets.length}</strong></div>
          <div><span>Imágenes</span><strong>{count('image/')}</strong></div>
          <div><span>Audios</span><strong>{count('audio/')}</strong></div>
          <div><span>Vídeos</span><strong>{count('video/')}</strong></div>
        </div>

        <div className="asset-toolbar">
          <div className="asset-search">
            <Search size={17} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar recursos..."
            />
          </div>

          <button className="asset-refresh" onClick={() => {
            loadAssets();
            loadScenes();
          }} disabled={loading || scenesLoading}>
            <RefreshCw size={15} /> Actualizar
          </button>
        </div>

        <div className="asset-layout">
          <aside className="asset-categories">
            <span className="asset-side-label">CATEGORÍAS</span>

            {categories.map(category => {
              const Icon = category.icon;

              return (
                <button
                  key={category.id}
                  className={`asset-category ${activeCategory === category.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <Icon size={17} />
                  {category.label}
                </button>
              );
            })}
          </aside>

          <section className="asset-library">
            {loading && <p className="asset-message">Cargando recursos...</p>}
            {!loading && error && <p className="asset-error">{error}</p>}

            {!loading && !error && filtered.length === 0 && (
              <div className="asset-empty">
                <FolderOpen size={35} />
                <h3>No hay recursos aquí todavía</h3>
                <p>
                  Sube imágenes, música, efectos de sonido o vídeos para esta producción.
                </p>
                <button
                  className="asset-upload-button"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={16} /> Subir primer recurso
                </button>
              </div>
            )}

            <div className="asset-grid">
              {filtered.map(asset => {
                const Icon = iconFor(asset);
                const name = asset.original_name || asset.file_path?.split('/').pop() || 'Recurso';

                return (
                  <button
                    className="asset-card"
                    key={asset.id}
                    onClick={() => openPreview(asset)}
                  >
                    <div className="asset-thumbnail">
                      {asset.mime_type?.startsWith('image/')
                        ? <img src={url(asset)} alt={name} />
                        : <Icon size={31} />}
                    </div>

                    <div className="asset-card-info">
                      <strong title={name}>{name}</strong>
                      <span>{sizeLabel(asset.file_size)}</span>
                      {asset.usage_count > 0 && (
                        <span className="asset-usage">
                          <Link2 size={12} /> {asset.usage_count} usos
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      {preview && (
        <div className="asset-preview-overlay" onClick={() => setPreview(null)}>
          <section
            className="asset-preview-dialog"
            onClick={event => event.stopPropagation()}
          >
            <div className="asset-preview-header">
              <div>
                <span className="asset-eyebrow">VISTA PREVIA</span>
                <h2>{preview.original_name || 'Recurso'}</h2>
                <p>{sizeLabel(preview.file_size)} · {preview.asset_type}</p>
              </div>

              <button
                className="asset-close-button"
                onClick={() => setPreview(null)}
                aria-label="Cerrar vista previa"
              >
                <X size={20} />
              </button>
            </div>

            <div className="asset-preview-body">
              {preview.mime_type?.startsWith('image/') && (
                <img src={url(preview)} alt={preview.original_name || 'Recurso'} />
              )}

              {preview.mime_type?.startsWith('audio/') && (
                <audio controls src={url(preview)} />
              )}

              {preview.mime_type?.startsWith('video/') && (
                <video controls src={url(preview)} />
              )}

              {!['image/', 'audio/', 'video/'].some(type =>
                preview.mime_type?.startsWith(type)
              ) && (
                <div className="asset-file-fallback">
                  <File size={42} />
                  <span>Vista previa no disponible para este tipo de archivo.</span>
                </div>
              )}
            </div>

            <section className="asset-association-panel">
              <div className="asset-association-heading">
                <div>
                  <span className="asset-eyebrow">
                    <Link2 size={14} /> USO EN PRODUCCIÓN
                  </span>
                  <h3>Escenas asociadas</h3>
                  <p>Vincula este recurso con una o varias escenas.</p>
                </div>

                <span className="asset-association-count">
                  {sceneAssociations.length} {sceneAssociations.length === 1 ? 'escena' : 'escenas'}
                </span>
              </div>

              <div className="asset-association-form">
                <select
                  value={selectedSceneId}
                  onChange={event => setSelectedSceneId(event.target.value)}
                  disabled={scenesLoading || availableScenes.length === 0}
                >
                  <option value="">
                    {scenesLoading
                      ? 'Cargando escenas...'
                      : availableScenes.length === 0
                        ? 'No hay más escenas disponibles'
                        : 'Seleccionar una escena...'}
                  </option>

                  {availableScenes.map(scene => (
                    <option key={scene.id} value={scene.id}>
                      Escena {scene.scene_number} — {scene.title}
                    </option>
                  ))}
                </select>

                <button
                  className="asset-associate-button"
                  onClick={attachToScene}
                  disabled={!selectedSceneId || associationSaving}
                >
                  {associationSaving
                    ? <LoaderCircle size={16} className="asset-spin" />
                    : <Link2 size={16} />}
                  Asociar
                </button>
              </div>

              {associationsLoading && (
                <p className="asset-association-message">
                  Consultando asociaciones...
                </p>
              )}

              {!associationsLoading && sceneAssociations.length === 0 && (
                <div className="asset-no-associations">
                  <FolderOpen size={20} />
                  Este recurso todavía no está asociado a ninguna escena.
                </div>
              )}

              {!associationsLoading && sceneAssociations.length > 0 && (
                <div className="asset-association-list">
                  {sceneAssociations.map(association => (
                    <div className="asset-association-item" key={association.id}>
                      <div className="asset-associated-icon">
                        <CheckCircle2 size={17} />
                      </div>

                      <div className="asset-associated-info">
                        <strong>
                          Escena {association.scene_number}: {association.scene_title}
                        </strong>
                        <span>Recurso vinculado correctamente</span>
                      </div>

                      <button
                        className="asset-detach-button"
                        onClick={() => detachFromScene(association.id)}
                        disabled={detachingId === association.id}
                        title="Quitar asociación"
                      >
                        {detachingId === association.id
                          ? <LoaderCircle size={16} className="asset-spin" />
                          : <Unlink size={16} />}
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="asset-association-note">
                Quitar una asociación no elimina el archivo de la biblioteca.
              </p>
            </section>
          </section>
        </div>
      )}
    </div>
  );
}
