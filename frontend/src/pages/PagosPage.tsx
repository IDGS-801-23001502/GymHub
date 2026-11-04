import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { pagosApi } from '../api/servicios';
import type { Pago } from '../api/tipos';
import { useAuth } from '../auth/contexto';
import { IconoImprimir } from '../components/iconos';
import { Alerta, Campo, Cargando, Modal, Paginacion } from '../components/ui';
import { abrirComprobante } from '../utils/comprobante';
import { formatoFechaHora, formatoMoneda, METODOS_PAGO } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const POR_PAGINA = 25;

/** Consulta de pagos con comprobante y cancelación autorizada (CRM-RF-04). */
export function PagosPage() {
  const { usuario, puede } = useAuth();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? '';
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const idSede = params.get('sede') ?? '';
  const pagina = Number(params.get('pagina') ?? 1);
  const [cancelando, setCancelando] = useState<Pago | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const actualizar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) nuevos.set(k, v);
      else nuevos.delete(k);
    }
    setParams(nuevos, { replace: true });
  };

  const { datos, error, cargando, recargar } = useCarga(
    () =>
      pagosApi.listar({
        estado: (estado || undefined) as 'registrado' | 'cancelado' | undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        id_sede: idSede ? Number(idSede) : undefined,
        pagina,
        por_pagina: POR_PAGINA,
      }),
    `${estado}|${desde}|${hasta}|${idSede}|${pagina}`,
  );

  const totalPagina = datos?.datos.filter((p) => p.estado === 'registrado').reduce((s, p) => s + p.monto, 0) ?? 0;

  const comprobante = async (id: number) => {
    setErrores([]);
    try {
      await abrirComprobante(id);
    } catch (err) {
      setErrores(mensajesError(err));
    }
  };

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Pagos</h1>
          <p>Pagos registrados en tus sedes. Solo un administrador puede cancelar un pago.</p>
        </div>
      </div>

      <div className="filtros">
        <div className="campo">
          <label htmlFor="desde">Desde</label>
          <input id="desde" type="date" value={desde} onChange={(e) => actualizar({ desde: e.target.value, pagina: '' })} />
        </div>
        <div className="campo">
          <label htmlFor="hasta">Hasta</label>
          <input id="hasta" type="date" min={desde} value={hasta} onChange={(e) => actualizar({ hasta: e.target.value, pagina: '' })} />
        </div>
        <div className="campo">
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={estado} onChange={(e) => actualizar({ estado: e.target.value, pagina: '' })}>
            <option value="">Todos</option>
            <option value="registrado">Registrados</option>
            <option value="cancelado">Cancelados</option>
          </select>
        </div>
        {(usuario?.sedes.length ?? 0) > 1 && (
          <div className="campo">
            <label htmlFor="sede">Sede</label>
            <select id="sede" value={idSede} onChange={(e) => actualizar({ sede: e.target.value, pagina: '' })}>
              <option value="">Todas mis sedes</option>
              {usuario?.sedes.map((s) => <option key={s.id_sede} value={s.id_sede}>{s.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="espaciado">
        {mensaje && <Alerta tipo="ok">{mensaje}</Alerta>}
        <Alerta mensajes={errores} />
        <div className="tarjeta">
          {error && <div className="tarjeta-cuerpo"><Alerta mensajes={error.detalles} /></div>}
          {cargando && !datos ? (
            <Cargando />
          ) : datos?.datos.length === 0 ? (
            <div className="vacio">No hay pagos con esos filtros.</div>
          ) : (
            datos && (
              <>
                <div className="tabla-envoltura">
                  <table>
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>Fecha</th>
                        <th>Socio</th>
                        <th>Plan</th>
                        <th>Método</th>
                        <th className="num">Monto</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody style={{ opacity: cargando ? 0.6 : 1 }}>
                      {datos.datos.map((p) => (
                        <tr key={p.id_pago}>
                          <td className="mono">{p.folio}</td>
                          <td>
                            {formatoFechaHora(p.fecha_pago)}
                            <div className="muted pequeno">{p.sede.nombre} · {p.registrado_por.nombre}</div>
                          </td>
                          <td>
                            <Link to={`/socios/${p.socio.id_socio}?pestana=membresias`}>{p.socio.nombre}</Link>
                            <div className="muted pequeno mono">{p.socio.folio}</div>
                          </td>
                          <td>{p.plan.nombre}</td>
                          <td>
                            {METODOS_PAGO[p.metodo]}
                            {p.referencia && <div className="muted pequeno">Ref. {p.referencia}</div>}
                          </td>
                          <td className="num" style={p.estado === 'cancelado' ? { textDecoration: 'line-through', color: 'var(--texto-3)' } : undefined}>
                            {formatoMoneda(p.monto)}
                          </td>
                          <td>
                            {p.estado === 'registrado' ? (
                              <span className="badge badge-ok">Registrado</span>
                            ) : (
                              <span className="badge badge-neutro" title={p.motivo_cancelacion ?? undefined}>Cancelado</span>
                            )}
                            {p.estado === 'cancelado' && p.autorizado_por && (
                              <div className="muted pequeno">por {p.autorizado_por.nombre}</div>
                            )}
                          </td>
                          <td className="num">
                            <div className="fila" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                              <button className="btn btn-sm" onClick={() => comprobante(p.id_pago)} aria-label={`Comprobante ${p.folio}`}>
                                <IconoImprimir />
                              </button>
                              {puede() && p.estado === 'registrado' && (
                                <button className="btn btn-sm btn-peligro" onClick={() => setCancelando(p)}>
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="fila muted pequeno" style={{ padding: '10px 16px 0', justifyContent: 'flex-end' }}>
                  Total registrado en esta página: <strong style={{ color: 'var(--texto)' }}>{formatoMoneda(totalPagina)}</strong>
                </div>
                <Paginacion pagina={pagina} porPagina={POR_PAGINA} total={datos.total} alCambiar={(n) => actualizar({ pagina: String(n) })} />
              </>
            )
          )}
        </div>
      </div>

      {cancelando && (
        <CancelarPagoModal
          pago={cancelando}
          alCerrar={() => setCancelando(null)}
          alGuardar={() => {
            setMensaje(`Pago ${cancelando.folio} cancelado.`);
            setCancelando(null);
            recargar();
          }}
        />
      )}
    </>
  );
}

function CancelarPagoModal({ pago, alCerrar, alGuardar }: { pago: Pago; alCerrar: () => void; alGuardar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    setErrores([]);
    try {
      await pagosApi.cancelar(pago.id_pago, motivo.trim());
      alGuardar();
    } catch (err) {
      setErrores(mensajesError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Cancelar pago ${pago.folio}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="btn" onClick={alCerrar}>Volver</button>
          <button className="btn btn-peligro" onClick={confirmar} disabled={enviando || !motivo.trim()}>
            {enviando ? 'Cancelando…' : 'Cancelar pago'}
          </button>
        </>
      }
    >
      <p>
        {pago.socio.nombre} · {pago.plan.nombre} · <strong>{formatoMoneda(pago.monto)}</strong>
      </p>
      <Alerta tipo="aviso">
        El pago queda como cancelado (no se borra) y se registra quién lo autorizó. Si la membresía ya no tiene pagos
        vigentes, también se cancela.
      </Alerta>
      <Alerta mensajes={errores} />
      <Campo etiqueta="Motivo de la cancelación">
        {(p) => <textarea {...p} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
    </Modal>
  );
}
