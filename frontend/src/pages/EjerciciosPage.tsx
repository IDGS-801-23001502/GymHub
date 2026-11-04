import { useState, type FormEvent } from 'react';
import { urlArchivo } from '../api/cliente';
import { archivosApi } from '../api/crm';
import { ejerciciosApi, type EntradaEjercicio } from '../api/servicios';
import { RESTRICCIONES, type Ejercicio } from '../api/tipos';
import { IconoMas } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { mensajesError, useCarga } from '../utils/useCarga';

const nombreGrupo = (g: string) => g.replace(/_/g, ' ');

/** Catálogo de ejercicios (CRM-RF-06). */
export function EjerciciosPage() {
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');
  const [inactivos, setInactivos] = useState(false);
  const [editando, setEditando] = useState<Ejercicio | 'nuevo' | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const grupos = useCarga(() => ejerciciosApi.grupos(), 'grupos');
  const { datos, error, cargando, recargar } = useCarga(
    () => ejerciciosApi.listar({ q: q.trim() || undefined, grupo_muscular: grupo || undefined, incluir_inactivos: inactivos }),
    `${q.trim()}|${grupo}|${inactivos}`,
  );

  const alternar = async (e: Ejercicio) => {
    setErrores([]);
    try {
      await ejerciciosApi.cambiarEstado(e.id, !e.activo);
      setMensaje(`“${e.nombre}” ${e.activo ? 'desactivado' : 'activado'}.`);
      recargar();
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Ejercicios</h1>
          <p>Catálogo reutilizable en cualquier plantilla. Las contraindicaciones se cruzan con la ficha de salud del socio.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setEditando('nuevo')}>
          <IconoMas /> Nuevo ejercicio
        </button>
      </div>

      <div className="filtros">
        <div className="campo busqueda">
          <label htmlFor="q">Buscar</label>
          <input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre del ejercicio" />
        </div>
        <div className="campo">
          <label htmlFor="grupo">Grupo muscular</label>
          <select id="grupo" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {grupos.datos?.map((g) => <option key={g} value={g}>{nombreGrupo(g)}</option>)}
          </select>
        </div>
        <label className="casilla" style={{ alignSelf: 'center' }}>
          <input type="checkbox" checked={inactivos} onChange={(e) => setInactivos(e.target.checked)} />
          Mostrar desactivados
        </label>
      </div>

      <div className="espaciado">
        {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
        <Alerta mensajes={errores} />
        <div className="tarjeta">
          {error && <div className="tarjeta-cuerpo"><Alerta mensajes={error.detalles} /></div>}
          {cargando && !datos ? (
            <Cargando />
          ) : datos?.length === 0 ? (
            <div className="vacio">No hay ejercicios con esos filtros.</div>
          ) : (
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Ejercicio</th>
                    <th>Grupo</th>
                    <th>Equipo</th>
                    <th>Contraindicaciones</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody style={{ opacity: cargando ? 0.6 : 1 }}>
                  {datos?.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.nombre}</strong>
                        {e.descripcion && <div className="muted pequeno">{e.descripcion}</div>}
                        {e.media_url && (
                          <a className="pequeno" href={urlArchivo(e.media_url) ?? undefined} target="_blank" rel="noreferrer noopener">
                            Ver {e.media_tipo === 'video' ? 'video' : 'imagen'}
                          </a>
                        )}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>{nombreGrupo(e.grupo_muscular)}</td>
                      <td>{e.equipo}</td>
                      <td>
                        <div className="chips">
                          {e.contraindicaciones.length === 0 && <span className="muted">—</span>}
                          {e.contraindicaciones.map((c) => (
                            <span key={c} className="badge badge-aviso">{RESTRICCIONES[c] ?? c}</span>
                          ))}
                        </div>
                      </td>
                      <td>{e.activo ? <span className="badge badge-ok">Activo</span> : <span className="badge badge-neutro">Desactivado</span>}</td>
                      <td className="num">
                        <div className="fila" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <button className="btn btn-sm" onClick={() => setEditando(e)}>Editar</button>
                          <button className={`btn btn-sm${e.activo ? ' btn-peligro' : ''}`} onClick={() => alternar(e)}>
                            {e.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editando && (
        <EjercicioModal
          ejercicio={editando === 'nuevo' ? null : editando}
          grupos={grupos.datos ?? []}
          alCerrar={() => setEditando(null)}
          alGuardar={(e) => {
            setEditando(null);
            setMensaje(`“${e.nombre}” guardado.`);
            recargar();
            grupos.recargar();
          }}
        />
      )}
    </>
  );
}

function EjercicioModal({
  ejercicio,
  grupos,
  alCerrar,
  alGuardar,
}: {
  ejercicio: Ejercicio | null;
  grupos: string[];
  alCerrar: () => void;
  alGuardar: (e: Ejercicio) => void;
}) {
  const [f, setF] = useState({
    nombre: ejercicio?.nombre ?? '',
    grupo_muscular: ejercicio?.grupo_muscular ?? '',
    equipo: ejercicio?.equipo ?? '',
    descripcion: ejercicio?.descripcion ?? '',
    media_url: ejercicio?.media_url ?? '',
    media_tipo: ejercicio?.media_tipo ?? 'imagen',
  });
  const [contra, setContra] = useState<string[]>(ejercicio?.contraindicaciones ?? []);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setSubiendo(true);
    setErrores([]);
    try {
      const r = await archivosApi.mediaEjercicio(archivo);
      setF((p) => ({ ...p, media_url: r.media_url, media_tipo: r.media_tipo }));
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setSubiendo(false);
    }
  };
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const alternar = (r: string) => setContra((c) => (c.includes(r) ? c.filter((x) => x !== r) : [...c, r]));
  // Etiquetas ya guardadas que no están en la lista estándar
  const extra = contra.filter((c) => !(c in RESTRICCIONES));

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    setEnviando(true);
    setErrores([]);
    const datos: EntradaEjercicio = {
      nombre: f.nombre.trim(),
      grupo_muscular: f.grupo_muscular.trim().toLowerCase().replace(/\s+/g, '_'),
      equipo: f.equipo.trim(),
      ...(f.descripcion.trim() && { descripcion: f.descripcion.trim() }),
      ...(f.media_url.trim() && { media_url: f.media_url.trim(), media_tipo: f.media_tipo as 'imagen' | 'video' }),
      contraindicaciones: contra,
    };
    try {
      alGuardar(ejercicio ? await ejerciciosApi.actualizar(ejercicio.id, datos) : await ejerciciosApi.crear(datos));
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={ejercicio ? `Editar ${ejercicio.nombre}` : 'Nuevo ejercicio'}
      alCerrar={alCerrar}
      ancho
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={() => guardar()} disabled={enviando || !f.nombre.trim() || !f.grupo_muscular.trim() || !f.equipo.trim()}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <form className="espaciado" onSubmit={guardar}>
        <Alerta mensajes={errores} />
        <div className="rejilla rejilla-3">
          <Campo etiqueta="Nombre">{(p) => <input {...p} maxLength={100} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />}</Campo>
          <Campo etiqueta="Grupo muscular" ayuda="Elige uno o escribe uno nuevo.">
            {(p) => (
              <>
                <input {...p} list="grupos-musculares" maxLength={40} value={f.grupo_muscular} onChange={(e) => set('grupo_muscular', e.target.value)} />
                <datalist id="grupos-musculares">
                  {grupos.map((g) => <option key={g} value={g} />)}
                </datalist>
              </>
            )}
          </Campo>
          <Campo etiqueta="Equipo">{(p) => <input {...p} maxLength={60} value={f.equipo} onChange={(e) => set('equipo', e.target.value)} placeholder="Mancuernas, ninguno…" />}</Campo>
        </div>
        <Campo etiqueta="Descripción">
          {(p) => <textarea {...p} maxLength={2000} value={f.descripcion} onChange={(e) => set('descripcion', e.target.value)} />}
        </Campo>
        <div className="rejilla rejilla-2">
          <Campo etiqueta="Imagen o video (opcional)" ayuda="Pega una URL o sube un archivo (JPG, PNG, WebP hasta 5 MB; MP4/WebM hasta 40 MB).">
            {(p) => (
              <div className="fila" style={{ flexWrap: 'nowrap' }}>
                <input {...p} value={f.media_url} onChange={(e) => set('media_url', e.target.value)} placeholder="https://…" />
                <label className="btn" style={{ flex: 'none' }}>
                  {subiendo ? 'Subiendo…' : 'Subir'}
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    disabled={subiendo}
                    onChange={(e) => void subir(e.target.files?.[0])}
                  />
                </label>
              </div>
            )}
          </Campo>
          <Campo etiqueta="Tipo de recurso">
            {(p) => (
              <select {...p} value={f.media_tipo} onChange={(e) => set('media_tipo', e.target.value)} disabled={!f.media_url.trim()}>
                <option value="imagen">Imagen</option>
                <option value="video">Video</option>
              </select>
            )}
          </Campo>
        </div>
        <div className="campo">
          <span className="pequeno" style={{ fontWeight: 600 }}>Contraindicaciones</span>
          <div className="chips" role="group" aria-label="Contraindicaciones">
            {[...Object.keys(RESTRICCIONES), ...extra].map((r) => (
              <button type="button" key={r} className="chip" aria-pressed={contra.includes(r)} onClick={() => alternar(r)}>
                {RESTRICCIONES[r] ?? r}
              </button>
            ))}
          </div>
          <span className="ayuda">No se sugerirá a socios cuya ficha de salud tenga alguna de estas restricciones.</span>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
