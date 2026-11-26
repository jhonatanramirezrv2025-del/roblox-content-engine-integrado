
import { useState } from 'react';
import {
  X,
  Film,
  FileText,
  AlignLeft,
  LoaderCircle,
  Save
} from 'lucide-react';

function ProductionForm({ production = null, onSaved, onCreated, onCancel }) {
  const isEditing = Boolean(production);

  const [form, setForm] = useState({
    title: production?.title || '',
    description: production?.description || '',
    script: production?.script || ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(event) {
    const { name, value } = event.target;

    setForm(previous => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!form.title.trim() || !form.script.trim()) {
      setError('El título y el guion son obligatorios.');
      return;
    }

    try {
      setLoading(true);

      const url = isEditing
        ? `http://127.0.0.1:3005/productions/${production.id}`
        : 'http://127.0.0.1:3005/productions';

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'No se pudo guardar la producción.'
        );
      }

      if (onSaved) {
        onSaved(data);
      } else if (onCreated) {
        onCreated(data);
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form-overlay">
      <section className="production-form">
        <div className="form-header">
          <div>
            <span className="form-eyebrow">
              <Film size={14} />
              {isEditing ? 'EDITAR PROYECTO' : 'NUEVO PROYECTO'}
            </span>

            <h2>
              {isEditing ? 'Editar producción' : 'Crear producción'}
            </h2>

            <p>
              {isEditing
                ? 'Modifica los datos de esta historia.'
                : 'Registra una nueva historia en tu biblioteca.'}
            </p>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Cerrar formulario"
          >
            <X size={21} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="title">Título de la producción</label>

          <input
            id="title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Ej. Episodio 02 - La voz del bosque"
            maxLength={180}
            required
          />

          <label htmlFor="description">
            Descripción o nombre de la serie
          </label>

          <div className="form-field-icon">
            <AlignLeft size={17} />

            <input
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Ej. 99 Noches: El bosque no olvida"
            />
          </div>

          <label htmlFor="script">Guion de la historia</label>

          <div className="form-field-icon textarea-icon">
            <FileText size={17} />

            <textarea
              id="script"
              name="script"
              value={form.script}
              onChange={handleChange}
              placeholder="Escribe aquí el guion completo de tu historia..."
              rows={9}
              maxLength={15000}
              required
            />
          </div>

          <div className="form-hint">
            El guion se guardará en SQLite para futuras etapas de producción.
          </div>

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle size={17} />
                  Guardando...
                </>
              ) : (
                <>
                  {isEditing ? <Save size={17} /> : <Film size={17} />}
                  {isEditing ? 'Guardar cambios' : 'Crear producción'}
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default ProductionForm;
