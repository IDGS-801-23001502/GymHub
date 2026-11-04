import { useState } from 'react';
import { Link } from 'react-router-dom';
import { analiticaApi } from '../api/crm';
import { useAuth } from '../auth/contexto';
import { BarrasVerticales, Kpi } from '../components/Graficas';
import { IconoAsistencia, IconoDinero, IconoRiesgo, IconoSocios } from '../components/iconos';
import { Alerta, Cargando } from '../components/ui';
import { formatoFecha, formatoMoneda, hoyISO } from '../utils/formato';
import { useCarga } from '../utils/useCarga';

const PERIODOS = {
  mes: 'Este mes',
  '30': 'Últimos 30 días',
  '90': 'Últimos 90 días',
} as const;

function rango(periodo: keyof typeof PERIODOS) {
  const hoy = hoyISO();
  if (periodo === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Number(periodo) + 1);
  return { desde: d.toISOString().slice(0, 10), hasta: hoy };
}

/** Panel de indicadores del administrador (CRM-RF-16) con comparativo por sede (CRM-RF-19). */
export function PanelPage() {
  const { usuario } = useAuth();
  const [periodo, setPeriodo] = useState<keyof typeof PERIODOS>('mes');
  const [idSede, setIdSede] = useState<number | ''>('');
  const filtro = { ...rango(periodo), id_sede: idSede || undefined };
  const { datos, error, cargando } = useCarga(() => analiticaApi.panel(filtro), JSON.stringify(filtro));
  const i = datos?.indicadores;

  return (
    <div className="espaciado">
      <div className="encabezado">
        <div>
          <h1>Hola, {usuario?.nombre.split(' ')[0]} 👋</h1>
          <p>Así va el gimnasio {datos ? `del ${formatoFecha(datos.desde)} al ${formatoFecha(datos.hasta)}` : ''}.</p>
        </div>
        <div className="filtros" style={{ margin: 0 }}>
          <div className="chips" role="group" aria-label="Periodo">
            {(Object.keys(PERIODOS) as (keyof typeof PERIODOS)[]).map((p) => (
              <button key={p} className="chip" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}>
                {PERIODOS[p]}
              </button>
            ))}
          </div>
          {(usuario?.sedes.length ?? 0) > 1 && (
            <select aria-label="Sede" value={idSede} onChange={(e) => setIdSede(e.target.value ? Number(e.target.value) : '')} style={{ width: 180 }}>
              <option value="">Todas las sedes</option>
              {usuario?.sedes.map((s) => (
                <option key={s.id_sede} value={s.id_sede}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <Alerta mensajes={error.detalles} />}
      {cargando && !datos && <Cargando />}
      {i && datos && (
        <>
          <div className="tarjeta tarjeta-degradado tarjeta-cuerpo">
            <div className="fila" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="muted pequeno">SOCIOS ACTIVOS</div>
                <div style={{ fontSize: '2.6rem', fontWeight: 800, lineHeight: 1.1 }}>{i.socios_activos}</div>
                <div className="muted pequeno">
                  +{i.altas} altas · −{i.bajas} bajas en el periodo
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted pequeno">INGRESOS DEL PERIODO</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{formatoMoneda(i.ingresos)}</div>
              </div>
            </div>
          </div>

          <div className="kpis">
            <Kpi etiqueta="Asistencia hoy" valor={i.asistencia_hoy} icono={<IconoAsistencia />} sub={<Link to="/asistencia">Ir a recepción</Link>} />
            <Kpi etiqueta="Por vencer" valor={i.por_vencer} tono="aviso" icono={<IconoSocios />} sub="Membresías próximas a vencer" />
            <Kpi etiqueta="Vencidas" valor={i.vencidas} tono="error" icono={<IconoSocios />} sub="Socios activos sin renovar" />
            <Kpi
              etiqueta="En riesgo"
              valor={i.en_riesgo}
              tono="error"
              icono={<IconoRiesgo />}
              sub={
                <Link to="/riesgo">
                  {i.riesgo_por_motivo.inactividad ?? 0} inactivos · {i.riesgo_por_motivo.membresia_por_vencer ?? 0} por vencer
                </Link>
              }
            />
            <Kpi etiqueta="Altas" valor={i.altas} tono="ok" icono={<IconoSocios />} sub="Socios nuevos en el periodo" />
            <Kpi etiqueta="Ingresos" valor={formatoMoneda(i.ingresos)} icono={<IconoDinero />} sub="Pagos registrados" />
          </div>

          <div className="tarjeta">
            <div className="tarjeta-titulo">
              <h2>Visitas por día</h2>
              <span className="muted pequeno">{datos.asistencia_diaria.reduce((t, d) => t + d.visitas, 0)} en total</span>
            </div>
            <div className="tarjeta-cuerpo">
              <BarrasVerticales
                titulo="Visitas por día del periodo"
                datos={datos.asistencia_diaria.map((d) => ({ etiqueta: formatoFecha(d.fecha), valor: d.visitas }))}
                formato={(n) => `${n} visitas`}
              />
            </div>
          </div>

          {datos.por_sede.length > 1 && (
            <div className="tarjeta">
              <div className="tarjeta-titulo">
                <h2>Comparativo por sede</h2>
              </div>
              <div className="tabla-envoltura">
                <table>
                  <thead>
                    <tr>
                      <th>Sede</th>
                      <th className="num">Socios activos</th>
                      <th className="num">Asistencia hoy</th>
                      <th className="num">Visitas del periodo</th>
                      <th className="num">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.por_sede.map((s) => (
                      <tr key={s.id_sede}>
                        <td style={{ fontWeight: 600 }}>{s.nombre}</td>
                        <td className="num">{s.socios_activos}</td>
                        <td className="num">{s.asistencia_hoy}</td>
                        <td className="num">{s.visitas_periodo}</td>
                        <td className="num">{formatoMoneda(s.ingresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
