import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, ESTADOS_ARCO, TIPOS_ARCO, type SolicitudArco } from '../api/crm';
import { useAuth } from '../auth/contexto';
import { IconoDescargar } from '../components/iconos';
import { Alerta, Cargando } from '../components/ui';
import { formatoFechaHora } from '../utils/formato';
import { mensajesError, useCarga } from '../utils/useCarga';

const CLASES: Record<SolicitudArco['estado'], string> = {
  recibida: 'badge-aviso',
  en_proceso: 'badge-info',
  atendida: 'badge-ok',
  rechazada: 'badge-neutro',
};

/** Solicitudes de derechos ARCO de los socios (CRM-RNF-02, LFPDPPP). */
export function ArcoPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';
  const [estado, setEstado] = useState('');
  const { datos, error, cargando, recargar } = useCarga(() => adminApi.solicitudesArco(estado || undefined), `arco-${estado}`);
  const [errores, setErrores] = useState<string[]>([]);

  async function cambiar(s: SolicitudArco, nuevo: string) {
    try {
      await adminApi.atenderArco(s.id_solicitud, { estado: nuevo });
      recargar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  }

  async function exportar(s: SolicitudArco) {
    try {
      const datos = await adminApi.datosPersonales(s.socio.id_socio);
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `datos-${s.socio.folio}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErrores(mensajesError(e));
    }
  }

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Derechos ARCO</h1>
          <p>Acceso, rectificación, cancelación y oposición. Se registran desde el expediente del socio; el administrador las resuelve.</p>
        </div>
        <select aria-label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="w-50">
          <option value="">Todas</option>
          {Object.entries(ESTADOS_ARCO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <Alerta mensajes={error.detalles} />}
      <Alerta mensajes={errores} />
      <div className="tarjeta">
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.length ? (
          <div className="vacio">No hay solicitudes.</div>
        ) : (
          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Socio</th>
                  <th>Derecho</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Recibida</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.map((s) => (
                  <tr key={s.id_solicitud}>
                    <td>
                      <Link to={`/socios/${s.socio.id_socio}`}>{s.socio.nombre}</Link>
                      <div className="pequeno muted">{s.socio.folio}</div>
                    </td>
                    <td>{TIPOS_ARCO[s.tipo]}</td>
                    <td className="pequeno max-w-70">
                      {s.descripcion ?? '—'}
                    </td>
                    <td>
                      <span className={`badge ${CLASES[s.estado]}`}>{ESTADOS_ARCO[s.estado]}</span>
                      {s.atendida_por && <div className="pequeno muted">{s.atendida_por}</div>}
                    </td>
                    <td className="pequeno">{formatoFechaHora(s.creada_en)}</td>
                    <td>
                      {esAdmin && (
                        <div className="fila flex-nowrap justify-end">
                          {s.tipo === 'acceso' && (
                            <button className="btn btn-sm" onClick={() => void exportar(s)} title="Descarga todos los datos del socio">
                              <IconoDescargar /> Datos
                            </button>
                          )}
                          {(s.estado === 'recibida' || s.estado === 'en_proceso') && (
                            <select aria-label="Cambiar estado" value="" onChange={(e) => e.target.value && void cambiar(s, e.target.value)} className="w-37.5 min-h-8">
                              <option value="">Resolver…</option>
                              {s.estado === 'recibida' && <option value="en_proceso">En proceso</option>}
                              <option value="atendida">Atendida</option>
                              <option value="rechazada">Rechazada</option>
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
