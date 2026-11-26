import { useEffect, useRef, useState } from 'react';
import {
    ArrowLeft,
    RefreshCw,
    WandSparkles,
    Check,
    X,
    Clock3,
    Film,
    Save,
    Eye,
    Camera,
    Users,
    MapPin,
    Clapperboard,
    Link2,
    Unlink,
    Image as ImageIcon,
    Music2,
    Video,
    File,
    LoaderCircle,
    Copy,
    Upload,
    ExternalLink
} from 'lucide-react';

import './SceneManager.css';

const API = 'http://127.0.0.1:3005';

const VISUAL_FIELDS = [
  'location',
  'action_description',
  'shot_type',
  'camera_movement',
  'lighting',
  'mood',
  'visual_description'
];

const VISUAL_STATUS_LABELS = {
  draft: 'Borrador',
  ready: 'Lista para revisar',
  approved: 'Aprobada',
  rejected: 'Rechazada'
};

const NARRATIVE_STATUS_LABELS = {
  draft: 'Borrador',
  ready: 'Lista',
  approved: 'Aprobada',
  rejected: 'Rechazada'
};

function getCharacters(scene) {
  if (Array.isArray(scene.characters)) {
    return scene.characters;
  }

  if (Array.isArray(scene.characters_json)) {
    return scene.characters_json;
  }

  if (typeof scene.characters_json === 'string') {
    try {
      const parsed = JSON.parse(scene.characters_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getStatusLabel(status, labels) {
  return labels[status] || 'Borrador';
}

export default function SceneManager({ production, onClose, onNotify }) {
    const [scenes, setScenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingVisuals, setGeneratingVisuals] = useState(false);
    const [imagePrompt, setImagePrompt] = useState('');
    const [uploadingImages, setUploadingImages] = useState(false);
    const sceneImageInputRef = useRef(null);
    const batchImageInputRef = useRef(null);
    const [saving, setSaving] = useState(false);
    const [selectedScene, setSelectedScene] = useState(null);
    const [error, setError] = useState('');
    const [productionAssets, setProductionAssets] = useState([]);
    const [sceneAssets, setSceneAssets] = useState([]);
    const [selectedAssetId, setSelectedAssetId] = useState('');
    const [loadingSceneAssets, setLoadingSceneAssets] = useState(false);
    const [savingSceneAsset, setSavingSceneAsset] = useState(false);
    const [removingSceneAsset, setRemovingSceneAsset] = useState(null);

  const [sceneToSplit, setSceneToSplit] = useState(null);
  const [splitTexts, setSplitTexts] = useState({
    firstText: '',
    secondText: ''
  });

  async function loadProductionAssets() {
  try {
    const data = await request(
      `/productions/${production.id}/assets`
    );

    setProductionAssets(
      Array.isArray(data) ? data : data.assets || []
    );
  } catch (err) {
    onNotify?.(`Error cargando biblioteca: ${err.message}`);
  }
}

async function loadSceneAssets(sceneId) {
  try {
    setLoadingSceneAssets(true);

    const data = await request(`/scenes/${sceneId}/assets`);

    setSceneAssets(
      Array.isArray(data) ? data : data.assets || []
    );
  } catch (err) {
    setSceneAssets([]);
    onNotify?.(`Error cargando recursos de escena: ${err.message}`);
  } finally {
    setLoadingSceneAssets(false);
  }
}

async function associateAssetWithScene() {
  if (!selectedScene || !selectedAssetId) return;

  try {
    setSavingSceneAsset(true);

    await request(
      `/scenes/${selectedScene.id}/assets`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedAssetId
        })
      }
    );

    await loadSceneAssets(selectedScene.id);
    setSelectedAssetId('');

    onNotify?.('Recurso asociado a la escena.');
  } catch (err) {
    onNotify?.(`Error: ${err.message}`);
  } finally {
    setSavingSceneAsset(false);
  }
}

async function removeAssetFromScene(associationId) {
  try {
    setRemovingSceneAsset(associationId);

    await request(
      `/scene-assets/${associationId}`,
      { method: 'DELETE' }
    );

    await loadSceneAssets(selectedScene.id);

    onNotify?.('Recurso desvinculado correctamente.');
  } catch (err) {
    onNotify?.(`Error: ${err.message}`);
  } finally {
    setRemovingSceneAsset(null);
  }
}

function getSceneAssetUrl(asset) {
  if (!asset.asset_id) return null;

  return `${API}/productions/${production.id}/assets/${asset.asset_id}/file`;
}

function getAvailableAssets() {
  const associatedIds = sceneAssets.map(asset => asset.asset_id);

  return productionAssets.filter(
    asset => !associatedIds.includes(asset.id)
  );
}

  const [selectedForMerge, setSelectedForMerge] = useState([]);
  const [processingSceneAction, setProcessingSceneAction] = useState(false);

  async function request(url, options = {}) {
    const response = await fetch(`${API}${url}`, options);

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || 'Error en la operación');
    }

    return data;
  }

  function updateLocalScene(updated) {
    setScenes(previous =>
      previous.map(scene =>
        scene.id === updated.id ? updated : scene
      )
    );

    setSelectedScene(previous =>
      previous?.id === updated.id ? updated : previous
    );
  }

  async function loadScenes() {
    try {
      setLoading(true);
      setError('');

      const data = await request(
        `/productions/${production.id}/scenes`
      );

      setScenes(Array.isArray(data) ? data : []);
      setSelectedForMerge([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScenes();
  }, [production.id]);

  useEffect(() => {
  loadProductionAssets();
}, [production.id]);

  async function generateScenes() {
    try {
      setGenerating(true);

      const data = await request(
        `/productions/${production.id}/scenes/generate`,
        { method: 'POST' }
      );

      setScenes(data);
      onNotify?.('Escenas generadas correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  async function generateVisualProposals() {
    try {
      setGeneratingVisuals(true);

      const data = await request(
        `/productions/${production.id}/scenes/generate-visuals`,
        { method: 'POST' }
      );

      setScenes(data);
      onNotify?.('Propuestas visuales generadas correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setGeneratingVisuals(false);
    }
  }

  async function generatePromptForSelectedScene() {
    if (!selectedScene) return;
    try {
      const data = await request(`/scenes/${selectedScene.id}/image-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: selectedScene })
      });
      setImagePrompt(data.prompt || '');
      onNotify?.('Prompt visual preparado. Cópialo y úsalo en ChatGPT Go para generar la imagen.');
    } catch (err) {
      onNotify?.(`Error preparando prompt: ${err.message}`);
    }
  }

  async function uploadImageAndAssociate(file, scene, prompt = '') {
    if (!file || !scene) throw new Error('Falta el archivo o la escena de destino.');
    if (!file.type?.startsWith('image/')) throw new Error(`${file.name}: el archivo no es una imagen.`);
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) throw new Error(`${file.name}: formato no compatible. Usa PNG, JPG, WEBP o GIF.`);

    const uploadResponse = await fetch(
      `${API}/productions/${production.id}/assets/upload?category=backgrounds`,
      {
        method: 'POST',
        headers: {
          'x-file-name': encodeURIComponent(file.name),
          'x-file-type': file.type
        },
        body: file
      }
    );
    const uploaded = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) throw new Error(uploaded.error || `No se pudo subir ${file.name}.`);

    await request(`/scenes/${scene.id}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: uploaded.asset.id,
        startSeconds: 0,
        endSeconds: Number(scene.duration_seconds) || null,
        metadata: {
          source: 'chatgpt-go-manual-import',
          prompt: prompt || '',
          importedAt: new Date().toISOString()
        }
      })
    });
    return uploaded.asset;
  }

  async function importImageForSelectedScene(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedScene) return;
    try {
      setUploadingImages(true);
      await uploadImageAndAssociate(file, selectedScene, imagePrompt);
      await loadSceneAssets(selectedScene.id);
      await loadProductionAssets();
      onNotify?.(`Imagen ${file.name} importada y asociada a ${selectedScene.title}.`);
    } catch (err) {
      onNotify?.(`No se pudo importar la imagen: ${err.message}`);
    } finally {
      setUploadingImages(false);
    }
  }

  async function importImagesForAllScenes(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const scenesWithAssets = await Promise.all(scenes.map(async scene => {
      const assets = await request(`/scenes/${scene.id}/assets`);
      const hasBackground = (Array.isArray(assets) ? assets : assets.assets || [])
        .some(asset => asset.asset_type === 'background' && asset.mime_type?.startsWith('image/'));
      return { scene, hasBackground };
    }));
    const availableScenes = scenesWithAssets.filter(item => !item.hasBackground).map(item => item.scene);

    const assignments = [];
    const usedSceneIds = new Set();
    const unassignedFiles = [];

    for (const file of sortedFiles) {
      const match = file.name.match(/(?:scene|escena)[-_ ]?0*(\d+)/i);
      const target = match
        ? scenes.find(scene => Number(scene.scene_number) === Number(match[1]))
        : null;
      if (target && !usedSceneIds.has(target.id)) {
        assignments.push({ file, scene: target });
        usedSceneIds.add(target.id);
      } else {
        unassignedFiles.push(file);
      }
    }

    const remainingScenes = availableScenes.filter(scene => !usedSceneIds.has(scene.id));
    for (const file of unassignedFiles) {
      const scene = remainingScenes.shift();
      if (!scene) break;
      assignments.push({ file, scene });
      usedSceneIds.add(scene.id);
    }

    if (!assignments.length) {
      onNotify?.('No hay escenas disponibles para asociar imágenes. Comprueba si ya tienen un fondo.');
      return;
    }

    const skipped = sortedFiles.length - assignments.length;
    const confirmation = `Se importarán ${assignments.length} imagen(es).\n\nAsignación: ${assignments.map(item => `${item.file.name} → Escena ${item.scene.scene_number}`).join('\n')}\n\n¿Continuar?`;
    if (!window.confirm(confirmation)) return;

    try {
      setUploadingImages(true);
      let imported = 0;
      const errors = [];
      for (const assignment of assignments) {
        try {
          await uploadImageAndAssociate(assignment.file, assignment.scene);
          imported += 1;
        } catch (err) {
          errors.push(`${assignment.file.name}: ${err.message}`);
        }
      }
      await loadProductionAssets();
      if (selectedScene) await loadSceneAssets(selectedScene.id);
      const summary = `${imported} imagen(es) importadas y asociadas.${skipped ? ` ${skipped} archivo(s) sin escena disponible.` : ''}`;
      onNotify?.(errors.length ? `${summary} Errores: ${errors.join(' | ')}` : summary);
    } finally {
      setUploadingImages(false);
    }
  }

  async function openChatGPTWithPrompt() {
    if (!imagePrompt.trim()) return;
    const chatWindow = window.open('https://chatgpt.com/', '_blank', 'noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(imagePrompt);
      onNotify?.(chatWindow ? 'Prompt copiado. Pégalo en ChatGPT y genera la imagen.' : 'Prompt copiado. Abre ChatGPT en una pestaña nueva y pégalo.');
    } catch {
      onNotify?.('No se pudo copiar automáticamente. Usa el botón Copiar prompt y abre ChatGPT.');
    }
  }

  async function copyAllScenePrompts() {
    if (!scenes.length) return;
    try {
      const prompts = [];
      for (const scene of scenes) {
        const data = await request(`/scenes/${scene.id}/image-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene })
        });
        prompts.push(`ESCENA ${scene.scene_number}: ${scene.title}\n\n${data.prompt}`);
      }
      await navigator.clipboard.writeText(prompts.join('\n\n' + '='.repeat(60) + '\n\n'));
      onNotify?.(`Se copiaron los prompts de ${prompts.length} escenas. Genera una imagen por prompt en ChatGPT.`);
    } catch (err) {
      onNotify?.(`No se pudieron copiar los prompts: ${err.message}`);
    }
  }

  function openSceneEditor(scene) {
    setSelectedScene({
      ...scene,
      characters: getCharacters(scene),
      location: scene.location || '',
      action_description: scene.action_description || '',
      shot_type: scene.shot_type || '',
      camera_movement: scene.camera_movement || '',
      lighting: scene.lighting || '',
      mood: scene.mood || '',
      visual_description: scene.visual_description || ''
      
    });
    setSceneAssets([]);
    setSelectedAssetId('');
    setImagePrompt('');
    loadSceneAssets(scene.id);
  }

  async function saveScene() {
    if (!selectedScene) return;

    try {
      setSaving(true);

      const payload = {
        title: selectedScene.title,
        narration_text: selectedScene.narration_text,
        duration_seconds: Number(selectedScene.duration_seconds),
        characters: selectedScene.characters,
        location: selectedScene.location,
        action_description: selectedScene.action_description,
        shot_type: selectedScene.shot_type,
        camera_movement: selectedScene.camera_movement,
        lighting: selectedScene.lighting,
        mood: selectedScene.mood,
        visual_description: selectedScene.visual_description
      };

      const updated = await request(
        `/scenes/${selectedScene.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      updateLocalScene(updated);
      setSelectedScene(null);
      onNotify?.('Escena actualizada correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(scene, status) {
    try {
      const updated = await request(
        `/scenes/${scene.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        }
      );

      updateLocalScene(updated);
      onNotify?.('Estado narrativo actualizado.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    }
  }

  async function changeVisualStatus(scene, status) {
    try {
      const updated = await request(
        `/scenes/${scene.id}/visual-status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        }
      );

      updateLocalScene(updated);
      onNotify?.('Estado visual actualizado.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    }
  }

    async function duplicateScene(scene) {
    try {
      const data = await request(
        `/scenes/${scene.id}/duplicate`,
        { method: 'POST' }
      );

      setScenes(data);
      onNotify?.('Escena duplicada.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    }
  }

  function toggleMergeSelection(scene) {
    setSelectedForMerge(previous => {
      if (previous.includes(scene.id)) {
        return previous.filter(id => id !== scene.id);
      }

      if (previous.length >= 2) {
        return [previous[1], scene.id];
      }

      return [...previous, scene.id];
    });
  }

  async function splitScene() {
    if (!sceneToSplit) return;

    const firstText = splitTexts.firstText.trim();
    const secondText = splitTexts.secondText.trim();

    if (!firstText || !secondText) {
      onNotify?.('Ambas partes deben tener texto.');
      return;
    }

    try {
      setProcessingSceneAction(true);

      const data = await request(
        `/scenes/${sceneToSplit.id}/split`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstText, secondText })
        }
      );

      setScenes(data);
      setSceneToSplit(null);
      setSplitTexts({ firstText: '', secondText: '' });
      onNotify?.('Escena dividida correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setProcessingSceneAction(false);
    }
  }

  async function mergeScenes() {
    if (selectedForMerge.length !== 2) return;

    const firstIndex = scenes.findIndex(
      scene => scene.id === selectedForMerge[0]
    );

    const secondIndex = scenes.findIndex(
      scene => scene.id === selectedForMerge[1]
    );

    if (Math.abs(firstIndex - secondIndex) !== 1) {
      onNotify?.('Selecciona dos escenas consecutivas.');
      return;
    }

    const firstSceneId = scenes[Math.min(firstIndex, secondIndex)].id;
    const secondSceneId = scenes[Math.max(firstIndex, secondIndex)].id;

    try {
      setProcessingSceneAction(true);

      const data = await request('/scenes/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstSceneId, secondSceneId })
      });

      setScenes(data);
      setSelectedForMerge([]);
      onNotify?.('Escenas combinadas correctamente.');
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    } finally {
      setProcessingSceneAction(false);
    }
  }

  async function moveScene(index, direction) {
    const target = index + direction;

    if (target < 0 || target >= scenes.length) return;

    const reordered = [...scenes];

    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index]
    ];

    try {
      const data = await request(
        `/productions/${production.id}/scenes/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sceneIds: reordered.map(scene => scene.id)
          })
        }
      );

      setScenes(data);
    } catch (err) {
      onNotify?.(`Error: ${err.message}`);
    }
  }

  function updateEditorField(field, value) {
    setSelectedScene(previous => ({
      ...previous,
      [field]: value
    }));
  }

  function updateCharacters(value) {
    const characters = value
      .split(',')
      .map(character => character.trim())
      .filter(Boolean);

    updateEditorField('characters', characters);
  }

  const totalDuration = scenes.reduce(
    (total, scene) => total + Number(scene.duration_seconds || 0),
    0
  );

  const approvedCount = scenes.filter(
    scene => scene.status === 'approved'
  ).length;

  const visualApprovedCount = scenes.filter(
    scene => scene.visual_status === 'approved'
  ).length;

  const canMergeSelected = (() => {
    if (selectedForMerge.length !== 2) return false;

    const first = scenes.findIndex(
      scene => scene.id === selectedForMerge[0]
    );

    const second = scenes.findIndex(
      scene => scene.id === selectedForMerge[1]
    );

    return Math.abs(first - second) === 1;
  })();

  return (
    <div className="scene-manager">

      <header className="scene-manager-header">
        <button className="scene-manager-back" onClick={onClose}>
          <ArrowLeft size={18} />
          Volver
        </button>

        <div>
          <span className="scene-manager-eyebrow">
            PRODUCTION WORKSPACE
          </span>
          <h1>Scene Manager</h1>
          <p>{production.title}</p>
        </div>

        <button
          className="scene-manager-refresh"
          onClick={loadScenes}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>

      <section className="scene-manager-stats">
        <div>
          <Film size={20} />
          <strong>{scenes.length}</strong>
          <span>Escenas</span>
        </div>

        <div>
          <Clock3 size={20} />
          <strong>{totalDuration.toFixed(1)} s</strong>
          <span>Duración estimada</span>
        </div>

        <div>
          <Check size={20} />
          <strong>{approvedCount}/{scenes.length}</strong>
          <span>Narrativas aprobadas</span>
        </div>

        <div>
          <Eye size={20} />
          <strong>{visualApprovedCount}/{scenes.length}</strong>
          <span>Visuales aprobadas</span>
        </div>
      </section>

      <div className="scene-manager-toolbar">
        <div>
          <h2>Secuencia narrativa y visual</h2>
          <p>Organiza, edita y aprueba cada escena del episodio.</p>
        </div>

        <div className="scene-manager-toolbar-actions">
          {selectedForMerge.length > 0 && (
            <button
              className="scene-manager-secondary"
              onClick={mergeScenes}
              disabled={!canMergeSelected || processingSceneAction}
            >
              {processingSceneAction
                ? 'Procesando...'
                : canMergeSelected
                  ? 'Combinar escenas'
                  : 'Selecciona dos consecutivas'}
            </button>
          )}

          {scenes.length > 0 && (
            <button
              className="scene-manager-visual-generate"
              onClick={generateVisualProposals}
              disabled={generatingVisuals}
            >
              <WandSparkles size={17} />
              {generatingVisuals
                ? 'Generando propuestas...'
                : 'Generar propuestas visuales'}
            </button>
          )}

          {scenes.length > 0 && (
            <>
              <button
                className="scene-manager-secondary"
                type="button"
                onClick={copyAllScenePrompts}
                title="Copia los prompts de todas las escenas para utilizarlos en ChatGPT"
              >
                <Copy size={16} /> Copiar prompts de todas
              </button>
              <button
                className="scene-manager-visual-generate"
                type="button"
                onClick={() => batchImageInputRef.current?.click()}
                disabled={uploadingImages}
                title="Importa varias imágenes y asígnalas a las escenas por nombre o por orden"
              >
                {uploadingImages ? <LoaderCircle size={17} className="scene-assets-spin" /> : <Upload size={17} />}
                {uploadingImages ? 'Importando imágenes...' : 'Importar imágenes por lote'}
              </button>
              <input
                ref={batchImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                hidden
                onChange={importImagesForAllScenes}
              />
            </>
          )}

          {scenes.length === 0 && (
            <button
              className="scene-manager-generate"
              onClick={generateScenes}
              disabled={generating}
            >
              <WandSparkles size={17} />
              {generating ? 'Generando...' : 'Generar escenas'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="scene-manager-error">{error}</div>
      )}

      {loading ? (
        <p className="scene-manager-empty">Cargando escenas...</p>
      ) : scenes.length === 0 ? (
        <div className="scene-manager-empty">
          <Film size={35} />
          <h3>Aún no hay escenas</h3>
          <p>Genera propuestas automáticamente desde el guion.</p>

          <button
            className="scene-manager-generate"
            onClick={generateScenes}
            disabled={generating}
          >
            <WandSparkles size={17} />
            {generating ? 'Generando...' : 'Generar escenas'}
          </button>
        </div>
      ) : (
        <div className="scene-manager-list">
          {scenes.map((scene, index) => (
            <article className="scene-card" key={scene.id}>
              <div className="scene-card-number">
                {String(index + 1).padStart(2, '0')}
              </div>

              <div className="scene-card-content">
                <div className="scene-card-heading">
                  <h3>{scene.title}</h3>

                  <span className={`scene-status ${scene.status || 'draft'}`}>
                    {getStatusLabel(
                      scene.status,
                      NARRATIVE_STATUS_LABELS
                    )}
                  </span>
                </div>

                <p className="scene-card-narration">
                  {scene.narration_text}
                </p>

                <span className="scene-card-duration">
                  <Clock3 size={14} />
                  {Number(scene.duration_seconds || 0).toFixed(1)} segundos
                </span>

                <div className="scene-visual-summary">
                  <div className="scene-visual-summary-header">
                    <span>
                      <Eye size={15} />
                      Dirección visual
                    </span>

                    <span className={`scene-status ${scene.visual_status || 'draft'}`}>
                      {getStatusLabel(
                        scene.visual_status,
                        VISUAL_STATUS_LABELS
                      )}
                    </span>
                  </div>

                  <p>
                    {scene.visual_description ||
                      'Todavía no hay una descripción visual.'}
                  </p>

                  <div className="scene-visual-tags">
                    {scene.location && (
                      <span><MapPin size={12} />{scene.location}</span>
                    )}

                    {scene.shot_type && (
                      <span><Camera size={12} />{scene.shot_type}</span>
                    )}

                    {getCharacters(scene).length > 0 && (
                      <span><Users size={12} />{getCharacters(scene).join(', ')}</span>
                    )}
                  </div>
                </div>

                <div className="scene-card-actions">
                  <button onClick={() => openSceneEditor(scene)}>
                    Editar escena
                  </button>

                  <button onClick={() => duplicateScene(scene)}>
                    Duplicar
                  </button>

                  <button
                    onClick={() => {
                      setSceneToSplit(scene);
                      setSplitTexts({
                        firstText: scene.narration_text || '',
                        secondText: ''
                      });
                    }}
                  >
                    Dividir
                  </button>

                  <button
                    onClick={() => toggleMergeSelection(scene)}
                    className={
                      selectedForMerge.includes(scene.id)
                        ? 'selected'
                        : ''
                    }
                  >
                    {selectedForMerge.includes(scene.id)
                      ? 'Seleccionada'
                      : 'Seleccionar para unir'}
                  </button>

                  <button
                    onClick={() =>
                      changeStatus(
                        scene,
                        scene.status === 'approved' ? 'draft' : 'approved'
                      )
                    }
                  >
                    {scene.status === 'approved'
                      ? 'Desaprobar narración'
                      : 'Aprobar narración'}
                  </button>

                  <button
                    onClick={() =>
                      changeVisualStatus(
                        scene,
                        scene.visual_status === 'approved'
                          ? 'draft'
                          : 'approved'
                      )
                    }
                  >
                    {scene.visual_status === 'approved'
                      ? 'Desaprobar visual'
                      : 'Aprobar visual'}
                  </button>

                  <button
                    onClick={() => moveScene(index, -1)}
                    disabled={index === 0}
                    title="Mover arriba"
                  >
                    ↑
                  </button>

                  <button
                    onClick={() => moveScene(index, 1)}
                    disabled={index === scenes.length - 1}
                    title="Mover abajo"
                  >
                    ↓
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

            {/* EDITOR DE ESCENA */}
      {selectedScene && (
        <div className="scene-editor-overlay">
          <section className="scene-editor scene-editor-large">
            <header>
              <div>
                <span className="scene-manager-eyebrow">
                  SCENE EDITOR
                </span>
                <h2>Editar escena</h2>
              </div>

              <button onClick={() => setSelectedScene(null)}>
                <X size={20} />
              </button>
            </header>

            <div className="scene-editor-section">
              <h3><Clapperboard size={17} /> Narrativa</h3>

              <label>Título</label>
              <input
                value={selectedScene.title || ''}
                onChange={event =>
                  updateEditorField('title', event.target.value)
                }
              />

              <label>Narración</label>
              <textarea
                rows={6}
                value={selectedScene.narration_text || ''}
                onChange={event =>
                  updateEditorField('narration_text', event.target.value)
                }
              />

              <label>Duración en segundos</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={selectedScene.duration_seconds ?? ''}
                onChange={event =>
                  updateEditorField('duration_seconds', event.target.value)
                }
              />
            </div>

            <div className="scene-editor-section">
              <h3><Eye size={17} /> Dirección visual</h3>

              <label>Personajes (separados por comas)</label>
              <input
                value={(selectedScene.characters || []).join(', ')}
                onChange={event => updateCharacters(event.target.value)}
                placeholder="Mateo, Valeria, Lucas"
              />

              <label>Ubicación</label>
              <input
                value={selectedScene.location || ''}
                onChange={event =>
                  updateEditorField('location', event.target.value)
                }
                placeholder="Bosque oscuro, cabaña abandonada..."
              />

              <label>Acción de la escena</label>
              <textarea
                rows={3}
                value={selectedScene.action_description || ''}
                onChange={event =>
                  updateEditorField('action_description', event.target.value)
                }
                placeholder="Describe qué sucede visualmente..."
              />

              <label>Tipo de plano</label>
              <input
                value={selectedScene.shot_type || ''}
                onChange={event =>
                  updateEditorField('shot_type', event.target.value)
                }
                placeholder="Plano general, primer plano, plano medio..."
              />

              <label>Movimiento de cámara</label>
              <input
                value={selectedScene.camera_movement || ''}
                onChange={event =>
                  updateEditorField('camera_movement', event.target.value)
                }
                placeholder="Travelling, paneo, cámara fija..."
              />

              <label>Iluminación</label>
              <input
                value={selectedScene.lighting || ''}
                onChange={event =>
                  updateEditorField('lighting', event.target.value)
                }
                placeholder="Luz tenue, luz de luna, contraluz..."
              />

              <label>Ambiente y emoción</label>
              <input
                value={selectedScene.mood || ''}
                onChange={event =>
                  updateEditorField('mood', event.target.value)
                }
                placeholder="Suspenso, tensión, misterio..."
              />

              <label>Descripción visual general</label>
              <textarea
                rows={5}
                value={selectedScene.visual_description || ''}
                onChange={event =>
                  updateEditorField('visual_description', event.target.value)
                }
                placeholder="Describe cómo debe verse esta escena en pantalla..."
              />
            </div>


<div className="scene-editor-section scene-assets-section">
  <h3><ImageIcon size={17} /> Prompt e imagen de la escena</h3>
  <p className="scene-assets-description">
    El prompt se construye con la narración y la dirección visual. Cópialo y úsalo en ChatGPT Go para crear la imagen; después impórtala directamente a esta escena.
  </p>
  <textarea
    rows={8}
    value={imagePrompt}
    onChange={event => setImagePrompt(event.target.value)}
    placeholder="Pulsa Generar prompt para preparar la descripción visual de esta escena..."
  />
  <div className="scene-assets-selector">
    <button type="button" onClick={generatePromptForSelectedScene}>
      <WandSparkles size={15} /> Generar prompt
    </button>
    <button
      type="button"
      disabled={!imagePrompt.trim()}
      onClick={() => navigator.clipboard.writeText(imagePrompt).then(() => onNotify?.('Prompt copiado.')).catch(() => onNotify?.('No se pudo copiar el prompt.'))}
    >
      <Copy size={15} /> Copiar prompt
    </button>
    <button
      type="button"
      onClick={openChatGPTWithPrompt}
      disabled={!imagePrompt.trim()}
    >
      <ExternalLink size={15} /> Abrir ChatGPT y copiar prompt
    </button>
    <button
      type="button"
      onClick={() => sceneImageInputRef.current?.click()}
      disabled={!selectedScene || uploadingImages}
    >
      {uploadingImages ? <LoaderCircle size={15} className="scene-assets-spin" /> : <Upload size={15} />}
      {uploadingImages ? 'Importando...' : 'Importar imagen generada'}
    </button>
    <input
      ref={sceneImageInputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      hidden
      onChange={importImageForSelectedScene}
    />
  </div>
  <p className="scene-assets-note">
    Flujo sin API de pago: copia el prompt, abre ChatGPT Go, genera y guarda la imagen en tu PC. Después pulsa «Importar imagen generada» para vincularla a esta escena. Formatos: PNG, JPG, WEBP o GIF; máximo 25 MB.
  </p>
</div>

<div className="scene-editor-section scene-assets-section">
  <h3>
    <Link2 size={17} /> Recursos asignados
  </h3>

  <p className="scene-assets-description">
    Selecciona personajes, fondos, música y efectos de sonido
    desde la biblioteca de esta producción.
  </p>

  <div className="scene-assets-selector">
    <select
      value={selectedAssetId}
      onChange={event => setSelectedAssetId(event.target.value)}
    >
      <option value="">Seleccionar recurso de la biblioteca...</option>

      {getAvailableAssets().map(asset => (
        <option key={asset.id} value={asset.id}>
          {asset.original_name || asset.file_path?.split('/').pop()}
          {' · '}
          {asset.asset_type}
        </option>
      ))}
    </select>

    <button
      type="button"
      onClick={associateAssetWithScene}
      disabled={!selectedAssetId || savingSceneAsset}
    >
      {savingSceneAsset
        ? <LoaderCircle size={15} className="scene-assets-spin" />
        : <Link2 size={15} />}
      Asociar
    </button>
  </div>

  {loadingSceneAssets ? (
    <p className="scene-assets-empty">
      Cargando recursos asociados...
    </p>
  ) : sceneAssets.length === 0 ? (
    <div className="scene-assets-empty">
      <File size={24} />
      <span>Esta escena todavía no tiene recursos asignados.</span>
    </div>
  ) : (
    <div className="scene-assets-list">
      {sceneAssets.map(asset => {
        const fileUrl = getSceneAssetUrl(asset);
        const name = asset.original_name ||
          asset.file_path?.split('/').pop() ||
          'Recurso';

        return (
          <div className="scene-asset-item" key={asset.id}>
            <div className="scene-asset-preview">
              {asset.mime_type?.startsWith('image/') && fileUrl ? (
                <img src={fileUrl} alt={name} />
              ) : asset.mime_type?.startsWith('audio/') ? (
                <Music2 size={22} />
              ) : asset.mime_type?.startsWith('video/') ? (
                <Video size={22} />
              ) : (
                <File size={22} />
              )}
            </div>

            <div className="scene-asset-info">
              <strong>{name}</strong>
              <span>{asset.asset_type}</span>

              {asset.mime_type?.startsWith('audio/') && fileUrl && (
                <audio controls src={fileUrl} />
              )}

              {asset.mime_type?.startsWith('video/') && fileUrl && (
                <video controls src={fileUrl} />
              )}
            </div>

            <button
              type="button"
              className="scene-asset-remove"
              onClick={() => removeAssetFromScene(asset.id)}
              disabled={removingSceneAsset === asset.id}
              title="Desvincular recurso"
            >
              {removingSceneAsset === asset.id
                ? <LoaderCircle size={15} className="scene-assets-spin" />
                : <Unlink size={15} />}
            </button>
            </div>
                        );
                    })}
                    </div>
                )}

                <p className="scene-assets-note">
                    Los recursos se administran independientemente de la escena.
                    Desvincularlos no elimina los archivos originales.
                </p>
        </div>


            <div className="scene-editor-footer">
              <button
                className="scene-editor-cancel"
                onClick={() => setSelectedScene(null)}
              >
                Cancelar
              </button>

              <button
                className="scene-manager-generate"
                onClick={saveScene}
                disabled={saving}
              >
                <Save size={16} />
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* EDITOR PARA DIVIDIR ESCENAS */}
      {sceneToSplit && (
        <div className="scene-editor-overlay">
          <section className="scene-editor">
            <header>
              <h2>Dividir escena</h2>

              <button onClick={() => setSceneToSplit(null)}>
                <X size={20} />
              </button>
            </header>

            <p className="scene-split-description">
              Se crearán dos escenas a partir de estos fragmentos.
              Distribuye la narración entre ambas partes.
            </p>

            <label>Primera parte</label>
            <textarea
              rows={6}
              value={splitTexts.firstText}
              onChange={event =>
                setSplitTexts(previous => ({
                  ...previous,
                  firstText: event.target.value
                }))
              }
            />

            <label>Segunda parte</label>
            <textarea
              rows={6}
              value={splitTexts.secondText}
              onChange={event =>
                setSplitTexts(previous => ({
                  ...previous,
                  secondText: event.target.value
                }))
              }
            />

            <footer>
              <button
                className="scene-editor-cancel"
                onClick={() => setSceneToSplit(null)}
              >
                Cancelar
              </button>

              <button
                className="scene-manager-generate"
                onClick={splitScene}
                disabled={processingSceneAction}
              >
                {processingSceneAction
                  ? 'Dividiendo...'
                  : 'Confirmar división'}
              </button>
            </footer>
          </section>
        </div>
      )}

    </div>
  );
}