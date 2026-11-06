import { useState } from 'react';
import { adminApi, asistenciaApi, interaccionesApi, TIPOS_ARCO, type TipoInteraccion } from '../../api/crm';
import type { SocioDetalle } from '../../api/tipos';
import { useAuth } from '../../auth/contexto';
import { Kpi } from '../../components/Graficas';
import { Alerta, Campo, Cargando, Modal } from '../../components/ui';
import { formatoFechaHora } from '../../utils/formato';
import { mensajesError, useCarga } from '../../utils/useCarga';

const TIPOS: Record<TipoInteraccion, { texto: string; clase: string }> = {
  nota: { texto: 'Nota', clase: 'badge-neutro' },
  llamada: { texto: 'Llamada', clase: 'badge-info' },
  notificacion: { texto: 'Notificación', clase: 'badge-info' },
  renovacion: { texto: 'Renovación', clase: 'badge-ok' },
  pago: { texto: 'Pago', clase: 'badge-ok' },
  cambio_rutina: { texto: 'Rutina', clase: 'badge-aviso' },
  otro: { texto: 'Otro', clase: 'badge-neutro' },
};

/** Línea de tiempo de interacciones (CRM-RF-15), visitas (CRM-RF-11) y solicitudes ARCO. */
export function SeguimientoTab({ socio }: { socio: SocioDetalle }) {
  const { puede } = useAuth();
  const [tipo, setTipo] = useState('');
  const historial = useCarga(() => interaccionesApi.listar(socio.id_socio, tipo || undefined), `int-${socio.id_socio}-${tipo}`);
  const visitas = useCarga(() => asistenciaApi.deSocio(socio.id_socio), `vis-${socio.id_socio}`);
  const [nueva, setNueva] = useState<'nota' | 'llamada'>('nota');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [arco, setArco] = useState(false);

  async function agregar() {
    if (!texto.trim()) return;
    setGuardando(true);
    setError([]);
    try {
      await interaccionesApi.agregar(socio.id_socio, nueva, texto.trim());
      setTexto('');
      historial.recargar();
    } catch (e) {
      setError(mensajesError(e));
    } finally {
      setGuardando(false);
    }
  }

  const v = visitas.datos;
  return (
    <div className="rejilla grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
      <div className="tarjeta">
        <div className="tarjeta-titulo">
          <h2>Historial de interacciones</h2>
          <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-42.5 min-h-8">
            <option value="">Todas</option>
            {Object.entries(TIPOS).map(([k, x]) => (
              <option key={k} value={k}>
                {x.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="tarjeta-cuerpo espaciado">
          {puede('recepcionista', 'entrenador') && (
            <div className="espaciado gap-2">
              <div className="chips">
                <button className="chip" aria-pressed={nueva === 'nota'} onClick={() => setNueva('nota')}>
                  Nota
                </button>
                <button className="chip" aria-pressed={nueva === 'llamada'} onClick={() => setNueva('llamada')}>
                  Llamada
                </button>
              </div>
              <textarea
                aria-label="Nueva interacción"
                placeholder={nueva === 'llamada' ? 'Resumen de la llamada…' : 'Escribe una nota sobre el socio…'}
                maxLength={1000}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <div className="fila justify-end">
                <button className="btn btn-primario btn-sm" disabled={!texto.trim() || guardando} onClick={() => void agregar()}>
                  Agregar
                </button>
              </div>
              <Alerta mensajes={error} />
            </div>
          )}
          {historial.error && <Alerta mensajes={historial.error.detalles} />}
          {historial.cargando && !historial.datos ? (
            <Cargando />
          ) : !historial.datos?.length ? (
            <div className="vacio">Sin interacciones registradas.</div>
          ) : (
            <ul className="linea">
              {historial.datos.map((i) => (
                <li key={i.id_interaccion}>
                  <div>
                    <div className="fila gap-2">
                      <span className={`badge ${TIPOS[i.tipo]?.clase ?? 'badge-neutro'}`}>{TIPOS[i.tipo]?.texto ?? i.tipo}</span>
                      <span className="pequeno muted">
                        {formatoFechaHora(i.fecha)} · {i.responsable}
                      </span>
                    </div>
                    <p className="mt-1">{i.descripcion}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="espaciado">
        <div className="kpis grid-cols-[1fr_1fr]">
          <Kpi etiqueta="Visitas 30 días" valor={v?.visitas_30_dias ?? '—'} />
          <Kpi etiqueta="Última visita" valor={<span className="text-[1rem]">{v?.ultima_visita ? formatoFechaHora(v.ultima_visita) : 'Nunca'}</span>} />
        </div>
        <div className="tarjeta">
          <div className="tarjeta-titulo">
            <h2>Visitas</h2>
          </div>
          {visitas.error && <Alerta mensajes={visitas.error.detalles} />}
          {!v ? (
            <Cargando />
          ) : !v.registros.length ? (
            <div className="vacio">Sin visitas registradas.</div>
          ) : (
            <div className="tabla-envoltura max-h-85">
              <table>
                <tbody>
                  {v.registros.map((r) => (
                    <tr key={r.id_asistencia}>
                      <td className="pequeno">{formatoFechaHora(r.fecha_hora)}</td>
                      <td className="pequeno muted">{r.sede}</td>
                      <td>
                        <span className={`badge ${r.estado_membresia === 'vigente' ? 'badge-ok' : r.estado_membresia === 'por_vencer' ? 'badge-aviso' : 'badge-error'}`}>
                          {r.metodo_registro === 'qr' ? 'QR' : 'Manual'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {puede('recepcionista') && (
          <div className="tarjeta tarjeta-cuerpo espaciado gap-2">
            <h3>Privacidad</h3>
            <p className="pequeno muted">Registra aquí si el socio pide acceder, corregir, cancelar u oponerse al uso de sus datos.</p>
            <button className="btn btn-sm" onClick={() => setArco(true)}>
              Registrar solicitud ARCO
            </button>
          </div>
        )}
      </div>
      {arco && (
        <ModalArco
          idSocio={socio.id_socio}
          alCerrar={() => setArco(false)}
          alGuardar={() => {
            setArco(false);
            historial.recargar();
          }}
        />
      )}
    </div>
  );
}

function ModalArco({ idSocio, alCerrar, alGuardar }: { idSocio: number; alCerrar: () => void; alGuardar: () => void }) {
  const [tipo, setTipo] = useState<keyof typeof TIPOS_ARCO>('acceso');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string[]>([]);
  async function guardar() {
    try {
      await adminApi.crearArco(idSocio, { tipo, descripcion: descripcion.trim() || undefined });
      alGuardar();
    } catch (e) {
      setError(mensajesError(e));
    }
  }
  return (
    <Modal
      titulo="Solicitud ARCO"
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={() => void guardar()}>
            Registrar
          </button>
        </>
      }
    >
      <Alerta mensajes={error} />
      <Campo etiqueta="Derecho">
        {(p) => (
          <select {...p} value={tipo} onChange={(e) => setTipo(e.target.value as keyof typeof TIPOS_ARCO)}>
            {Object.entries(TIPOS_ARCO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Campo etiqueta="Detalle">{(p) => <textarea {...p} maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}</Campo>
    </Modal>
  );
}
