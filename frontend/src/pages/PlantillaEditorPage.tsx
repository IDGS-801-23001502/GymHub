import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { aBloquesEntrada, ejerciciosApi, plantillasApi } from '../api/servicios';
import { NIVELES, OBJETIVOS, type Bloque, type Ejercicio, type Nivel, type Objetivo, type Plantilla } from '../api/tipos';
import { EditorBloques } from '../components/Bloques';
import { validarBloques } from '../utils/bloques';
import { Alerta, Campo, Cargando } from '../components/ui';
import { mensajesError, useCarga } from '../utils/useCarga';

/** Alta y edición de una plantilla por bloques. */
export function PlantillaEditorPage() {
  const { id } = useParams();
  const nueva = !id || id === 'nueva';
  const plantilla = useCarga(() => (nueva ? Promise.resolve(null) : plantillasApi.obtener(id)), `plantilla-${id}`);
  const catalogo = useCarga(() => ejerciciosApi.listar({ incluir_inactivos: true }), 'catalogo');

  if ((!nueva && plantilla.cargando && !plantilla.datos) || (catalogo.cargando && !catalogo.datos)) return <Cargando />;
  if (plantilla.error) return <Alerta mensajes={plantilla.error.detalles} />;
  if (catalogo.error) return <Alerta mensajes={catalogo.error.detalles} />;

  return <Formulario key={id} plantilla={plantilla.datos} catalogo={catalogo.datos ?? []} />;
}

function Formulario({ plantilla, catalogo }: { plantilla: Plantilla | null; catalogo: Ejercicio[] }) {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState(plantilla?.nombre ?? '');
  const [objetivo, setObjetivo] = useState<Objetivo>(plantilla?.objetivo ?? 'salud_general');
  const [nivel, setNivel] = useState<Nivel>(plantilla?.nivel ?? 'principiante');
  const [dias, setDias] = useState(plantilla?.dias_semana ? String(plantilla.dias_semana) : '3');
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion ?? '');
  const [bloques, setBloques] = useState<Bloque[]>(
    plantilla?.bloques ?? [
      { tipo: 'calentamiento', ejercicios: [] },
      { tipo: 'fuerza', ejercicios: [] },
      { tipo: 'estiramiento', ejercicios: [] },
    ],
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const locales = [
      ...(nombre.trim().length < 2 ? ['El nombre debe tener al menos 2 caracteres.'] : []),
      ...validarBloques(bloques),
    ];
    setErrores(locales);
    if (locales.length) return;
    setEnviando(true);
    const datos = {
      nombre: nombre.trim(),
      objetivo,
      nivel,
      dias_semana: Number(dias),
      ...(descripcion.trim() && { descripcion: descripcion.trim() }),
      bloques: aBloquesEntrada(bloques),
    };
    try {
      if (plantilla) await plantillasApi.actualizar(plantilla.id, datos);
      else await plantillasApi.crear(datos);
      navigate('/plantillas');
    } catch (err) {
      setErrores(mensajesError(err));
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="pequeno" style={{ marginBottom: 12 }}>
        <Link to="/plantillas">← Plantillas</Link>
      </div>
      <form className="espaciado" onSubmit={guardar} noValidate>
        <div className="encabezado" style={{ marginBottom: 0 }}>
          <div>
            <h1>{plantilla ? `Editar ${plantilla.nombre}` : 'Nueva plantilla'}</h1>
            {plantilla && <p>Los cambios aplican a asignaciones nuevas; las rutinas ya asignadas conservan su versión.</p>}
          </div>
          <div className="fila">
            <Link to="/plantillas" className="btn">Cancelar</Link>
            <button type="submit" className="btn btn-primario" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Guardar plantilla'}
            </button>
          </div>
        </div>
        <Alerta mensajes={errores} />

        <div className="tarjeta tarjeta-cuerpo espaciado">
          <div className="rejilla rejilla-2">
            <Campo etiqueta="Nombre">{(p) => <input {...p} maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} />}</Campo>
            <div className="rejilla rejilla-3">
              <Campo etiqueta="Objetivo">
                {(p) => (
                  <select {...p} value={objetivo} onChange={(e) => setObjetivo(e.target.value as Objetivo)}>
                    {Object.entries(OBJETIVOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Nivel">
                {(p) => (
                  <select {...p} value={nivel} onChange={(e) => setNivel(e.target.value as Nivel)}>
                    {Object.entries(NIVELES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </Campo>
              <Campo etiqueta="Días por semana">
                {(p) => <input {...p} type="number" min={1} max={7} value={dias} onChange={(e) => setDias(e.target.value)} />}
              </Campo>
            </div>
          </div>
          <Campo etiqueta="Descripción (opcional)">
            {(p) => <textarea {...p} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
          </Campo>
        </div>

        <div className="tarjeta tarjeta-cuerpo espaciado">
          <h2>Bloques</h2>
          <EditorBloques bloques={bloques} alCambiar={setBloques} catalogo={catalogo} />
        </div>
      </form>
    </>
  );
}
