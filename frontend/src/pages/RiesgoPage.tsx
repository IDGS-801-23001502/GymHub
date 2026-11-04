import { useState } from 'react';
import { Link } from 'react-router-dom';
import { riesgoApi, type ConfigRiesgo, type EstadoRiesgo, type Riesgo, type TipoAccion } from '../api/crm';
import { useAuth } from '../auth/contexto';
import { Kpi } from '../components/Graficas';
import { IconoRiesgo } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal } from '../components/ui';
import { formatoFechaHora } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const MOTIVOS = { inactividad: 'Inactividad', membresia_por_vencer: 'Membresía por vencer' };
const ESTADOS: Record<EstadoRiesgo, { texto: string; clase: string }> = {
  abierto: { texto: 'Abierto', clase: 'badge-error' },
  atendido: { texto: 'En seguimiento', clase: 'badge-aviso' },
  resuelto: { texto: 'Resuelto', clase: 'badge-ok' },
  descartado: { texto: 'Descartado', clase: 'badge-neutro' },
};
const ACCIONES: Record<TipoAccion, string> = {
  llamada: 'Llamada',
  notificacion: 'Notificación a la app',
  visita: 'Plática en el gimnasio',
  promocion: 'Promoción',
  otra: 'Otra',
};

/** Tablero de socios en riesgo de deserción (CRM-RF-13). */
export function RiesgoPage() {
  const { puede, usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';
  const [filtro, setFiltro] = useState<'pendientes' | EstadoRiesgo>('pendientes');
  const [motivo, setMotivo] = useState<'' | Riesgo['motivo']>('');
  const [atendiendo, setAtendiendo] = useState<Riesgo | null>(null);
  const [config, setConfig] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string[]>([]);
  const [evaluando, setEvaluando] = useState(false);
  const { datos, error: errorCarga, cargando, recargar } = useCarga(
    () => riesgoApi.tablero({ estado: filtro === 'pendientes' ? undefined : filtro }),
    filtro,
  );
  const lista = (datos ?? []).filter((r) => !motivo || r.motivo === motivo);

  async function evaluar() {
    setEvaluando(true);
    setError([]);
    try {
      const r = await riesgoApi.evaluar();
      setAviso(`Evaluación lista: ${r.evaluados} socios revisados, ${r.nuevos} casos nuevos, ${r.resueltos} resueltos y ${r.recordatorios} recordatorios enviados.`);
      recargar();
    } catch (e) {
      setError(mensajesError(e));
    } finally {
      setEvaluando(false);
    }
  }

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Riesgo de deserción</h1>
          <p>Socios con inactividad o membresía por vencer sin renovar. La detección corre sola cada 6 horas.</p>
        </div>
        {esAdmin && (
          <div className="fila">
            <button className="btn" onClick={() => setConfig(true)}>
              Configurar reglas
            </button>
            <button className="btn btn-primario" onClick={() => void evaluar()} disabled={evaluando}>
              {evaluando ? 'Evaluando…' : 'Evaluar ahora'}
            </button>
          </div>
        )}
      </div>
      {aviso && <Alerta tipo="ok">{aviso}</Alerta>}
      <Alerta mensajes={error} />

      {filtro === 'pendientes' && datos && (
        <div className="kpis">
          <Kpi etiqueta="Casos abiertos" valor={datos.filter((r) => r.estado === 'abierto').length} tono="error" icono={<IconoRiesgo />} />
          <Kpi etiqueta="En seguimiento" valor={datos.filter((r) => r.estado === 'atendido').length} tono="aviso" />
          <Kpi etiqueta="Por inactividad" valor={datos.filter((r) => r.motivo === 'inactividad').length} />
          <Kpi etiqueta="Por vencimiento" valor={datos.filter((r) => r.motivo === 'membresia_por_vencer').length} />
        </div>
      )}

      <div className="filtros" style={{ margin: 0 }}>
        <div className="chips" role="group" aria-label="Estado">
          {(['pendientes', 'resuelto', 'descartado'] as const).map((f) => (
            <button key={f} className="chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {f === 'pendientes' ? 'Pendientes' : ESTADOS[f].texto}
            </button>
          ))}
        </div>
        <select aria-label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)} style={{ width: 220 }}>
          <option value="">Todos los motivos</option>
          <option value="inactividad">Inactividad</option>
          <option value="membresia_por_vencer">Membresía por vencer</option>
        </select>
      </div>

      {errorCarga && <Alerta mensajes={errorCarga.detalles} />}
      {cargando && !datos ? (
        <Cargando />
      ) : !lista.length ? (
        <div className="tarjeta vacio">{filtro === 'pendientes' ? '🎉 No hay socios en riesgo pendientes.' : 'Sin registros.'}</div>
      ) : (
        <div className="rejilla rejilla-2">
          {lista.map((r) => (
            <div key={r.id_riesgo} className="riesgo-item">
              <div className="fila" style={{ justifyContent: 'space-between' }}>
                <div>
                  <Link to={`/socios/${r.socio.id_socio}`} style={{ fontWeight: 700 }}>
                    {r.socio.nombre}
                  </Link>
                  <div className="pequeno muted">
                    {r.socio.folio} · {r.socio.sede}
                  </div>
                </div>
                <span className={`badge ${ESTADOS[r.estado].clase}`}>{ESTADOS[r.estado].texto}</span>
              </div>
              <div className="fila">
                <span className={`badge ${r.motivo === 'inactividad' ? 'badge-info' : 'badge-aviso'}`}>{MOTIVOS[r.motivo]}</span>
                <span className="pequeno muted">Detectado {formatoFechaHora(r.detectado_en)}</span>
              </div>
              {r.detalle && <p className="pequeno">{r.detalle}</p>}
              {r.acciones.length > 0 && (
                <ul className="linea pequeno" style={{ marginTop: 4 }}>
                  {r.acciones.slice(0, 3).map((a) => (
                    <li key={a.id_accion}>
                      <div>
                        <b>{ACCIONES[a.tipo_accion]}</b> · {a.realizada_por} · <span className="muted">{formatoFechaHora(a.fecha)}</span>
                        {a.descripcion && <div className="muted">{a.descripcion}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {puede('recepcionista') && (r.estado === 'abierto' || r.estado === 'atendido') && (
                <div className="fila" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-primario" onClick={() => setAtendiendo(r)}>
                    Registrar acción
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {atendiendo && (
        <ModalAccion
          riesgo={atendiendo}
          alCerrar={() => setAtendiendo(null)}
          alGuardar={() => {
            setAtendiendo(null);
            recargar();
          }}
        />
      )}
      {config && <ModalConfig alCerrar={() => setConfig(false)} />}
    </div>
  );
}

function ModalAccion({ riesgo, alCerrar, alGuardar }: { riesgo: Riesgo; alCerrar: () => void; alGuardar: () => void }) {
  const [tipo, setTipo] = useState<TipoAccion>('llamada');
  const [descripcion, setDescripcion] = useState('');
  const [estado, setEstado] = useState<EstadoRiesgo>('atendido');
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (tipo === 'notificacion' && !descripcion.trim()) return setError(['Escribe el mensaje que recibirá el socio en la app.']);
    setGuardando(true);
    try {
      await riesgoApi.accion(riesgo.id_riesgo, { tipo_accion: tipo, descripcion: descripcion.trim() || undefined, estado });
      alGuardar();
    } catch (e) {
      setError(mensajesError(e));
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo={`Seguimiento: ${riesgo.socio.nombre}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={() => void guardar()} disabled={guardando}>
            Guardar
          </button>
        </>
      }
    >
      <Alerta mensajes={error} />
      <Campo etiqueta="Acción realizada">
        {(p) => (
          <select {...p} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAccion)}>
            {Object.entries(ACCIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Campo
        etiqueta={tipo === 'notificacion' ? 'Mensaje para el socio' : 'Notas'}
        ayuda={tipo === 'notificacion' ? 'Se envía como push a la app (si el socio la usa y aceptó notificaciones).' : 'Qué se habló o acordó.'}
      >
        {(p) => <textarea {...p} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
      </Campo>
      <Campo etiqueta="Estado del caso">
        {(p) => (
          <select {...p} value={estado} onChange={(e) => setEstado(e.target.value as EstadoRiesgo)}>
            <option value="atendido">En seguimiento</option>
            <option value="resuelto">Resuelto (el socio regresó o renovó)</option>
            <option value="descartado">Descartado</option>
          </select>
        )}
      </Campo>
    </Modal>
  );
}

function ModalConfig({ alCerrar }: { alCerrar: () => void }) {
  const { datos, error, recargar } = useCarga(() => riesgoApi.config(), 'config-riesgo');
  const [editando, setEditando] = useState<{ id_sede: number | null; nombre: string; valores: ConfigRiesgo } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  async function guardar() {
    if (!editando) return;
    try {
      await riesgoApi.guardarConfig({ ...editando.valores, id_sede: editando.id_sede });
      setEditando(null);
      recargar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  }

  return (
    <Modal titulo="Reglas de riesgo" alCerrar={alCerrar} ancho>
      {error && <Alerta mensajes={error.detalles} />}
      <Alerta mensajes={errores} />
      {!datos ? (
        <Cargando />
      ) : (
        <>
          <p className="muted pequeno">Cada sede usa su propia regla o, si no tiene, la general.</p>
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Ámbito</th>
                  <th className="num">Días sin asistir</th>
                  <th className="num">Días de aviso de vencimiento</th>
                  <th>Activa</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[{ id_sede: null as number | null, nombre: 'General (todas las sedes)', personalizada: true, ...datos.global }, ...datos.sedes].map((c) => (
                  <tr key={c.id_sede ?? 'g'}>
                    <td style={{ fontWeight: c.id_sede === null ? 700 : 400 }}>{c.nombre}</td>
                    {c.personalizada ? (
                      <>
                        <td className="num">{c.dias_inactividad}</td>
                        <td className="num">{c.dias_aviso_vencimiento}</td>
                        <td>{c.activa ? 'Sí' : 'No'}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="muted">
                        Usa la regla general
                      </td>
                    )}
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() =>
                          setEditando({
                            id_sede: c.id_sede,
                            nombre: c.nombre,
                            valores: {
                              dias_inactividad: c.dias_inactividad ?? datos.global.dias_inactividad,
                              dias_aviso_vencimiento: c.dias_aviso_vencimiento ?? datos.global.dias_aviso_vencimiento,
                              activa: c.activa ?? true,
                            },
                          })
                        }
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editando && (
            <div className="tarjeta tarjeta-cuerpo espaciado">
              <h3>{editando.nombre}</h3>
              <div className="rejilla rejilla-2">
                <Campo etiqueta="Días sin asistir para marcar riesgo">
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      min={1}
                      max={365}
                      value={editando.valores.dias_inactividad}
                      onChange={(e) => setEditando({ ...editando, valores: { ...editando.valores, dias_inactividad: Number(e.target.value) } })}
                    />
                  )}
                </Campo>
                <Campo etiqueta="Días antes del vencimiento">
                  {(p) => (
                    <input
                      {...p}
                      type="number"
                      min={1}
                      max={90}
                      value={editando.valores.dias_aviso_vencimiento}
                      onChange={(e) => setEditando({ ...editando, valores: { ...editando.valores, dias_aviso_vencimiento: Number(e.target.value) } })}
                    />
                  )}
                </Campo>
              </div>
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={editando.valores.activa}
                  onChange={(e) => setEditando({ ...editando, valores: { ...editando.valores, activa: e.target.checked } })}
                />
                Detección activa
              </label>
              <div className="fila" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button className="btn btn-primario" onClick={() => void guardar()}>
                  Guardar regla
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
