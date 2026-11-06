import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/crm';
import { Alerta, Cargando, Paginacion } from '../components/ui';
import { formatoFechaHora } from '../utils/formato';
import { useCarga } from '../utils/useCarga';

const ACCIONES: Record<string, { texto: string; clase: string }> = {
  consulta: { texto: 'Consulta', clase: 'badge-neutro' },
  crear: { texto: 'Alta', clase: 'badge-ok' },
  modificar: { texto: 'Cambio', clase: 'badge-info' },
  eliminar: { texto: 'Eliminación', clase: 'badge-error' },
  cancelar: { texto: 'Cancelación', clase: 'badge-aviso' },
  login: { texto: 'Inicio de sesión', clase: 'badge-neutro' },
  login_fallido: { texto: 'Acceso fallido', clase: 'badge-error' },
};
const POR_PAGINA = 50;

/** Bitácora de auditoría (CRM-RF-20): quién hizo qué, cuándo y desde dónde. */
export function BitacoraPage() {
  const [f, setF] = useState({ entidad: '', accion: '', desde: '', hasta: '', id_socio: '' });
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<number | null>(null);
  const consulta = { ...f, id_socio: f.id_socio || undefined, pagina, por_pagina: POR_PAGINA };
  const { datos, error, cargando } = useCarga(() => adminApi.bitacora(consulta), JSON.stringify(consulta));
  const cambiar = (k: keyof typeof f, v: string) => {
    setF({ ...f, [k]: v });
    setPagina(1);
  };

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Bitácora</h1>
          <p>Registro inalterable de altas, cambios, cancelaciones e inicios de sesión.</p>
        </div>
      </div>
      <div className="filtros">
        <div className="campo">
          <label htmlFor="b-entidad">Entidad</label>
          <select id="b-entidad" value={f.entidad} onChange={(e) => cambiar('entidad', e.target.value)}>
            <option value="">Todas</option>
            {datos?.entidades.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="b-accion">Acción</label>
          <select id="b-accion" value={f.accion} onChange={(e) => cambiar('accion', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACCIONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.texto}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="b-desde">Desde</label>
          <input id="b-desde" type="date" value={f.desde} onChange={(e) => cambiar('desde', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="b-hasta">Hasta</label>
          <input id="b-hasta" type="date" value={f.hasta} onChange={(e) => cambiar('hasta', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="b-socio">Id de socio</label>
          <input id="b-socio" inputMode="numeric" value={f.id_socio} onChange={(e) => cambiar('id_socio', e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      <div className="tarjeta">
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.registros.length ? (
          <div className="vacio">Sin registros con esos filtros.</div>
        ) : (
          <>
            <div className="tabla-envoltura">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>Socio</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.registros.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="clic" onClick={() => setAbierto(abierto === r.id ? null : r.id)} aria-expanded={abierto === r.id}>
                        <td className="pequeno">{formatoFechaHora(r.fecha)}</td>
                        <td>{r.usuario?.nombre ?? <span className="muted">Sistema / app</span>}</td>
                        <td>
                          <span className={`badge ${ACCIONES[r.accion]?.clase ?? 'badge-neutro'}`}>{ACCIONES[r.accion]?.texto ?? r.accion}</span>
                        </td>
                        <td className="mono pequeno">
                          {r.entidad}
                          {r.id_entidad && ` #${r.id_entidad}`}
                        </td>
                        <td>{r.socio ? <Link to={`/socios/${r.socio.id_socio}`}>{r.socio.nombre ?? `#${r.socio.id_socio}`}</Link> : '—'}</td>
                        <td className="mono pequeno">{r.ip ?? '—'}</td>
                      </tr>
                      {abierto === r.id && (
                        <tr>
                          <td colSpan={6} className="bg-superficie-2">
                            <div className="rejilla rejilla-2">
                              <div>
                                <div className="pequeno muted">Antes</div>
                                <pre className="json">{r.anterior === null ? '—' : JSON.stringify(r.anterior, null, 2)}</pre>
                              </div>
                              <div>
                                <div className="pequeno muted">Después</div>
                                <pre className="json">{r.nuevo === null ? '—' : JSON.stringify(r.nuevo, null, 2)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={pagina} porPagina={POR_PAGINA} total={datos.total} alCambiar={setPagina} />
          </>
        )}
      </div>
    </div>
  );
}
