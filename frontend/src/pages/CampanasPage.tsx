import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  asistenciaApi,
  campanasApi,
  segmentosApi,
  type Campana,
  type CategoriaNotif,
  type EntradaCampana,
  type EstadoCampana,
  type SocioEncontrado,
} from '../api/crm';
import { IconoMas } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { formatoFechaHora } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const CATEGORIAS: Record<CategoriaNotif, string> = {
  promociones: 'Promociones',
  avisos: 'Avisos del gimnasio',
  vencimiento: 'Vencimiento de membresía',
  rutina: 'Rutina',
};
const ESTADOS: Record<EstadoCampana, { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'badge-neutro' },
  programada: { texto: 'Programada', clase: 'badge-info' },
  procesando: { texto: 'Enviando', clase: 'badge-aviso' },
  enviada: { texto: 'Enviada', clase: 'badge-ok' },
  cancelada: { texto: 'Cancelada', clase: 'badge-neutro' },
};
const ESTADOS_ENVIO = { pendiente: 'Pendiente', enviado: 'Enviado', entregado: 'Entregado', fallido: 'Fallido' } as const;

function Envios({ e }: { e: Campana['envios'] }) {
  const total = e.pendiente + e.enviado + e.entregado + e.fallido;
  if (!total) return <span className="muted pequeno">—</span>;
  return (
    <div className="pequeno" style={{ minWidth: 160 }}>
      <div className="barra" style={{ display: 'flex' }} aria-hidden="true">
        <span style={{ width: `${((e.entregado + e.enviado) / total) * 100}%` }} />
      </div>
      <div className="muted" style={{ marginTop: 4 }}>
        {e.entregado} entregados · {e.enviado} enviados · {e.pendiente} pendientes
        {e.fallido > 0 && <span style={{ color: 'var(--error)' }}> · {e.fallido} fallidos</span>}
      </div>
    </div>
  );
}

/** Campañas de notificaciones push (CRM-RF-14). */
export function CampanasPage() {
  const { datos, error, cargando, recargar } = useCarga(() => campanasApi.listar(), 'campanas');
  const [nueva, setNueva] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);

  // Mientras hay envíos en curso, se actualiza cada 10 s
  const enCurso = datos?.some((c) => c.estado === 'procesando' || c.envios.pendiente > 0 || c.estado === 'programada');
  useEffect(() => {
    if (!enCurso) return;
    const t = window.setInterval(recargar, 10_000);
    return () => window.clearInterval(t);
  }, [enCurso, recargar]);

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Campañas</h1>
          <p>Notificaciones push a un socio o a un segmento, al momento o programadas. Solo llegan a quien aceptó recibirlas.</p>
        </div>
        <button className="btn btn-primario" onClick={() => setNueva(true)}>
          <IconoMas /> Nueva campaña
        </button>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      <div className="tarjeta">
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <div className="vacio">Aún no hay campañas.</div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Destino</th>
                  <th>Estado</th>
                  <th>Envíos</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((c) => (
                  <tr key={c.id_campana} className="clic" onClick={() => setDetalle(c.id_campana)}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.titulo}</div>
                      <div className="pequeno muted">{CATEGORIAS[c.categoria]}</div>
                    </td>
                    <td>
                      {c.destino}
                      <div className="pequeno muted">{c.tipo_destino === 'socio' ? 'Socio' : 'Segmento'}</div>
                    </td>
                    <td>
                      <span className={`badge ${ESTADOS[c.estado].clase}`}>{ESTADOS[c.estado].texto}</span>
                    </td>
                    <td>
                      <Envios e={c.envios} />
                    </td>
                    <td className="pequeno">
                      {c.estado === 'programada' ? `Sale ${formatoFechaHora(c.programada_para)}` : formatoFechaHora(c.creada_en)}
                      <div className="muted">{c.creada_por}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {nueva && (
        <NuevaCampana
          alCerrar={() => setNueva(false)}
          alGuardar={(id) => {
            setNueva(false);
            recargar();
            setDetalle(id);
          }}
        />
      )}
      {detalle !== null && <DetalleCampana id={detalle} alCerrar={() => setDetalle(null)} alCambiar={recargar} />}
    </div>
  );
}

function DetalleCampana({ id, alCerrar, alCambiar }: { id: number; alCerrar: () => void; alCambiar: () => void }) {
  const { datos: c, error, recargar } = useCarga(() => campanasApi.detalle(id), `campana-${id}`);
  const [errores, setErrores] = useState<string[]>([]);
  const accion = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      recargar();
      alCambiar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  };
  return (
    <Modal titulo={c?.titulo ?? 'Campaña'} alCerrar={alCerrar} ancho>
      {error && <Alerta mensajes={error.detalles} />}
      <Alerta mensajes={errores} />
      {!c ? (
        <Cargando />
      ) : (
        <>
          <div className="fila">
            <span className={`badge ${ESTADOS[c.estado].clase}`}>{ESTADOS[c.estado].texto}</span>
            <span className="pequeno muted">
              {CATEGORIAS[c.categoria]} · {c.destino}
              {c.programada_para && ` · programada para ${formatoFechaHora(c.programada_para)}`}
            </span>
          </div>
          <div className="tarjeta tarjeta-cuerpo" style={{ background: 'var(--superficie-2)' }}>
            <div style={{ fontWeight: 700 }}>{c.titulo}</div>
            <p className="muted">{c.contenido}</p>
          </div>
          <div className="fila">
            {(c.estado === 'borrador' || c.estado === 'programada') && (
              <>
                <button className="btn btn-primario" onClick={() => void accion(() => campanasApi.enviar(id))}>
                  Enviar ahora
                </button>
                <button className="btn btn-peligro" onClick={() => confirm('¿Cancelar la campaña?') && void accion(() => campanasApi.cancelar(id))}>
                  Cancelar campaña
                </button>
              </>
            )}
            {c.envios.fallido > 0 && (
              <button className="btn" onClick={() => void accion(() => campanasApi.reintentar(id))}>
                Reintentar {c.envios.fallido} fallidos
              </button>
            )}
          </div>
          <Envios e={c.envios} />
          {c.notificaciones.length > 0 && (
            <div className="tabla-envoltura" style={{ maxHeight: 320 }}>
              <table>
                <thead>
                  <tr>
                    <th>Socio</th>
                    <th>Estado</th>
                    <th>Enviada</th>
                    <th>Leída</th>
                  </tr>
                </thead>
                <tbody>
                  {c.notificaciones.map((n) => (
                    <tr key={n.id_notificacion}>
                      <td>
                        <Link to={`/socios/${n.socio.id_socio}`}>{n.socio.nombre}</Link>
                      </td>
                      <td>
                        <span className={`badge ${n.estado === 'fallido' ? 'badge-error' : n.estado === 'pendiente' ? 'badge-aviso' : 'badge-ok'}`}>
                          {ESTADOS_ENVIO[n.estado]}
                        </span>
                        {n.error && <div className="pequeno muted">{n.error}</div>}
                      </td>
                      <td className="pequeno">{formatoFechaHora(n.enviada_en)}</td>
                      <td className="pequeno">{formatoFechaHora(n.leida_en)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function NuevaCampana({ alCerrar, alGuardar }: { alCerrar: () => void; alGuardar: (id: number) => void }) {
  const segmentos = useCarga(() => segmentosApi.listar(), 'segmentos-campana');
  const [d, setD] = useState<EntradaCampana>({ titulo: '', contenido: '', categoria: 'promociones', tipo_destino: 'segmento', modo_envio: 'inmediato' });
  const [socio, setSocio] = useState<SocioEncontrado | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [encontrados, setEncontrados] = useState<{ q: string; lista: SocioEncontrado[] }>({ q: '', lista: [] });
  const resultados = busqueda.trim().length >= 2 && encontrados.q === busqueda ? encontrados.lista : [];
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (busqueda.trim().length < 2) return;
    let vigente = true;
    const t = window.setTimeout(
      () => void asistenciaApi.buscar(busqueda).then((lista) => vigente && setEncontrados({ q: busqueda, lista })).catch(() => undefined),
      250,
    );
    return () => {
      vigente = false;
      window.clearTimeout(t);
    };
  }, [busqueda]);

  async function guardar(borrador: boolean) {
    setGuardando(true);
    setError([]);
    try {
      const c = await campanasApi.crear({
        ...d,
        id_socio_destino: d.tipo_destino === 'socio' ? socio?.id_socio : undefined,
        id_segmento: d.tipo_destino === 'segmento' ? d.id_segmento : undefined,
        programada_para: d.modo_envio === 'programado' && d.programada_para ? new Date(d.programada_para).toISOString() : undefined,
        borrador: borrador || undefined,
      });
      alGuardar(c.id_campana);
    } catch (e) {
      setError(mensajesError(e));
      setGuardando(false);
    }
  }

  const segmento = segmentos.datos?.find((s) => s.id_segmento === d.id_segmento);
  return (
    <Modal
      titulo="Nueva campaña"
      alCerrar={alCerrar}
      ancho
      pie={
        <>
          <button className="btn" onClick={() => void guardar(true)} disabled={guardando}>
            Guardar borrador
          </button>
          <button className="btn btn-primario" onClick={() => void guardar(false)} disabled={guardando}>
            {d.modo_envio === 'programado' ? 'Programar' : 'Enviar ahora'}
          </button>
        </>
      }
    >
      <Alerta mensajes={error} />
      <div className="rejilla rejilla-2">
        <div className="espaciado">
          <Campo etiqueta="Título" ayuda={`${d.titulo.length}/120`}>
            {(p) => <input {...p} maxLength={120} value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} />}
          </Campo>
          <Campo etiqueta="Mensaje" ayuda={`${d.contenido.length}/500`}>
            {(p) => <textarea {...p} maxLength={500} value={d.contenido} onChange={(e) => setD({ ...d, contenido: e.target.value })} />}
          </Campo>
          <Campo etiqueta="Categoría" ayuda="El socio puede desactivar cada categoría desde la app.">
            {(p) => (
              <select {...p} value={d.categoria} onChange={(e) => setD({ ...d, categoria: e.target.value as CategoriaNotif })}>
                {Object.entries(CATEGORIAS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </div>
        <div className="espaciado">
          <div className="campo">
            <label>Destino</label>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={d.tipo_destino === 'segmento'} onClick={() => setD({ ...d, tipo_destino: 'segmento' })}>
                Segmento
              </button>
              <button type="button" className="chip" aria-pressed={d.tipo_destino === 'socio'} onClick={() => setD({ ...d, tipo_destino: 'socio' })}>
                Un socio
              </button>
            </div>
          </div>
          {d.tipo_destino === 'segmento' ? (
            <Campo etiqueta="Segmento" ayuda={segmento ? `${segmento.total} socios hoy (se recalcula al enviar)` : undefined}>
              {(p) => (
                <select {...p} value={d.id_segmento ?? ''} onChange={(e) => setD({ ...d, id_segmento: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Selecciona…</option>
                  {segmentos.datos?.map((s) => (
                    <option key={s.id_segmento} value={s.id_segmento}>
                      {s.nombre} ({s.total})
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          ) : socio ? (
            <div className="resultado-socio" style={{ cursor: 'default' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{socio.nombre}</div>
                <div className="pequeno muted">{socio.folio}</div>
              </div>
              <button className="btn btn-sm btn-texto" style={{ marginLeft: 'auto' }} onClick={() => setSocio(null)}>
                Cambiar
              </button>
            </div>
          ) : (
            <div className="espaciado" style={{ gap: 6 }}>
              <Campo etiqueta="Buscar socio">{(p) => <input {...p} placeholder="Nombre, teléfono o folio" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />}</Campo>
              {resultados.map((s) => (
                <button key={s.id_socio} className="resultado-socio" onClick={() => setSocio(s)}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                    <div className="pequeno muted">
                      {s.folio} · {s.sede}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="campo">
            <label>Envío</label>
            <div className="chips">
              <button type="button" className="chip" aria-pressed={d.modo_envio === 'inmediato'} onClick={() => setD({ ...d, modo_envio: 'inmediato' })}>
                Inmediato
              </button>
              <button type="button" className="chip" aria-pressed={d.modo_envio === 'programado'} onClick={() => setD({ ...d, modo_envio: 'programado' })}>
                Programado
              </button>
            </div>
          </div>
          {d.modo_envio === 'programado' && (
            <Campo etiqueta="Fecha y hora de envío">
              {(p) => <input {...p} type="datetime-local" value={d.programada_para ?? ''} onChange={(e) => setD({ ...d, programada_para: e.target.value })} />}
            </Campo>
          )}
          <div className="tarjeta tarjeta-cuerpo" style={{ background: 'var(--superficie-2)' }}>
            <div className="pequeno muted">Vista previa en el teléfono</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>{d.titulo || 'Título de la notificación'}</div>
            <div className="muted pequeno">{d.contenido || 'Mensaje…'}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
