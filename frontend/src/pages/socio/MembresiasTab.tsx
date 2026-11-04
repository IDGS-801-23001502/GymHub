import { useState } from 'react';
import { congelamientosApi } from '../../api/crm';
import { membresiasApi, planesApi } from '../../api/servicios';
import type { Membresia, MetodoPago, ResultadoAsignacion, SocioDetalle } from '../../api/tipos';
import { useAuth } from '../../auth/contexto';
import { IconoImprimir, IconoMas } from '../../components/iconos';
import { Alerta, Campo, Cargando, EstadoMembresiaBadge, Modal } from '../../components/ui';
import { abrirComprobante } from '../../utils/comprobante';
import { formatoFecha, formatoMoneda, hoyISO, METODOS_PAGO, sumarDias } from '../../utils/formato';
import { mensajesError, useCarga } from '../../utils/useCarga';

const MAX_DIAS_CONGELAMIENTO = Number(import.meta.env.VITE_CONGELAMIENTO_MAX_DIAS ?? 90);

/** Historial de membresías, asignación/renovación con cobro y congelamientos (CRM-RF-02 a CRM-RF-05). */
export function MembresiasTab({
  socio,
  abrirAsignar,
  alCambiar,
}: {
  socio: SocioDetalle;
  abrirAsignar: boolean;
  alCambiar: () => void;
}) {
  const { puede } = useAuth();
  const { datos, error, cargando, recargar } = useCarga(
    () => membresiasApi.historial(socio.id_socio),
    `mem-${socio.id_socio}`,
  );
  const [asignando, setAsignando] = useState(abrirAsignar && socio.estado === 'activo');
  const [congelando, setCongelando] = useState<Membresia | null>(null);
  const [resultado, setResultado] = useState<ResultadoAsignacion | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const operar = puede('recepcionista');

  const refrescar = () => {
    recargar();
    alCambiar();
  };

  const terminarCongelamiento = async (idCongelamiento: number, futuro: boolean) => {
    if (!confirm(futuro ? '¿Anular este congelamiento? Aún no empieza.' : '¿Terminar el congelamiento hoy? El socio vuelve a entrenar desde hoy.')) return;
    setErrores([]);
    try {
      const r = await congelamientosApi.terminar(idCongelamiento);
      setMensaje(
        `${r.anulado ? 'Congelamiento anulado' : 'Congelamiento terminado'}: se descontaron ${r.dias_devueltos} días. Nuevo vencimiento: ${formatoFecha(r.fecha_vencimiento)}.`,
      );
      refrescar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  };

  const comprobante = async (idPago: number) => {
    setErrores([]);
    try {
      await abrirComprobante(idPago);
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <Alerta mensajes={error.detalles} />;
  if (!datos) return null;

  const hoy = hoyISO();
  const actual = datos.resumen;
  const tieneVigente = actual && actual.estado !== 'vencida' && actual.estado !== 'cancelada';

  return (
    <div className="espaciado">
      {resultado && (
        <Alerta tipo="ok">
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <span>
              {resultado.es_renovacion ? 'Renovación' : 'Membresía'} <strong>{resultado.plan.nombre}</strong> registrada:
              del {formatoFecha(resultado.fecha_inicio)} al {formatoFecha(resultado.fecha_vencimiento)}
              {resultado.acumulada && ' (se acumula después de la vigencia actual)'}.
              {resultado.pago && ` Pago ${resultado.pago.folio} por ${formatoMoneda(resultado.pago.monto)}.`}
            </span>
            {resultado.pago && (
              <button className="btn btn-sm" onClick={() => comprobante(resultado.pago!.id_pago)}>
                <IconoImprimir /> Comprobante
              </button>
            )}
          </div>
        </Alerta>
      )}
      {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
      <Alerta mensajes={errores} />

      <div className="tarjeta">
        <div className="tarjeta-titulo">
          <h2>Membresías</h2>
          {operar && socio.estado === 'activo' && (
            <button className="btn btn-primario btn-sm" onClick={() => setAsignando(true)}>
              <IconoMas /> {tieneVigente ? 'Renovar' : 'Asignar membresía'}
            </button>
          )}
        </div>
        {datos.membresias.length === 0 ? (
          <div className="vacio">El socio no tiene membresías registradas.</div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Inicio</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th>Pagos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.membresias.map((m) => {
                  // Solo se congela una membresía en curso o futura, no cancelada
                  const congelable =
                    operar && m.estado !== 'cancelada' && m.estado !== 'congelada' && m.fecha_vencimiento >= hoy;
                  return (
                    <tr key={m.id_membresia}>
                      <td>
                        <strong>{m.plan.nombre}</strong>
                        <div className="muted pequeno">
                          {m.plan.duracion_dias} días{m.es_renovacion ? ' · renovación' : ''}
                        </div>
                        {m.congelamientos.map((c) => (
                          <div key={c.id_congelamiento} className="pequeno" style={{ color: 'var(--info)' }}>
                            Congelada {formatoFecha(c.fecha_inicio)} – {formatoFecha(c.fecha_fin)} (+{c.dias_extendidos} días)
                            {c.motivo ? ` · ${c.motivo}` : ''}
                            {operar && c.fecha_fin >= hoyISO() && (
                              <button
                                className="btn btn-sm btn-texto"
                                style={{ minHeight: 0, padding: '0 6px' }}
                                onClick={() => void terminarCongelamiento(c.id_congelamiento, c.fecha_inicio >= hoyISO())}
                              >
                                {c.fecha_inicio >= hoyISO() ? 'Anular' : 'Terminar hoy'}
                              </button>
                            )}
                          </div>
                        ))}
                      </td>
                      <td>{formatoFecha(m.fecha_inicio)}</td>
                      <td>{formatoFecha(m.fecha_vencimiento)}</td>
                      <td>
                        <EstadoMembresiaBadge estado={m.estado} />
                      </td>
                      <td>
                        {m.pagos.length === 0 && <span className="muted">—</span>}
                        {m.pagos.map((p) => (
                          <div key={p.id_pago} className="pequeno">
                            {operar ? (
                              <button className="btn-texto btn btn-sm" style={{ padding: 0, minHeight: 0 }} onClick={() => comprobante(p.id_pago)}>
                                {p.folio}
                              </button>
                            ) : (
                              <span className="mono">{p.folio}</span>
                            )}{' '}
                            {formatoMoneda(p.monto)} · {METODOS_PAGO[p.metodo]}
                            {p.estado === 'cancelado' && <span className="badge badge-neutro" style={{ marginLeft: 6 }}>Cancelado</span>}
                          </div>
                        ))}
                      </td>
                      <td className="num">
                        {congelable && (
                          <button className="btn btn-sm" onClick={() => setCongelando(m)}>
                            Congelar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {asignando && (
        <AsignarModal
          socio={socio}
          renovacion={!!tieneVigente}
          vigenteHasta={tieneVigente ? actual!.vigente_hasta : null}
          alCerrar={() => setAsignando(false)}
          alGuardar={(r) => {
            setAsignando(false);
            setMensaje(null);
            setResultado(r);
            refrescar();
          }}
        />
      )}
      {congelando && (
        <CongelarModal
          membresia={congelando}
          alCerrar={() => setCongelando(null)}
          alGuardar={(dias) => {
            setCongelando(null);
            setResultado(null);
            setMensaje(`Membresía congelada. Se extendió ${dias} días.`);
            refrescar();
          }}
        />
      )}
    </div>
  );
}

function AsignarModal({
  socio,
  renovacion,
  vigenteHasta,
  alCerrar,
  alGuardar,
}: {
  socio: SocioDetalle;
  renovacion: boolean;
  vigenteHasta: string | null;
  alCerrar: () => void;
  alGuardar: (r: ResultadoAsignacion) => void;
}) {
  const planes = useCarga(() => planesApi.listar(), 'planes-activos');
  const [idPlan, setIdPlan] = useState<number | null>(null);
  const [cobrarElegido, setCobrar] = useState(true);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const plan = planes.datos?.find((p) => p.id_plan === idPlan);
  const inicio = vigenteHasta ? sumarDias(vigenteHasta, 1) : hoyISO();
  const montoFinal = monto ? Number(monto) : plan?.precio;
  // El backend exige el pago cuando el plan tiene precio
  const pagoObligatorio = !plan || plan.precio > 0;
  const cobrar = pagoObligatorio || cobrarElegido;

  const confirmar = async () => {
    if (!plan) return;
    if (cobrar && metodo === 'transferencia' && !referencia.trim()) {
      setErrores(['La referencia es obligatoria para transferencias.']);
      return;
    }
    setEnviando(true);
    setErrores([]);
    try {
      const r = await membresiasApi.asignar(
        socio.id_socio,
        plan.id_plan,
        cobrar
          ? {
              metodo,
              monto: monto ? Number(monto) : undefined,
              referencia: referencia.trim() || undefined,
            }
          : undefined,
      );
      alGuardar(r);
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={renovacion ? `Renovar membresía de ${socio.nombre}` : `Asignar membresía a ${socio.nombre}`}
      alCerrar={alCerrar}
      ancho
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={confirmar} disabled={!plan || enviando}>
            {enviando ? 'Registrando…' : cobrar && montoFinal !== undefined ? `Cobrar ${formatoMoneda(montoFinal)}` : 'Asignar sin cobro'}
          </button>
        </>
      }
    >
      <Alerta mensajes={errores} />
      {renovacion && vigenteHasta && (
        <Alerta tipo="info">
          La membresía actual sigue vigente hasta el {formatoFecha(vigenteHasta)}. La renovación se acumula y empieza el{' '}
          {formatoFecha(inicio)}.
        </Alerta>
      )}
      {planes.cargando ? (
        <Cargando texto="Cargando planes…" />
      ) : planes.error ? (
        <Alerta mensajes={planes.error.detalles} />
      ) : planes.datos?.length === 0 ? (
        <Alerta tipo="aviso">No hay planes activos. Un administrador debe crearlos en “Planes”.</Alerta>
      ) : (
        <div className="rejilla rejilla-3" role="group" aria-label="Plan">
          {planes.datos?.map((p) => (
            <button key={p.id_plan} type="button" className="plan-opcion" aria-pressed={idPlan === p.id_plan} onClick={() => setIdPlan(p.id_plan)}>
              <strong>{p.nombre}</strong>
              <span className="precio">{formatoMoneda(p.precio)}</span>
              <span className="muted pequeno">{p.duracion_dias} días</span>
            </button>
          ))}
        </div>
      )}

      {plan && (
        <p className="muted pequeno">
          Vigencia: {formatoFecha(inicio)} al {formatoFecha(sumarDias(inicio, plan.duracion_dias - 1))}.
        </p>
      )}

      <label className="casilla">
        <input type="checkbox" checked={cobrar} disabled={pagoObligatorio} onChange={(e) => setCobrar(e.target.checked)} />
        Registrar el pago ahora{pagoObligatorio && plan ? ' (obligatorio para planes con costo)' : ''}
      </label>

      {cobrar && (
        <div className="rejilla rejilla-3">
          <Campo etiqueta="Método de pago">
            {(p) => (
              <select {...p} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
                {Object.entries(METODOS_PAGO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            )}
          </Campo>
          <Campo etiqueta="Monto" ayuda={plan ? `Precio del plan: ${formatoMoneda(plan.precio)}` : undefined}>
            {(p) => (
              <input {...p} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder={plan ? String(plan.precio) : ''} value={monto} onChange={(e) => setMonto(e.target.value)} />
            )}
          </Campo>
          <Campo etiqueta={metodo === 'transferencia' ? 'Referencia' : 'Referencia (opcional)'}>
            {(p) => <input {...p} maxLength={80} value={referencia} onChange={(e) => setReferencia(e.target.value)} />}
          </Campo>
        </div>
      )}
    </Modal>
  );
}

function CongelarModal({
  membresia,
  alCerrar,
  alGuardar,
}: {
  membresia: Membresia;
  alCerrar: () => void;
  alGuardar: (dias: number) => void;
}) {
  const hoy = hoyISO();
  const minimo = membresia.fecha_inicio > hoy ? membresia.fecha_inicio : hoy;
  const [inicio, setInicio] = useState(minimo);
  const [fin, setFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const dias = fin && inicio && fin >= inicio
    ? Math.round((Date.parse(fin) - Date.parse(inicio)) / 86_400_000) + 1
    : 0;

  const confirmar = async () => {
    setEnviando(true);
    setErrores([]);
    try {
      await membresiasApi.congelar(membresia.id_membresia, {
        fecha_inicio: inicio,
        fecha_fin: fin,
        motivo: motivo.trim() || undefined,
      });
      alGuardar(dias);
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Congelar ${membresia.plan.nombre}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primario" onClick={confirmar} disabled={enviando || dias < 1 || dias > MAX_DIAS_CONGELAMIENTO}>
            {enviando ? 'Guardando…' : 'Congelar'}
          </button>
        </>
      }
    >
      <p className="muted">
        La fecha de vencimiento se extiende por los días congelados y las renovaciones posteriores se recorren. Máximo{' '}
        {MAX_DIAS_CONGELAMIENTO} días.
      </p>
      <Alerta mensajes={errores} />
      <div className="rejilla rejilla-2">
        <Campo etiqueta="Desde">
          {(p) => <input {...p} type="date" min={minimo} max={membresia.fecha_vencimiento} value={inicio} onChange={(e) => setInicio(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Hasta" error={dias > MAX_DIAS_CONGELAMIENTO ? `Máximo ${MAX_DIAS_CONGELAMIENTO} días.` : undefined}>
          {(p) => <input {...p} type="date" min={inicio} value={fin} onChange={(e) => setFin(e.target.value)} />}
        </Campo>
      </div>
      {dias > 0 && (
        <p>
          <strong>{dias} días</strong>: vencerá el {formatoFecha(sumarDias(membresia.fecha_vencimiento, dias))}.
        </p>
      )}
      <Campo etiqueta="Motivo (opcional)">
        {(p) => <input {...p} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Viaje, lesión…" />}
      </Campo>
    </Modal>
  );
}
