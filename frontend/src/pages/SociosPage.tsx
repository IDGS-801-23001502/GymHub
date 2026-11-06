import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { sociosApi } from '../api/servicios';
import { useAuth } from '../auth/contexto';
import { IconoMas } from '../components/iconos';
import {
  Alerta,
  Avatar,
  Cargando,
  EstadoMembresiaBadge,
  EstadoSocioBadge,
  Paginacion,
} from '../components/ui';
import { formatoFecha } from '../utils/formato';
import { useCarga } from '../utils/useCarga';

const POR_PAGINA = 20;

/** Búsqueda de socios por nombre, folio, correo o teléfono (CRM-RF-01, CRM-RNF-05). */
export function SociosPage() {
  const { usuario, puede } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  // Por defecto solo activos; "todos" se guarda explícito en la URL
  const estadoUrl = params.get('estado');
  const estado: 'activo' | 'baja' | '' =
    estadoUrl === 'baja' ? 'baja' : estadoUrl === 'todos' ? '' : 'activo';
  const idSede = params.get('sede') ?? '';
  const pagina = Number(params.get('pagina') ?? 1);
  const [texto, setTexto] = useState(q);

  const actualizar = (cambios: Record<string, string>) => {
    const nuevos = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) nuevos.set(k, v);
      else nuevos.delete(k);
    }
    setParams(nuevos, { replace: true });
  };

  // Búsqueda con espera para no consultar en cada tecla
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (texto.trim() !== q) actualizar({ q: texto.trim(), pagina: '' });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const { datos, error, cargando } = useCarga(
    () =>
      sociosApi.buscar({
        q: q || undefined,
        estado: estado || undefined,
        id_sede: idSede ? Number(idSede) : undefined,
        pagina,
        por_pagina: POR_PAGINA,
      }),
    `${q}|${estado}|${idSede}|${pagina}`,
  );

  const sedes = usuario?.sedes ?? [];

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Socios</h1>
          <p>Busca por nombre, folio, correo o teléfono completo.</p>
        </div>
        {puede('recepcionista') && (
          <Link to="/socios/nuevo" className="btn btn-primario">
            <IconoMas /> Nuevo socio
          </Link>
        )}
      </div>

      <div className="filtros">
        <div className="campo busqueda">
          <label htmlFor="busqueda">Buscar</label>
          <input
            id="busqueda"
            type="search"
            placeholder="Ej. Laura, GH000012, laura@correo.com, 5512345678"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoFocus
          />
        </div>
        <div className="campo">
          <label htmlFor="estado">Estado</label>
          <select id="estado" value={estado} onChange={(e) => actualizar({ estado: e.target.value || 'todos', pagina: '' })}>
            <option value="activo">Activos</option>
            <option value="baja">Dados de baja</option>
            <option value="">Todos</option>
          </select>
        </div>
        {(sedes.length > 1 || usuario?.admin_general) && (
          <div className="campo">
            <label htmlFor="sede">Sede</label>
            <select id="sede" value={idSede} onChange={(e) => actualizar({ sede: e.target.value, pagina: '' })}>
              <option value="">Todas mis sedes</option>
              {sedes.map((s) => (
                <option key={s.id_sede} value={s.id_sede}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="tarjeta">
        {error && (
          <div className="tarjeta-cuerpo">
            <Alerta mensajes={error.detalles} />
          </div>
        )}
        {cargando && !datos ? (
          <Cargando />
        ) : datos && datos.datos.length === 0 ? (
          <div className="vacio">
            {q ? `No se encontraron socios para “${q}”.` : 'Aún no hay socios registrados.'}
          </div>
        ) : (
          datos && (
            <>
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr>
                      <th>Socio</th>
                      <th>Teléfono</th>
                      <th>Sede</th>
                      <th>Membresía</th>
                      <th>Vigente hasta</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody className={cargando ? 'opacity-60' : undefined}>
                    {datos.datos.map((s) => (
                      <tr
                        key={s.id_socio}
                        className="clic"
                        onClick={() => navigate(`/socios/${s.id_socio}`)}
                      >
                        <td>
                          <div className="persona">
                            <Avatar nombre={s.nombre} foto={s.foto_url} />
                            <div>
                              <Link to={`/socios/${s.id_socio}`} onClick={(e) => e.stopPropagation()}>
                                {s.nombre}
                              </Link>
                              <div className="sub mono">{s.folio}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{s.telefono_mascara}</td>
                        <td>{s.sede}</td>
                        <td>
                          <EstadoMembresiaBadge estado={s.membresia?.estado} />
                          {s.membresia && <div className="sub muted pequeno">{s.membresia.plan.nombre}</div>}
                        </td>
                        <td>
                          {s.membresia ? (
                            <>
                              {formatoFecha(s.membresia.vigente_hasta)}
                              {s.membresia.dias_restantes > 0 && (
                                <div className="muted pequeno">{s.membresia.dias_restantes} días</div>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <EstadoSocioBadge estado={s.estado} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                pagina={pagina}
                porPagina={POR_PAGINA}
                total={datos.total}
                alCambiar={(p) => actualizar({ pagina: String(p) })}
              />
            </>
          )
        )}
      </div>
    </>
  );
}
