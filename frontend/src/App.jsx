
import {
  LayoutDashboard,
  Film,
  FolderOpen,
  Settings,
  Plus,
  Search,
  Bell,
  Clock3,
  CheckCircle2,
  LoaderCircle,
  Clapperboard,
  Sparkles,
  MoreHorizontal,
  Play,
  X,
  Trash2,
  History,
  Video
} from 'lucide-react';

import './App.css';
import { useEffect, useState } from 'react';
import ProductionForm from './components/ProductionForm';
import SceneManager from './components/SceneManager';
import AssetManager from './components/AssetManager';
import SceneTimeline from './components/SceneTimeline';

const API = 'http://127.0.0.1:3005';

function Status({ status }) {
  const labels = {
    completed: 'Completado',
    processing: 'Procesando',
    draft: 'Borrador',
    failed: 'Fallido',
    approved: 'Aprobado'
  };

  return (
    <span className={`status ${status}`}>
      {status === 'completed' && <CheckCircle2 size={14} />}
      {status === 'processing' && <LoaderCircle size={14} />}
      {status === 'draft' && <Clock3 size={14} />}
      {status === 'failed' && <X size={14} />}
      {labels[status] || status}
    </span>
  );
}

function App() {
  const [productions, setProductions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [notification, setNotification] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [historyProduction, setHistoryProduction] = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [videoProduction, setVideoProduction] = useState(null);
  const [generatingIds, setGeneratingIds] = useState([]);
  const [sceneProduction, setSceneProduction] = useState(null);
  const [assetProduction, setAssetProduction] = useState(null);
  const [timelineProduction, setTimelineProduction] = useState(null);
  // =====================================
  // NOTIFICACIONES
  // =====================================

  function notify(message) {
    setNotification(message);
  }

  // =====================================
  // CREAR PRODUCCIÓN
  // =====================================

  function handleProductionCreated(production) {
    setProductions(previous => [production, ...previous]);
    setShowForm(false);
    notify('Producción creada correctamente.');
  }

  // =====================================
  // CARGAR PRODUCCIONES
  // =====================================

  async function loadProductions() {
    try {
      setError('');

      const response = await fetch(`${API}/productions`);

      if (!response.ok) {
        throw new Error('No se pudieron cargar las producciones.');
      }

      const data = await response.json();
      setProductions(data);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // ACTUALIZACIÓN AUTOMÁTICA
  // =====================================

  useEffect(() => {
    loadProductions();
  }, []);

  const hasProcessing = productions.some(
    item => item.status === 'processing'
  );

  useEffect(() => {
    if (!hasProcessing) return;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${API}/productions`);

        if (!response.ok) return;

        const data = await response.json();
        setProductions(data);

      } catch (err) {
        console.error('Error actualizando producciones:', err);
      }
    }, 2500);

    return () => window.clearInterval(interval);
  }, [hasProcessing]);

  // =====================================
  // GENERAR VÍDEO
  // =====================================

  async function handleGenerateVideo(production) {
    if (
      generatingIds.includes(production.id) ||
      production.status === 'processing'
    ) {
      return;
    }

    try {
      setGeneratingIds(previous => [...previous, production.id]);
      setActiveMenu(null);

      const response = await fetch(
        `${API}/productions/${production.id}/produce`,
        {
          method: 'POST'
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'No se pudo iniciar la generación.'
        );
      }

      setProductions(previous =>
        previous.map(item =>
          item.id === production.id
            ? { ...item, status: 'processing' }
            : item
        )
      );

      notify('Generación iniciada. El vídeo se está procesando.');

    } catch (err) {
      notify(`Error: ${err.message}`);
    } finally {
      setGeneratingIds(previous =>
        previous.filter(id => id !== production.id)
      );
    }
  }

  // =====================================
  // ABRIR REPRODUCTOR
  // =====================================

  function handleOpenVideo(production) {
    setVideoProduction(production);
    setActiveMenu(null);
  }

  // =====================================
  // EDITAR PRODUCCIÓN
  // =====================================

  async function handleEditProduction(production) {
    try {
      setError('');

      const response = await fetch(
        `${API}/productions/${production.id}`
      );

      if (!response.ok) {
        throw new Error('No se pudo cargar la producción.');
      }

      const fullProduction = await response.json();

      setEditingProduction(fullProduction);
      setActiveMenu(null);

    } catch (err) {
      notify(`Error: ${err.message}`);
    }
  }

  // =====================================
  // HISTORIAL
  // =====================================

  async function handleViewHistory(production) {
    try {
      setHistoryLoading(true);
      setHistoryProduction(production);
      setHistoryEvents([]);
      setActiveMenu(null);

      const response = await fetch(
        `${API}/productions/${production.id}/events`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'No se pudo cargar el historial.'
        );
      }

      setHistoryEvents(data);

    } catch (err) {
      notify(`Error: ${err.message}`);
      setHistoryProduction(null);

    } finally {
      setHistoryLoading(false);
    }
  }

  // =====================================
  // GUARDAR EDICIÓN
  // =====================================

  function handleProductionUpdated(updatedProduction) {
    setProductions(previous =>
      previous.map(item =>
        item.id === updatedProduction.id
          ? updatedProduction
          : item
      )
    );

    setEditingProduction(null);
    notify('Producción actualizada correctamente.');
  }

  // =====================================
  // ELIMINAR PRODUCCIÓN
  // =====================================

  async function handleDeleteProduction(production) {
    if (deleting) return;

    try {
      setDeleting(true);

      const response = await fetch(
        `${API}/productions/${production.id}`,
        {
          method: 'DELETE'
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'No se pudo eliminar la producción.'
        );
      }

      setProductions(previous =>
        previous.filter(item => item.id !== production.id)
      );

      setDeleteCandidate(null);
      setActiveMenu(null);

      notify('Producción eliminada correctamente.');

    } catch (err) {
      notify(`Error: ${err.message}`);

    } finally {
      setDeleting(false);
    }
  }

  // =====================================
  // DUPLICAR PRODUCCIÓN
  // =====================================

  async function handleDuplicateProduction(production) {
    try {
      setActiveMenu(null);

      const detailResponse = await fetch(
        `${API}/productions/${production.id}`
      );

      if (!detailResponse.ok) {
        throw new Error('No se pudo consultar la producción original.');
      }

      const original = await detailResponse.json();

      const response = await fetch(
        `${API}/productions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: `${original.title} (Copia)`,
            description: original.description,
            script: original.script
          })
        }
      );

      const duplicated = await response.json();

      if (!response.ok) {
        throw new Error(
          duplicated.error || 'No se pudo duplicar la producción.'
        );
      }

      setProductions(previous => [duplicated, ...previous]);
      notify('Producción duplicada correctamente.');

    } catch (err) {
      notify(`Error: ${err.message}`);
    }
  }

  // =====================================
  // ESTADÍSTICAS
  // =====================================

  const total = productions.length;

  const completed = productions.filter(
    item => item.status === 'completed'
  ).length;

  const processing = productions.filter(
    item => item.status === 'processing'
  ).length;

  const drafts = productions.filter(
    item => item.status === 'draft'
  ).length;

if (timelineProduction) {
  return (
    <SceneTimeline
      production={timelineProduction}
      onClose={() => setTimelineProduction(null)}
      onNotify={notify}
    />
  );
}

  // Mostrar Scene Manager como pantalla independiente
if (sceneProduction) {
  return (
    <SceneManager
      production={sceneProduction}
      onClose={() => setSceneProduction(null)}
      onNotify={notify}
    />
  );
}

if (assetProduction) {
  return (
    <AssetManager
      production={assetProduction}
      onClose={() => setAssetProduction(null)}
      onNotify={notify}
    />
  );
}

  // =====================================
  // INTERFAZ
  // =====================================

  return (
    <div className="app">

      {/* SIDEBAR */}
      <aside className="sidebar">

        <div className="brand">
          <div className="brand-icon">
            <Clapperboard size={23} />
          </div>

          <div>
            <strong>ROBLOX ENGINE</strong>
            <span>CONTENT STUDIO</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          <a className="nav-item active">
            <LayoutDashboard size={19} />
            Dashboard
          </a>

          <a className="nav-item">
            <Film size={19} />
            Producciones
          </a>

          <a className="nav-item">
            <FolderOpen size={19} />
            Biblioteca
          </a>
        </nav>

        <div className="nav-label settings-label">
          PREFERENCIAS
        </div>

        <nav>
          <a className="nav-item">
            <Settings size={19} />
            Configuración
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="engine-status">
            <span className="online-dot" />
            Motor local
            <span className="online-text">ONLINE</span>
          </div>

          <span className="version">
            ROBLOX CONTENT ENGINE v1.0
          </span>
        </div>

      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="main">

        {/* NOTIFICACIONES */}
        {notification && (
          <div
            className={`notification ${
              notification.startsWith('Error:')
                ? 'notification-error'
                : ''
            }`}
          >
            <span>{notification}</span>

            <button
              onClick={() => setNotification('')}
              aria-label="Cerrar notificación"
            >
              <X size={17} />
            </button>
          </div>
        )}

        <header className="topbar">

          <div className="breadcrumb">
            Workspace <span>/</span> Dashboard
          </div>

          <div className="top-actions">
            <button className="icon-button">
              <Bell size={19} />
            </button>

            <div className="avatar">JR</div>
          </div>

        </header>

        <section className="content">

          {/* BIENVENIDA */}
          <div className="welcome-row">

            <div>
              <div className="eyebrow">
                <Sparkles size={14} />
                CREATIVE PRODUCTION STUDIO
              </div>

              <h1>Centro de producción</h1>

              <p>
                Administra tus historias, episodios y proyectos audiovisuales.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => setShowForm(true)}
            >
              <Plus size={18} />
              Nueva producción
            </button>

          </div>

          {/* ESTADÍSTICAS */}
          <div className="stats-grid">

            <div className="stat-card">
              <div className="stat-top">
                <span>Total producciones</span>
                <Film size={19} />
              </div>

              <strong>{String(total).padStart(2, '0')}</strong>
              <small>Proyectos registrados</small>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Completadas</span>
                <CheckCircle2 size={19} />
              </div>

              <strong>{String(completed).padStart(2, '0')}</strong>
              <small>Producciones terminadas</small>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>En proceso</span>
                <LoaderCircle size={19} />
              </div>

              <strong>{String(processing).padStart(2, '0')}</strong>
              <small>Procesos activos</small>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Borradores</span>
                <Clock3 size={19} />
              </div>

              <strong>{String(drafts).padStart(2, '0')}</strong>
              <small>Historias pendientes</small>
            </div>

          </div>

          {/* LISTA DE PRODUCCIONES */}
          <section className="production-section">

            <div className="section-heading">

              <div>
                <h2>Producciones recientes</h2>
                <p>Consulta y administra tus proyectos.</p>
              </div>

              <button
                className="secondary-button"
                onClick={loadProductions}
              >
                <Search size={16} />
                Actualizar
              </button>

            </div>

            <div className="production-list">

              {loading && (
                <p>Cargando producciones...</p>
              )}

              {error && (
                <p className="error-message">
                  {error}. Comprueba que el servidor esté activo.
                </p>
              )}

              {!loading && !error && productions.length === 0 && (
                <p>No hay producciones registradas.</p>
              )}

              {!loading && productions.map(production => (

                <article
                  className="production-card"
                  key={production.id}
                >

                  <div className="production-art">
                    <Clapperboard size={27} />
                  </div>

                  <div className="production-info">

                    <span className="production-series">
                      {production.description || 'Sin descripción'}
                    </span>

                    <h3>{production.title}</h3>

                    <span className="production-date">
                      {production.created_at}
                    </span>

                  </div>

                  <Status status={production.status} />

                  {/* ACCIONES DE PRODUCCIÓN */}
                  <div className="production-actions">
                  <button
                    className="production-action-button"
                    onClick={() => setSceneProduction(production)}
                  >
                    <Film size={16} />
                    Administrar escenas
                  </button>
                  <button
                    className="production-action-button"
                    onClick={() => setAssetProduction(production)}
                  >
                    <FolderOpen size={16} />
                    Biblioteca de recursos
                  </button>

                  <button
                    className="production-action-button"
                    onClick={() => setTimelineProduction(production)}
                  >
                    <Clock3 size={16} />
                    Timeline
                  </button>
                    {production.status === 'processing' ? (

                      <button
                        className="production-action-button processing-button"
                        disabled
                      >
                        <LoaderCircle size={16} />
                        Procesando
                      </button>

                    ) : (

                      <button
                        className="production-action-button generate-button"
                        onClick={() => handleGenerateVideo(production)}
                        disabled={generatingIds.includes(production.id)}
                      >
                        {generatingIds.includes(production.id) ? (
                          <>
                            <LoaderCircle size={16} />
                            Iniciando...
                          </>
                        ) : (
                          <>
                            <Play size={16} />
                            {production.status === 'completed'
                              ? 'Regenerar'
                              : 'Generar vídeo'}
                          </>
                        )}
                      </button>

                    )}

                    {production.status === 'completed' && (
                      <button
                        className="production-action-button watch-button"
                        onClick={() => handleOpenVideo(production)}
                      >
                        <Video size={16} />
                        Ver vídeo
                      </button>
                    )}

                  </div>

                  {/* MENÚ DE OPCIONES */}
                  <div className="production-menu-container">

                    <button
                      className="icon-button more-button"
                      onClick={() =>
                        setActiveMenu(
                          activeMenu === production.id
                            ? null
                            : production.id
                        )
                      }
                      aria-label="Opciones de producción"
                    >
                      <MoreHorizontal size={20} />
                    </button>

                    {activeMenu === production.id && (

                      <div className="production-dropdown">

                        <button
                          onClick={() => handleEditProduction(production)}
                        >
                          <Film size={16} />
                          Editar episodio
                        </button>

                        <button
                          onClick={() => handleDuplicateProduction(production)}
                        >
                          <Plus size={16} />
                          Duplicar episodio
                        </button>

                        <button
                          onClick={() => handleViewHistory(production)}
                        >
                          <History size={16} />
                          Ver historial
                        </button>

                        <button
                          className="delete-option"
                          onClick={() => {
                            setDeleteCandidate(production);
                            setActiveMenu(null);
                          }}
                        >
                          <Trash2 size={16} />
                          Eliminar episodio
                        </button>

                      </div>

                    )}

                  </div>

                </article>

              ))}

            </div>

          </section>

          {/* SIGUIENTE EPISODIO */}
          <section className="next-section">

            <div className="next-icon">
              <Play size={22} />
            </div>

            <div>
              <h3>Tu próximo episodio comienza aquí</h3>

              <p>
                Crea una historia y prepara tu siguiente producción audiovisual.
              </p>
            </div>

            <Sparkles className="next-sparkle" size={25} />

          </section>

        </section>

      </main>

      {/* FORMULARIO DE CREACIÓN */}
      {showForm && (
        <ProductionForm
          onCreated={handleProductionCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* FORMULARIO DE EDICIÓN */}
      {editingProduction && (
        <ProductionForm
          production={editingProduction}
          onSaved={handleProductionUpdated}
          onCancel={() => setEditingProduction(null)}
        />
      )}

      {/* REPRODUCTOR DE VÍDEO */}
      {videoProduction && (
        <div
          className="confirm-overlay"
          onClick={() => setVideoProduction(null)}
        >
          <section
            className="video-dialog"
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(900px, 94vw)',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '24px',
              borderRadius: '16px',
              background: '#171525',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              <div>
                <span className="form-eyebrow">
                  <Video size={14} />
                  REPRODUCTOR DE PRODUCCIÓN
                </span>

                <h2 style={{ margin: '8px 0' }}>
                  {videoProduction.title}
                </h2>
              </div>

              <button
                className="icon-button"
                onClick={() => setVideoProduction(null)}
                aria-label="Cerrar reproductor"
              >
                <X size={20} />
              </button>
            </div>

            <video
              key={videoProduction.id}
              controls
              autoPlay
              playsInline
              style={{
                display: 'block',
                width: '100%',
                maxHeight: '65vh',
                background: '#000',
                borderRadius: '10px'
              }}
            >
              <source
                src={`${API}/productions/${videoProduction.id}/video`}
                type="video/mp4"
              />

              Tu navegador no puede reproducir este vídeo.
            </video>

            <p style={{ color: '#aaa', fontSize: '13px', marginTop: '14px' }}>
              Archivo: renders/episode.mp4
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: '16px'
              }}
            >
              <button
                className="secondary-button"
                onClick={() => setVideoProduction(null)}
              >
                Cerrar reproductor
              </button>
            </div>
          </section>
        </div>
      )}

      {/* MODAL DE HISTORIAL */}
      {historyProduction && (
        <div
          className="confirm-overlay"
          onClick={() => {
            if (!historyLoading) setHistoryProduction(null);
          }}
        >
          <section
            className="history-dialog"
            onClick={event => event.stopPropagation()}
          >
            <div className="history-header">
              <div>
                <span className="form-eyebrow">
                  <History size={14} />
                  REGISTRO DE ACTIVIDAD
                </span>

                <h2>Historial de producción</h2>

                <p>{historyProduction.title}</p>
              </div>

              <button
                className="icon-button"
                onClick={() => setHistoryProduction(null)}
                aria-label="Cerrar historial"
              >
                <X size={20} />
              </button>
            </div>

            <div className="history-content">
              {historyLoading && (
                <p>Cargando historial...</p>
              )}

              {!historyLoading && historyEvents.length === 0 && (
                <p>No hay eventos registrados.</p>
              )}

              {!historyLoading && historyEvents.map(event => {
                const eventLabels = {
                  created: 'Producción creada',
                  updated: 'Producción editada',
                  status_changed: 'Cambio de estado',
                  generation_started: 'Generación iniciada',
                  generation_error: 'Error de generación'
                };

                return (
                  <div className="history-event" key={event.id}>
                    <div className="history-event-icon">
                      <History size={17} />
                    </div>

                    <div className="history-event-info">
                      <strong>
                        {eventLabels[event.event_type] || event.event_type}
                      </strong>

                      <p>{event.message}</p>

                      <span>{event.created_at}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="history-footer">
              <button
                className="secondary-button"
                onClick={() => setHistoryProduction(null)}
              >
                Cerrar
              </button>
            </div>
          </section>
        </div>
      )}

      {/* MODAL DE ELIMINACIÓN */}
      {deleteCandidate && (
        <div
          className="confirm-overlay"
          onClick={() => {
            if (!deleting) setDeleteCandidate(null);
          }}
        >
          <section
            className="confirm-dialog"
            onClick={event => event.stopPropagation()}
          >
            <div className="confirm-icon">
              <Trash2 size={25} />
            </div>

            <h2>¿Eliminar esta producción?</h2>

            <p>
              Estás a punto de eliminar
              <strong> "{deleteCandidate.title}"</strong>.
            </p>

            <span className="confirm-warning">
              Esta acción no se puede deshacer.
            </span>

            <div className="confirm-actions">

              <button
                className="secondary-button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deleting}
              >
                Cancelar
              </button>

              <button
                className="delete-confirm-button"
                onClick={() => handleDeleteProduction(deleteCandidate)}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <LoaderCircle size={16} />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Eliminar
                  </>
                )}
              </button>

            </div>
          </section>
        </div>
      )}

    </div>
  );
}

export default App;
